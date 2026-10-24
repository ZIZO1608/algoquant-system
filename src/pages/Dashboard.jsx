import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { PageLoading } from '../components/Skeleton';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import {
  formatRelativeTime,
  formatAmount,
  formatMinor,
  formatDateTime,
  formatWeekday,
  getCurrencyLabel,
  initials,
  trackName,
  LEAD_STATUSES,
} from '../utils/formatters';
import { courseProgress } from '../utils/courses';
import { reportsApi, financeApi } from '../api/client';
import {
  AlertIcon,
  ArrowForwardIcon,
  BookIcon,
  CalendarIcon,
  CoinsIcon,
  ImageIcon,
  LayersIcon,
  StarIcon,
  TasksIcon,
  TrendUpIcon,
  UsersIcon,
  WalletIcon,
} from '../components/icons';
import './Dashboard.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const URGENT_WITHIN_MS = 2 * DAY_MS;
const LEAD_ORDER = Object.keys(LEAD_STATUSES);
/**
 * Titles at the start of a user's name, matched against data (not UI text): د / أ / م with or
 * without a dot, and دكتور / أستاذ / مهندس with or without ال.
 */
const HONORIFIC = /^(?:د|أ|م)\.?$|^(?:ال)?(?:دكتور|أستاذ|مهندس)$/;

function isToday(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** First name for the greeting, skipping titles such as "د." */
function greetingName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return parts.find((p) => p && !HONORIFIC.test(p)) || '';
}

/** Late, or still open and due within two days. */
function isUrgent(task, now) {
  if (task.status === 'late') return true;
  if (task.status !== 'pending' && task.status !== 'in_progress') return false;
  return Boolean(task.dueAt) && new Date(task.dueAt).getTime() - now <= URGENT_WITHIN_MS;
}

function leadRank(status) {
  const i = LEAD_ORDER.indexOf(status);
  return i === -1 ? LEAD_ORDER.length : i;
}

/* SectionCard, DashList and InlineStat only show text they receive already translated from Dashboard. */

