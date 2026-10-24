import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import { PageLoading } from '../components/Skeleton';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { reportsApi } from '../api/client';
import { formatAmount, formatMinor, getCurrencyLabel, initials } from '../utils/formatters';
import {
  AlertIcon,
  ArrowBackIcon,
  ArrowForwardIcon,
  BookIcon,
  BotIcon,
  ChartIcon,
  CheckCircleIcon,
  CoinsIcon,
  LayersIcon,
  PercentIcon,
  StarIcon,
  TagIcon,
  TrendUpIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from '../components/icons';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Reports.css';

/* Titles and descriptions are Arabic source keys, translated where they are rendered. */
const REPORTS = [
  {
    id: 'pnl',
    title: 'الأرباح والخسائر',
    desc: 'صافي الربح والتكاليف',
    icon: ChartIcon,
    accent: 1,
    privileges: ['admin', 'accountant'],
  },
  {
    id: 'marketing',
    title: 'الحملات التسويقية',
    desc: 'العملاء حسب المصدر ونسبة التحويل',
    icon: UsersIcon,
    accent: 4,
    privileges: ['admin', 'sales'],
  },
  {
    id: 'lead-demand',
    title: 'طلب العملاء (البوت)',
    desc: 'مجال الاهتمام × التصنيف من بوت التأهيل',
    icon: BotIcon,
    accent: 2,
    privileges: ['admin', 'sales'],
  },
  {
    id: 'staff',
    title: 'أداء الموظفين',
    desc: 'مهام منجزة وتقييم الأداء',
    icon: StarIcon,
    accent: 6,
    privileges: ['admin'],
  },
  {
    id: 'courses',
    title: 'أداء الكورسات',
    desc: 'نسبة الامتلاء وحالة كل دورة',
    icon: BookIcon,
    accent: 3,
    privileges: ['admin', 'operation'],
  },
  {
    id: 'evaluations',
    title: 'تقييمات الطلاب',
    desc: 'متوسط التقييمات',
    icon: CheckCircleIcon,
    accent: 5,
    privileges: ['admin', 'operation', 'instructor'],
  },
];

/* Recharts styling per the design system (rule 8) */
const AXIS_TICK = { fill: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 12 };
const AXIS_LINE = { stroke: 'var(--line)' };
const TOOLTIP_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  boxShadow: 'var(--sh-2)',
};
const TOOLTIP_LABEL = { color: 'var(--ink)', fontWeight: 700, marginBottom: 4 };
const TOOLTIP_ITEM = { color: 'var(--ink-soft)' };
const TOOLTIP_CURSOR = { fill: 'var(--surface-2)', opacity: 0.7 };
const BAR_RADIUS = [6, 6, 0, 0];
// See Finance.jsx: a chart keeps a readable width and its card scrolls on a phone.
const CHART_MIN_WIDTH = 520;

const PNL_COLORS = {
  income: 'var(--chart-1)',
  expenses: 'var(--chart-6)',
  ownerWithdrawals: 'var(--chart-4)',
  netProfit: 'var(--chart-5)',
};

const fixed1 = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toFixed(1));