function SectionCard({ icon, title, action, children, className = '' }) {
  return (
    <section className={`card dash-section ${className}`.trim()}>
      <div className="dash-section-head">
        <h2 className="dash-section-title">
          {icon && <span className="dash-section-icon">{icon}</span>}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashList({ items, empty }) {
  if (!items.length) return <p className="empty-state dash-empty">{empty}</p>;
  return (
    <ul className="dash-list">
      {items.map((item) => {
        const body = (
          <>
            {item.icon && <span className={`dash-list-icon ${item.tone || ''}`}>{item.icon}</span>}
            <span className="dash-list-text">
              <span className="dash-list-title">{item.title}</span>
              {item.meta && <span className="dash-list-meta">{item.meta}</span>}
            </span>
            {item.end && <span className={`dash-list-end tnum ${item.endTone || ''}`}>{item.end}</span>}
          </>
        );
        return (
          <li key={item.key} className="dash-list-item">
            {item.href ? (
              <Link to={item.href} className="dash-list-row is-link">
                {body}
              </Link>
            ) : (
              <div className="dash-list-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function InlineStat({ value, label, tone }) {
  return (
    <div className={`dash-inline-stat ${tone ? `is-${tone}` : ''}`.trim()}>
      <span className="dash-inline-stat-value tnum">{value}</span>
      <span className="dash-inline-stat-label">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { courses, leads, tasks, user, hasPrivilege } = useApp();
  const { t, td } = useI18n();
  const [widgets, setWidgets] = useState(null);
  const [expenses, setExpenses] = useState([]);
  // Holds an API message or an Arabic key; translated when shown so it follows the language toggle.
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    reportsApi
      .dashboard()
      .then(setWidgets)
      .catch((err) => {
        setWidgets({});
        setError(err.message || 'تعذّر تحميل لوحة التحكم');
      });
  }, []);

  const privileges = user?.privileges || [];
  const showAccountant = hasPrivilege('accountant');
  const showMedia = hasPrivilege('media');
  const showOperation = hasPrivilege('operation');
  const showSales = hasPrivilege('sales');
  // Personal widget (own wallet and sessions): only for people who teach, not for every admin.
  const showInstructor = privileges.includes('instructor');

  useEffect(() => {
    if (!showAccountant) return;
    financeApi
      .expenses()
      .then((rows) => setExpenses(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        setExpenses([]);
        setError((prev) => prev || err.message || 'تعذّر تحميل المصروفات');
      });
  }, [showAccountant]);

  const activeCourses = useMemo(() => courses.filter((c) => c.status === 'active'), [courses]);

  const urgentTasks = useMemo(() => {
    const now = Date.now();
    return tasks
      .filter((task) => isUrgent(task, now))
      .sort((a, b) => {
        const aLate = a.status === 'late';
        const bLate = b.status === 'late';
        if (aLate !== bLate) return aLate ? -1 : 1;
        return new Date(a.dueAt || 0) - new Date(b.dueAt || 0);
      });
  }, [tasks]);

  const recentLeads = useMemo(
    () => [...leads].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6),
    [leads]
  );

  // The admin widget counts every lead; other roles count the leads they can see.
  const newLeads7d = useMemo(() => {
    if (widgets?.admin?.newLeads7d != null) return widgets.admin.newLeads7d;
    const since = Date.now() - 7 * DAY_MS;
    return leads.filter((l) => new Date(l.createdAt).getTime() >= since).length;
  }, [widgets, leads]);

  const overdueCount = widgets?.admin?.overdueTasks ?? tasks.filter((task) => task.status === 'late').length;
  const monthlyRevenue = widgets?.finance?.monthlyRevenue || '0';
  const pendingWithdrawals = widgets?.finance?.pendingWithdrawals ?? 0;

  const pipeline = useMemo(
    () => [...(widgets?.sales?.pipeline || [])].sort((a, b) => leadRank(a.status) - leadRank(b.status)),
    [widgets]
  );
  const pipelineMax = Math.max(...pipeline.map((r) => r._count || 0), 1);

  const todayExpenses = useMemo(() => expenses.filter((e) => isToday(e.spentAt)), [expenses]);

  const expenseByCategory = useMemo(() => {
    const grouped = {};
    for (const e of expenses.filter((x) => isThisMonth(x.spentAt))) {
      const name = td(e.category?.labelAr) || e.category?.code || t('غير مصنّف');
      grouped[name] = (grouped[name] || 0) + Number(e.amountMinor);
    }
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [expenses, t, td]);

  const expenseMax = expenseByCategory[0]?.[1] || 1;
  const firstName = greetingName(user?.fullName);
  const currency = getCurrencyLabel();
  const instructorWidget = showInstructor ? widgets?.instructor : null;
  const hasSide = urgentTasks.length > 0 || showSales || showAccountant || Boolean(instructorWidget);

  if (widgets === null) {
    return (
      <AppShell>
        <PageLoading tiles={4} rows={3} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('لوحة التحكم')}</h1>
          <p className="page-subtitle">
            {firstName ? `${t('أهلاً {name}', { name: firstName })} · ` : ''}
            {formatWeekday(new Date())}
          </p>
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          <AlertIcon size={16} />
          {td(error)}
        </p>
      )}

      <div className="grid-auto dash-kpis">
        {showSales && (
          <StatCard
            value={newLeads7d}
            label={t('عملاء جدد خلال 7 أيام')}
            icon={<UsersIcon />}
            variant="headline"
            onClick={() => navigate('/crm')}
          />
        )}
        <StatCard
          value={activeCourses.length}
          label={t('دورات نشطة')}
          icon={<BookIcon />}
          onClick={() => navigate('/courses')}
        />
        <StatCard
          value={overdueCount}
          label={t('مهام متأخرة')}
          icon={<AlertIcon />}
          variant={overdueCount > 0 ? 'warning' : undefined}
          onClick={() => navigate('/tasks')}
        />
        {showAccountant && (
          <>
            <StatCard
              value={formatAmount(monthlyRevenue)}
              label={t('إيرادات الشهر')}
              hint={currency}
              icon={<CoinsIcon />}
              variant="headline"
              onClick={() => navigate('/finance')}
            />
            <StatCard
              value={pendingWithdrawals}
              label={t('طلبات سحب معلّقة')}
              icon={<WalletIcon />}
              variant={pendingWithdrawals > 0 ? 'warning' : undefined}
              onClick={() => navigate('/employee-wallets')}
            />
          </>
        )}
      </div>

      <div className={`dash-grid ${hasSide ? '' : 'is-single'}`.trim()}>
        <div className="dash-col-main">
          {showSales && widgets?.sales && (
            <SectionCard
              icon={<TrendUpIcon size={16} />}
              title={t('المبيعات')}
              action={
                <Link to="/crm" className="btn btn-ghost btn-sm">
                  {t('العملاء المحتملون')}
                  <ArrowForwardIcon />
                </Link>
              }
            >
              <div className="dash-inline-stats">
                <InlineStat value={widgets.sales.followUpsToday ?? 0} label={t('متابعات مستحقة اليوم')} />
                <InlineStat value={leads.length} label={t('إجمالي العملاء المحتملين')} />
              </div>
              {pipeline.length > 0 ? (
                <div className="pipeline-chart">
                  {pipeline.map((row) => (
                    <div key={row.status} className="pipeline-row">
                      <div className="pipeline-row-meta">
                        <span className="pipeline-label">{LEAD_STATUSES[row.status]?.label || row.status}</span>
                        <span className="pipeline-count tnum">{row._count}</span>
                      </div>
                      <div className="pipeline-bar-track">
                        <div
                          className="pipeline-bar-fill"
                          style={{
                            width: `${((row._count || 0) / pipelineMax) * 100}%`,
                            background: LEAD_STATUSES[row.status]?.color || 'var(--muted)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state dash-empty">{t('لا توجد بيانات في خط المبيعات بعد')}</p>
              )}
            </SectionCard>
          )}

          {showOperation && widgets?.operation && (
            <SectionCard
              icon={<LayersIcon size={16} />}
              title={t('العمليات')}
              action={
                <Link to="/courses" className="btn btn-ghost btn-sm">
                  {t('عرض الدورات')}
                  <ArrowForwardIcon />
                </Link>
              }
            >
              <div className="dash-inline-stats">
                <InlineStat value={widgets.operation.sessionsToday ?? 0} label={t('جلسات اليوم')} />
                <InlineStat value={widgets.operation.enrollmentOpenCourses ?? 0} label={t('دورات مفتوحة للتسجيل')} />
                <InlineStat
                  value={widgets.operation.logisticsTasks ?? 0}
                  label={t('مهام عمليات ولوجستيات مفتوحة')}
                  tone={(widgets.operation.logisticsTasks ?? 0) > 0 ? 'warning' : undefined}
                />
              </div>
            </SectionCard>
          )}

          {showMedia && widgets?.media && (
            <SectionCard
              icon={<ImageIcon size={16} />}
              title={t('الميديا')}
              action={
                <Link to="/tasks" className="btn btn-ghost btn-sm">
                  {t('المهام')}
                  <ArrowForwardIcon />
                </Link>
              }
            >
              <div className="dash-inline-stats">
                <InlineStat value={widgets.media.pendingTasks ?? 0} label={t('مهام قيد التنفيذ')} />
                <InlineStat
                  value={widgets.media.overdueTasks?.length ?? 0}
                  label={t('مهام ميديا متأخرة')}
                  tone={(widgets.media.overdueTasks?.length ?? 0) > 0 ? 'danger' : undefined}
                />
              </div>
            </SectionCard>
          )}

          <SectionCard
            icon={<BookIcon size={16} />}
            title={t('الدورات النشطة')}
            action={
              <Link to="/courses" className="btn btn-ghost btn-sm">
                {t('كل الدورات')}
                <ArrowForwardIcon />
              </Link>
            }
          >
            {activeCourses.length === 0 ? (
              <EmptyState
                icon={<BookIcon />}
                title={t('لا توجد دورات نشطة حالياً')}
                hint={t('تبدأ الدورة تلقائياً عند تاريخ بدايتها.')}
              />
            ) : (
              <ul className="dash-courses">
                {activeCourses.map((course) => {
                  const progress = courseProgress(course, tasks);
                  return (
                    <li key={course.id}>
                      <button type="button" className="dash-course" onClick={() => navigate(`/courses/${course.id}`)}>
                        <span className="dash-course-top">
                          <span className="track-pill">{trackName(course.track) || '—'}</span>
                          <span className="dash-course-progress tnum" title={t('نسبة المهام المنجزة')}>
                            {progress}%
                          </span>
                        </span>
                        <span className="dash-course-name">{course.name}</span>
                        <span className="dash-course-meta">
                          <UsersIcon size={13} />
                          {t('{enrolled}/{capacity} طالب', {
                            enrolled: course._count?.enrollments ?? 0,
                            capacity: course.capacity ?? '',
                          })}
                          <span className="dash-course-sep" />
                          {course.primaryInstructor?.fullName || t('بدون مدرّب')}
                        </span>
                        <span className="dash-course-bar">
                          <span style={{ width: `${progress}%` }} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        {hasSide && (
          <div className="dash-col-side">
            {urgentTasks.length > 0 && (
              <SectionCard
                icon={<AlertIcon size={16} />}
                title={
                  <>
                    {t('مهام عاجلة')}
                    <span className="tab-count">{urgentTasks.length}</span>
                  </>
                }
                className="dash-urgent"
                action={
                  <Link to="/tasks" className="btn btn-ghost btn-sm">
                    {t('المهام')}
                    <ArrowForwardIcon />
                  </Link>
                }
              >
                <DashList
                  items={urgentTasks.slice(0, 6).map((task) => {
                    const late = task.status === 'late';
                    return {
                      key: task.id,
                      icon: late ? <AlertIcon size={16} /> : <TasksIcon size={16} />,
                      tone: late ? 'danger' : 'warning',
                      title: task.title,
                      meta: task.course?.name || t('مهمة عامة'),
                      end: task.dueAt ? formatRelativeTime(task.dueAt) : late ? t('متأخرة') : '',
                      endTone: late ? 'danger' : '',
                      href: task.courseId ? `/courses/${task.courseId}` : '/tasks',
                    };
                  })}
                  empty=""
                />
              </SectionCard>
            )}

            {showSales && (
              <SectionCard
                icon={<UsersIcon size={16} />}
                title={t('آخر العملاء')}
                className="dash-leads card-flush-body"
                action={
                  <Link to="/crm" className="btn btn-ghost btn-sm">
                    {t('الكل')}
                    <ArrowForwardIcon />
                  </Link>
                }
              >
                <DataTable
                  dense
                  rows={recentLeads}
                  emptyMessage={t('لا يوجد عملاء محتملون بعد')}
                  columns={[
                    {
                      key: 'fullName',
                      label: t('الاسم'),
                      render: (r) => (
                        <span className="cell-person">
                          <span className="avatar avatar-sm">{initials(r.fullName)}</span>
                          <span className="cell-name">{r.fullName}</span>
                        </span>
                      ),
                    },
                    { key: 'status', label: t('الحالة'), render: (r) => <StatusBadge kind="lead" value={r.status} /> },
                    {
                      key: 'updatedAt',
                      label: t('آخر تحديث'),
                      render: (r) => <span className="cell-muted">{formatRelativeTime(r.updatedAt)}</span>,
                    },
                  ]}
                  onRowClick={(r) => navigate(`/crm/${r.id}`)}
                />
              </SectionCard>
            )}

            {showAccountant && (
              <SectionCard
                icon={<CoinsIcon size={16} />}
                title={t('المحاسبة')}
                action={
                  <Link to="/finance" className="btn btn-ghost btn-sm">
                    {t('فتح المالية')}
                    <ArrowForwardIcon />
                  </Link>
                }
              >
                <h3 className="dash-subheading">
                  {t('مصروفات اليوم')} <span className="tab-count">{todayExpenses.length}</span>
                </h3>
                <DashList
                  items={todayExpenses.slice(0, 5).map((e) => ({
                    key: e.id,
                    icon: <CoinsIcon size={16} />,
                    title: td(e.category?.labelAr) || e.category?.code || t('مصروف'),
                    meta: e.reason,
                    end: formatMinor(e.amountMinor),
                  }))}
                  empty={t('لا توجد مصروفات مسجّلة اليوم')}
                />
                {expenseByCategory.length > 0 && (
                  <>
                    <h3 className="dash-subheading">{t('مصروفات الشهر حسب الفئة')}</h3>
                    <div className="pipeline-chart">
                      {expenseByCategory.map(([name, total]) => (
                        <div key={name} className="pipeline-row">
                          <div className="pipeline-row-meta">
                            <span className="pipeline-label">{name}</span>
                            <span className="pipeline-count tnum">{formatMinor(total)}</span>
                          </div>
                          <div className="pipeline-bar-track">
                            <div
                              className="pipeline-bar-fill"
                              style={{ width: `${(total / expenseMax) * 100}%`, background: 'var(--chart-4)' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </SectionCard>
            )}

            {instructorWidget && (
              <SectionCard icon={<StarIcon size={16} />} title={t('جلساتي ومحفظتي')}>
                <div className="dash-inline-stats">
                  <InlineStat
                    value={formatAmount(instructorWidget.walletBalance ?? 0)}
                    label={t('رصيد المحفظة ({currency})', { currency })}
                  />
                </div>
                <h3 className="dash-subheading">{t('الجلسات القادمة')}</h3>
                <DashList
                  items={(instructorWidget.upcomingSessions || []).map((s) => ({
                    key: s.id,
                    icon: <CalendarIcon size={16} />,
                    tone: 'brand',
                    title: s.course?.name,
                    meta: formatDateTime(s.scheduledAt),
                    end: formatRelativeTime(s.scheduledAt),
                    href: s.courseId ? `/courses/${s.courseId}` : undefined,
                  }))}
                  empty={t('لا توجد جلسات قادمة')}
                />
              </SectionCard>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