function PersonCell({ name, email }) {
  return (
    <span className="cell-person">
      <span className="avatar">{initials(name)}</span>
      <span className="cell-stack">
        <span className="cell-name">{name || '—'}</span>
        {email && <span className="cell-muted ltr">{email}</span>}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* P&L                                                               */
/* ---------------------------------------------------------------- */

function PnlReport({ data }) {
  const { t } = useI18n();
  if (!data) return <EmptyState icon={<ChartIcon />} title={t('لا توجد بيانات مالية بعد')} />;
  const currency = getCurrencyLabel();
  const net = Number(data.netProfit);
  const chartData = [
    { key: 'income', name: t('الإيرادات'), value: Number(data.income) },
    { key: 'expenses', name: t('المصروفات'), value: Number(data.expenses) },
    { key: 'ownerWithdrawals', name: t('سحوبات المالك'), value: Number(data.ownerWithdrawals) },
    { key: 'netProfit', name: t('صافي الربح'), value: net },
  ];
  return (
    <>
      <div className="grid-4 report-kpis">
        <StatCard value={formatAmount(data.income)} label={t('الإيرادات')} hint={currency} icon={<TrendUpIcon />} />
        <StatCard value={formatAmount(data.expenses)} label={t('المصروفات')} hint={currency} icon={<CoinsIcon />} />
        <StatCard
          value={formatAmount(data.ownerWithdrawals)}
          label={t('سحوبات المالك')}
          hint={currency}
          icon={<WalletIcon />}
        />
        <StatCard
          value={formatAmount(data.netProfit)}
          label={t('صافي الربح')}
          hint={currency}
          icon={<ChartIcon />}
          variant={net >= 0 ? 'success' : 'warning'}
        />
      </div>
      <div className="card report-chart-card">
        <div className="card-header-row">
          <h3 className="card-title">{t('توزيع الأرباح والخسائر')}</h3>
        </div>
        <div className="report-chart chart-scroll">
          <ResponsiveContainer width="100%" height={300} minWidth={CHART_MIN_WIDTH}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis tickFormatter={(v) => formatAmount(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={72} />
              <Tooltip
                formatter={(v) => [formatMinor(v), t('المبلغ')]}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL}
                itemStyle={TOOLTIP_ITEM}
                cursor={TOOLTIP_CURSOR}
              />
              <Bar dataKey="value" name={t('المبلغ')} radius={BAR_RADIUS} maxBarSize={56}>
                {chartData.map((d) => (
                  <Cell key={d.key} fill={PNL_COLORS[d.key]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Marketing                                                         */
/* ---------------------------------------------------------------- */

function MarketingReport({ data }) {
  const { t } = useI18n();
  if (!data) return <EmptyState icon={<UsersIcon />} title={t('لا توجد بيانات تسويقية بعد')} />;
  const rows = (data.bySource || []).map((r, i) => ({ ...r, id: r.source?.code || r.source?.id || `src-${i}` }));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.count) || 0), 0) || 1;
  const rate =
    data.conversionRate !== null && data.conversionRate !== undefined ? Number(data.conversionRate).toFixed(1) : '0.0';
  const converted = data.converted ?? 0;
  const total = data.total ?? 0;
  return (
    <>
      <div className="grid-3 report-kpis">
        <StatCard
          value={`${rate}%`}
          label={t('معدل التحويل')}
          hint={`${converted}/${total}`}
          icon={<PercentIcon />}
          variant="headline"
        />
        <StatCard value={total} label={t('إجمالي العملاء المحتملين')} icon={<UsersIcon />} />
        <StatCard value={converted} label={t('عملاء تم تحويلهم')} icon={<CheckCircleIcon />} variant="success" />
      </div>
      <div className="card card-flush report-table-card">
        <div className="card-header-row">
          <h3 className="card-title">{t('العملاء حسب المصدر')}</h3>
        </div>
        <DataTable
          rows={rows}
          emptyMessage={t('لا توجد بيانات حسب المصدر')}
          columns={[
            { key: 'source', label: t('المصدر'), render: (r) => <SourceBadge source={r.source} /> },
            {
              key: 'count',
              label: t('عدد العملاء'),
              render: (r) => {
                const count = Number(r.count) || 0;
                return (
                  <span className="report-bar-cell">
                    <span className="report-bar-track">
                      <span className="report-bar-fill" style={{ width: `${Math.round((count / max) * 100)}%` }} />
                    </span>
                    <strong className="tnum">{count}</strong>
                  </span>
                );
              },
            },
          ]}
        />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Lead demand (bot)                                                 */
/* ---------------------------------------------------------------- */

/* Values the bot may store for "ready to register" (data matching, not UI text). */
const YES_VALUES = new Set(['true', 'yes', '1', 'نعم']);
const NO_VALUES = new Set(['false', 'no', '0', 'لا']);

function readyState(value) {
  if (value === null || value === undefined || value === '') return null;
  const key = String(value).trim().toLowerCase();
  if (YES_VALUES.has(key)) return 'yes';
  if (NO_VALUES.has(key)) return 'no';
  return null;
}

function ReadyBadge({ value }) {
  const { t, td } = useI18n();
  const state = readyState(value);
  if (state === 'yes') return <span className="badge tone-success plain">{t('نعم')}</span>;
  if (state === 'no') return <span className="badge tone-neutral plain">{t('لا')}</span>;
  if (value === null || value === undefined || value === '') return <span className="cell-muted">—</span>;
  return td(String(value));
}

function LeadDemandReport({ data }) {
  const { t, td } = useI18n();
  if (!data?.breakdown?.length) {
    return (
      <EmptyState
        icon={<BotIcon />}
        title={t('لا توجد بيانات من البوت بعد')}
        hint={t('تظهر هنا اهتمامات العملاء وتصنيفاتهم كما جمعها بوت التأهيل.')}
      />
    );
  }

  const rows = [];
  data.breakdown.forEach((area) => {
    area.counts.forEach((c) => {
      rows.push({
        id: `${area.interestArea}-${c.leadClassification}-${c.readyToRegister}`,
        interestArea: area.interestArea,
        leadClassification: c.leadClassification,
        readyToRegister: c.readyToRegister,
        count: c.count,
      });
    });
  });

  const hasReadyFlag = rows.some((r) => readyState(r.readyToRegister) !== null);
  const readyCount = rows.reduce(
    (sum, r) => (readyState(r.readyToRegister) === 'yes' ? sum + (Number(r.count) || 0) : sum),
    0
  );

  return (
    <>
      <div className={`${hasReadyFlag ? 'grid-3' : 'grid-2'} report-kpis`}>
        <StatCard value={data.totalBotLeads ?? 0} label={t('إجمالي عملاء البوت')} icon={<BotIcon />} variant="headline" />
        <StatCard value={data.breakdown.length} label={t('مجالات الاهتمام')} icon={<TagIcon />} />
        {hasReadyFlag && (
          <StatCard value={readyCount} label={t('جاهزون للتسجيل')} icon={<CheckCircleIcon />} variant="success" />
        )}
      </div>
      <div className="card card-flush report-table-card">
        <div className="card-header-row">
          <h3 className="card-title">{t('مجال الاهتمام × التصنيف')}</h3>
        </div>
        <DataTable
          rows={rows}
          columns={[
            {
              key: 'interestArea',
              label: t('مجال الاهتمام'),
              render: (r) => <span className="cell-name">{td(r.interestArea) || '—'}</span>,
            },
            { key: 'leadClassification', label: t('التصنيف'), render: (r) => td(r.leadClassification) || '—' },
            { key: 'readyToRegister', label: t('جاهز للتسجيل'), render: (r) => <ReadyBadge value={r.readyToRegister} /> },
            { key: 'count', label: t('العدد'), render: (r) => <strong className="tnum">{r.count}</strong> },
          ]}
        />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Staff                                                             */
/* ---------------------------------------------------------------- */

function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  return n >= 0 ? 'success' : 'danger';
}

function StaffReport({ data }) {
  const { t, td } = useI18n();
  if (!data) return <EmptyState icon={<StarIcon />} title={t('لا توجد بيانات أداء بعد')} />;
  const ratingRows = (data.ratings || []).map((r, i) => ({
    id: r.id ?? `rating-${i}`,
    name: r.employee?.fullName,
    email: r.employee?.email,
    score: r.score,
    period: r.periodLabel,
  }));
  return (
    <div className="card card-flush report-table-card">
      <div className="card-header-row">
        <h3 className="card-title">{t('تقييمات الأداء')}</h3>
        <span className="muted-text">{t('{count} تقييم', { count: ratingRows.length })}</span>
      </div>
      <DataTable
        rows={ratingRows}
        emptyMessage={t('لا توجد تقييمات أداء بعد')}
        columns={[
          { key: 'name', label: t('الموظف'), render: (r) => <PersonCell name={r.name} email={r.email} /> },
          {
            key: 'score',
            label: t('التقييم'),
            render: (r) => <span className={`badge tone-${scoreTone(r.score)} plain tnum`}>{r.score ?? '—'}</span>,
          },
          { key: 'period', label: t('الفترة'), render: (r) => td(r.period) || '—' },
        ]}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Courses                                                           */
/* ---------------------------------------------------------------- */

function FillRateCell({ value }) {
  const pct = Math.round(Number(value)) || 0;
  const width = Math.max(0, Math.min(100, pct));
  return (
    <span className="report-progress">
      <span className="report-progress-track">
        <span className="report-progress-fill" style={{ width: `${width}%` }} />
      </span>
      <span className="report-progress-value">{pct}%</span>
    </span>
  );
}

function CoursesReport({ data }) {
  const { t } = useI18n();
  if (!data?.length) return <EmptyState icon={<BookIcon />} title={t('لا توجد دورات لعرضها')} />;
  const chartData = data.map((c) => ({
    name: c.name?.slice(0, 20),
    fillRate: Math.round(c.fillRate),
    enrolled: c.enrolled,
  }));
  const rows = data.map((c, i) => ({ ...c, id: c.id ?? `course-${i}` }));
  return (
    <>
      <div className="card report-chart-card">
        <div className="card-header-row">
          <h3 className="card-title">{t('نسبة الامتلاء لكل دورة')}</h3>
          <span className="muted-text">{t('{count} دورة', { count: data.length })}</span>
        </div>
        <div className="report-chart chart-scroll">
          <ResponsiveContainer width="100%" height={280} minWidth={CHART_MIN_WIDTH}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis
                domain={[0, (dataMax) => Math.max(100, Math.ceil(dataMax / 10) * 10)]}
                tickFormatter={(v) => `${v}%`}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                formatter={(v) => [`${v}%`, t('نسبة الامتلاء')]}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL}
                itemStyle={TOOLTIP_ITEM}
                cursor={TOOLTIP_CURSOR}
              />
              <Bar dataKey="fillRate" name={t('نسبة الامتلاء')} fill="var(--chart-1)" radius={BAR_RADIUS} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card card-flush report-table-card">
        <div className="card-header-row">
          <h3 className="card-title">{t('تفاصيل الدورات')}</h3>
        </div>
        <DataTable
          rows={rows}
          columns={[
            { key: 'name', label: t('الدورة'), render: (r) => <span className="cell-name">{r.name}</span> },
            {
              key: 'enrolled',
              label: t('المسجّلون'),
              render: (r) => (
                <span className="tnum">
                  {r.enrolled}/{r.capacity}
                </span>
              ),
            },
            { key: 'fillRate', label: t('نسبة الامتلاء'), render: (r) => <FillRateCell value={r.fillRate} /> },
            { key: 'status', label: t('الحالة'), render: (r) => <StatusBadge kind="course" value={r.status} /> },
          ]}
        />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Evaluations                                                       */
/* ---------------------------------------------------------------- */

function EvaluationsReport({ data }) {
  const { t } = useI18n();
  if (!data) return <EmptyState icon={<CheckCircleIcon />} title={t('لا توجد تقييمات بعد')} />;
  const avg = data.overall?._avg || {};
  const count = data.overall?._count || 0;
  const countHint = t('{count} تقييم', { count });
  const rows = (data.byCourse || []).map((r, i) => ({ ...r, id: r.courseId ?? r.id ?? `course-${i}` }));
  return (
    <>
      <div className="grid-4 report-kpis">
        <StatCard value={fixed1(avg.courseScore)} label={t('محاور الدورة')} hint={countHint} icon={<BookIcon />} />
        <StatCard value={fixed1(avg.teacherScore)} label={t('المدرّب')} hint={countHint} icon={<UserIcon />} />
        <StatCard value={fixed1(avg.hallScore)} label={t('القاعة')} hint={countHint} icon={<LayersIcon />} />
        <StatCard value={fixed1(avg.benefitLevel)} label={t('مستوى الإفادة')} hint={countHint} icon={<StarIcon />} />
      </div>
      <div className="card card-flush report-table-card">
        <div className="card-header-row">
          <h3 className="card-title">{t('التقييمات حسب الدورة')}</h3>
        </div>
        <DataTable
          rows={rows}
          emptyMessage={t('لا توجد تقييمات مرتبطة بدورات بعد')}
          columns={[
            { key: 'course', label: t('الدورة'), render: (r) => <span className="cell-name">{r.courseName || '—'}</span> },
            {
              key: 'courseScore',
              label: t('محاور الدورة'),
              render: (r) => <span className="tnum">{fixed1(r.avgCourseScore)}</span>,
            },
            {
              key: 'teacherScore',
              label: t('المدرّب'),
              render: (r) => <span className="tnum">{fixed1(r.avgTeacherScore)}</span>,
            },
            { key: 'hallScore', label: t('القاعة'), render: (r) => <span className="tnum">{fixed1(r.avgHallScore)}</span> },
            {
              key: 'benefitLevel',
              label: t('الإفادة'),
              render: (r) => <span className="tnum">{fixed1(r.avgBenefitLevel)}</span>,
            },
            { key: 'count', label: t('عدد التقييمات'), render: (r) => <strong className="tnum">{r.count ?? 0}</strong> },
          ]}
        />
      </div>
    </>
  );
}

function ReportView({ id, data }) {
  switch (id) {
    case 'pnl': return <PnlReport data={data} />;
    case 'marketing': return <MarketingReport data={data} />;
    case 'lead-demand': return <LeadDemandReport data={data} />;
    case 'staff': return <StaffReport data={data} />;
    case 'courses': return <CoursesReport data={data} />;
    case 'evaluations': return <EvaluationsReport data={data} />;
    default: return <pre className="report-json">{JSON.stringify(data, null, 2)}</pre>;
  }
}

export default function Reports() {
  const { hasPrivilege } = useApp();
  const { t, td } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeReport = searchParams.get('report');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  // Holds an API message or an Arabic key; translated when shown so it follows the language toggle.
  const [error, setError] = useState('');

  const visibleReports = useMemo(
    () => REPORTS.filter((r) => r.privileges.some((p) => hasPrivilege(p))),
    [hasPrivilege]
  );

  // The open report lives in the address, so a report can be linked to and survives a refresh.
  const openReport = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('report', id);
    else next.delete('report');
    setSearchParams(next);
  };

  const loadReport = async (id) => {
    setLoading(true);
    setError('');
    try {
      let result;
      switch (id) {
        case 'pnl': result = await reportsApi.pnl(); break;
        case 'marketing': result = await reportsApi.marketing(); break;
        case 'lead-demand': result = await reportsApi.leadDemand(); break;
        case 'staff': result = await reportsApi.employeePerformance(); break;
        case 'courses': result = await reportsApi.coursePerformance(); break;
        case 'evaluations': result = await reportsApi.evaluations(); break;
        default: result = null;
      }
      setData(result);
    } catch (err) {
      setData(null);
      setError(err.message || 'تعذّر تحميل التقرير');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeReport) {
      setData(null);
      return;
    }
    // Wait for privileges to arrive, then refuse a report this account may not read.
    if (!visibleReports.length) return;
    if (!visibleReports.some((r) => r.id === activeReport)) {
      setData(null);
      return;
    }
    loadReport(activeReport);
  }, [activeReport, visibleReports]); // eslint-disable-line react-hooks/exhaustive-deps

  if (activeReport) {
    const meta = REPORTS.find((r) => r.id === activeReport);
    const ActiveIcon = meta?.icon;
    const backButton = (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openReport(null)}>
        <ArrowBackIcon />
        {t('العودة للتقارير')}
      </button>
    );

    // A link to a report this account cannot read (or to a report that no longer exists)
    // should say so rather than render an empty shell.
    if (!meta || (visibleReports.length > 0 && !visibleReports.some((r) => r.id === activeReport))) {
      return (
        <AppShell>
          <div className="report-view-top">{backButton}</div>
          <EmptyState
            icon={<ChartIcon />}
            title={t('هذا التقرير غير متاح')}
            hint={t('إما أن الرابط غير صحيح أو أن صلاحياتك لا تسمح بعرض هذا التقرير.')}
            action={
              <button type="button" className="btn btn-primary" onClick={() => openReport(null)}>
                {t('العودة للتقارير')}
              </button>
            }
          />
        </AppShell>
      );
    }

    return (
      <AppShell>
        <div className="report-view-top">{backButton}</div>
        <div className="page-header">
          <div className="report-view-heading">
            {ActiveIcon && (
              <span className={`report-card-icon report-accent-${meta.accent}`}>
                <ActiveIcon size={22} />
              </span>
            )}
            <div>
              <h1 className="page-title">{t(meta.title)}</h1>
              {meta.desc && <p className="page-subtitle">{t(meta.desc)}</p>}
            </div>
          </div>
        </div>

        {error && (
          <p className="form-error" role="alert">
            <AlertIcon size={16} />
            {td(error)}
          </p>
        )}

        {loading ? <PageLoading title={false} tiles={4} rows={4} /> : <ReportView id={activeReport} data={data} />}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('التقارير والتحليلات')}</h1>
          <p className="page-subtitle">{t('تقارير تفصيلية لاتخاذ القرارات')}</p>
        </div>
      </div>

      {visibleReports.length === 0 ? (
        <EmptyState
          icon={<ChartIcon />}
          title={t('لا توجد تقارير متاحة لصلاحياتك')}
          hint={t('تواصل مع مدير النظام إذا كنت بحاجة إلى الوصول لأحد التقارير.')}
        />
      ) : (
        <div className="reports-grid">
          {visibleReports.map((report) => {
            const Icon = report.icon;
            return (
              <button key={report.id} type="button" className="card report-card" onClick={() => openReport(report.id)}>
                <span className={`report-card-icon report-accent-${report.accent}`}>
                  <Icon size={22} />
                </span>
                <span className="report-card-body">
                  <span className="report-card-title">{t(report.title)}</span>
                  <span className="report-card-desc">{t(report.desc)}</span>
                </span>
                <span className="report-card-link">
                  {t('عرض التقرير')}
                  <ArrowForwardIcon size={16} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
