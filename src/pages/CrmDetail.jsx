import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import StatusBadge from '../components/StatusBadge';
import SourceBadge from '../components/SourceBadge';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { PageLoading } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useDialog } from '../components/DialogProvider';
import {
  ArrowBackIcon,
  CheckCircleIcon,
  CoinsIcon,
  ExternalIcon,
  InfoIcon,
  LockIcon,
  NoteIcon,
  PrinterIcon,
  UserIcon,
  UsersIcon,
} from '../components/icons';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import {
  LEAD_STATUSES,
  daysUntil,
  formatAmountInput,
  formatDate,
  formatDateTime,
  formatDueLabel,
  formatMinor,
  getCurrencyLabel,
  initials,
  parseMinorInput,
} from '../utils/formatters';
import { followUpTone, isClosedLead, leadOwners } from '../utils/leads';
import { leadsApi, employeesApi, coursesApi } from '../api/client';
// Labels stay Arabic there and are translated when rendered.
import { PAYMENT_METHODS } from '../utils/paymentMethods';
import { usePrint } from '../print/PrintProvider';
import './Crm.css';
import './CrmDetail.css';

// Statuses from which "enroll and take a payment" is possible now, or later once the lead is interested.
const CONVERT_READY = new Set(['interested', 'paid', 'enrolled']);
const CONVERT_LATER = new Set(['new', 'contacted']);
// Moving to these is final, so it asks for confirmation and an optional reason.
const CLOSING_STATUSES = new Set(['lost', 'archived']);


/**
 * Fields the qualification bot stores in extraData, in the order a salesperson reads them.
 * Short answers fill the two-column grid first; the long free-text ones come last at full width.
 */
const BOT_FIELDS = [
  ['lead_classification', 'تصنيف العميل'],
  ['seriousness_level', 'مستوى الجدية'],
  ['ready_to_register', 'جاهز للتسجيل'],
  ['needs_a_call', 'يحتاج اتصالاً'],
  ['interest_area', 'مجال الاهتمام'],
  ['occupation_type', 'طبيعة العمل'],
  ['ai_experience_score', 'الخبرة في الذكاء الاصطناعي'],
  ['city', 'المدينة'],
  ['preferred_contact_method', 'وسيلة التواصل المفضلة'],
  ['preferred_contact_times', 'أوقات التواصل المفضلة'],
  ['main_goal', 'الهدف الرئيسي'],
  ['recommendation_reason', 'سبب التوصية'],
];
const BOT_LABELS = Object.fromEntries(BOT_FIELDS);
const WIDE_BOT_FIELDS = new Set(['main_goal', 'recommendation_reason']);

function activityCountLabel(t, n) {
  if (n === 1) return t('حدث واحد');
  if (n === 2) return t('حدثان');
  if (n <= 10) return t('{n} أحداث', { n });
  return t('{n} حدثاً', { n });
}

/** Local YYYY-MM-DD for a date input (slicing the ISO string would give the UTC date). */
function dateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Readable activity text. The API stores status changes as "contacted → lost: reason",
 * creation as "Lead created" and follow-ups with an ISO timestamp.
 */
function activityText(item, t, td) {
  const body = item.body || '';
  if (item.type === 'created') return t('تم إنشاء العميل');
  if (item.type === 'status_change') {
    const match = /^([a-z_]+)\s*→\s*([a-z_]+)(?::\s*([\s\S]+))?$/.exec(body);
    if (match) {
      const from = LEAD_STATUSES[match[1]]?.label || match[1];
      const to = LEAD_STATUSES[match[2]]?.label || match[2];
      return match[3]
        ? t('تغيّرت الحالة من «{from}» إلى «{to}»: {reason}', { from, to, reason: td(match[3]) })
        : t('تغيّرت الحالة من «{from}» إلى «{to}»', { from, to });
    }
  }
  if (item.type === 'follow_up') {
    const match = /\d{4}-\d{2}-\d{2}T[\d:.]+Z/.exec(body);
    if (match) return t('تمت جدولة متابعة في {date}', { date: formatDate(match[0]) });
  }
  return td(body || item.type);
}

function botValue(t, td, value) {
  if (value === true) return t('نعم');
  if (value === false) return t('لا');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return td(String(value));
}

export default function CrmDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useDialog();
  const openPrint = usePrint();
  const { t, tr, td } = useI18n();
  const { updateLeadStatus, hasPrivilege, refreshData, user } = useApp();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  // HTTP status of a failed load: 403 means the lead belongs to someone else.
  const [loadStatus, setLoadStatus] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [courses, setCourses] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [closing, setClosing] = useState(null);
  const [closeReason, setCloseReason] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [convertForm, setConvertForm] = useState({
    courseId: '',
    amountMinor: '',
    method: 'cash',
    note: '',
  });
  const [converting, setConverting] = useState(false);
  // Error state holds the API message or an Arabic key; both are shown through td().
  const [convertError, setConvertError] = useState('');
  const [convertSuccess, setConvertSuccess] = useState(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState('');

  const canConvert =
    hasPrivilege('admin') ||
    hasPrivilege('sales') ||
    hasPrivilege('operation') ||
    hasPrivilege('accountant');

  const followUpLocked = isClosedLead(lead);

  // What this lead turned into. Without it the page ends at "enrolled" with nowhere to go.
  const enrollments = lead?.enrollments || [];
  const enrolledStudent = enrollments[0]?.student;

  // Tracks the latest route id so an in-flight reload() from a previous lead
  // can't overwrite the screen after the user has navigated to a different one.
  const currentIdRef = useRef(id);
  currentIdRef.current = id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    leadsApi
      .get(id)
      .then((data) => {
        if (cancelled) return;
        setLead(data);
        setLoadStatus(null);
        setFollowUpDate(dateInputValue(data.nextFollowUpAt));
      })
      .catch((err) => {
        if (cancelled) return;
        setLead(null);
        setLoadStatus(err.status || null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    employeesApi.list().then((list) => { if (!cancelled) setEmployees(list); }).catch(() => {});
    coursesApi.list().then((list) => { if (!cancelled) setCourses(Array.isArray(list) ? list : []); }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const reload = async () => {
    const requestedId = id;
    const data = await leadsApi.get(requestedId);
    if (currentIdRef.current !== requestedId) return data;
    setLead(data);
    setFollowUpDate(dateInputValue(data.nextFollowUpAt));
    return data;
  };

  const courseOptions = useMemo(() => {
    const active = courses.filter((c) => !['archived', 'completed'].includes(c.status));
    if (!lead?.requestedTrackId) return active;
    const preferred = active.filter((c) => c.trackId === lead.requestedTrackId);
    return preferred.length ? preferred : active;
  }, [courses, lead?.requestedTrackId]);

  const selectedCourse = courseOptions.find((c) => c.id === convertForm.courseId);

  const openConvert = () => {
    setConvertError('');
    setConvertSuccess(null);
    const preferred =
      courseOptions.find((c) => c.trackId === lead?.requestedTrackId) || courseOptions[0];
    setConvertForm({
      courseId: preferred?.id || '',
      amountMinor: preferred?.priceMinor != null
        ? formatAmountInput(String(preferred.priceMinor))
        : '',
      method: 'cash',
      note: '',
    });
    setShowConvert(true);
  };

  const handleCourseChange = (courseId) => {
    const course = courseOptions.find((c) => c.id === courseId);
    setConvertForm((prev) => ({
      ...prev,
      courseId,
      amountMinor: course?.priceMinor != null
        ? formatAmountInput(String(course.priceMinor))
        : prev.amountMinor,
    }));
  };

  const applyStatus = async (toStatus, reason) => {
    setStatusSaving(true);
    try {
      await updateLeadStatus(id, toStatus, reason || undefined);
      await reload();
      toast.success(t('تم تغيير الحالة إلى «{status}»', { status: LEAD_STATUSES[toStatus]?.label || toStatus }));
      return true;
    } catch (err) {
      toast.error(td(err.message || 'تعذّر تغيير الحالة'));
      return false;
    } finally {
      setStatusSaving(false);
    }
  };

  const handleStatusChange = (toStatus) => {
    if (!toStatus || toStatus === lead.status) return;
    if (CLOSING_STATUSES.has(toStatus)) {
      setCloseReason('');
      setClosing(toStatus);
      return;
    }
    applyStatus(toStatus);
  };

  const confirmClose = async (e) => {
    e.preventDefault();
    if (await applyStatus(closing, closeReason.trim())) setClosing(null);
  };

  const handleAssign = async (employeeId) => {
    if (!employeeId || employeeId === lead.assignedEmployee?.id) return;
    const name = employees.find((emp) => emp.id === employeeId)?.fullName || '';
    // Sales only see their own leads: handing one over removes it from their list.
    const keepsAccess = hasPrivilege('admin') || employeeId === user?.id;
    if (
      !keepsAccess &&
      !(await confirm({
        title: t('تعيين العميل لموظف آخر؟'),
        message: t('بعد التعيين لن يظهر هذا العميل في قائمتك ولن تتمكن من فتحه.'),
        confirmLabel: t('تعيين العميل'),
      }))
    ) {
      return;
    }
    setAssigning(true);
    try {
      await leadsApi.assign(id, employeeId);
      await refreshData?.();
      toast.success(t('تم تعيين العميل إلى {name}', { name }));
      if (keepsAccess) await reload();
      else navigate('/crm');
    } catch (err) {
      toast.error(td(err.message || 'تعذّر تعيين الموظف'));
    } finally {
      setAssigning(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await leadsApi.addNote(id, noteText.trim());
      setNoteText('');
      await reload();
      await refreshData?.();
      toast.success(t('تمت إضافة الملاحظة'));
    } catch (err) {
      toast.error(td(err.message || 'تعذّر إضافة الملاحظة'));
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveFollowUp = async () => {
    if (followUpLocked) return;
    setSavingFollowUp(true);
    setFollowUpError('');
    try {
      const nextFollowUpAt = followUpDate
        ? new Date(`${followUpDate}T12:00:00`).toISOString()
        : null;
      await leadsApi.setFollowUp(id, nextFollowUpAt);
      await reload();
      toast.success(nextFollowUpAt ? t('تم حفظ موعد المتابعة') : t('تم إلغاء المتابعة'));
    } catch (err) {
      setFollowUpError(err.message || 'تعذّر حفظ المتابعة');
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleClearFollowUp = async () => {
    if (followUpLocked) return;
    setSavingFollowUp(true);
    setFollowUpError('');
    try {
      await leadsApi.setFollowUp(id, null);
      setFollowUpDate('');
      await reload();
      toast.success(t('تم إلغاء المتابعة'));
    } catch (err) {
      setFollowUpError(err.message || 'تعذّر إلغاء المتابعة');
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleConvertAndPay = async (e) => {
    e.preventDefault();
    if (!convertForm.courseId) {
      setConvertError('اختر الدورة');
      return;
    }
    const amount = parseMinorInput(convertForm.amountMinor);
    if (amount <= 0) {
      setConvertError('أدخل مبلغ الدفعة (أكبر من صفر)');
      return;
    }
    setConverting(true);
    setConvertError('');
    try {
      const result = await leadsApi.convertAndPay(id, {
        courseId: convertForm.courseId,
        amountMinor: amount,
        method: convertForm.method || undefined,
        note: convertForm.note || undefined,
      });
      setLead((prev) => ({ ...prev, ...result.lead }));
      setConvertSuccess(result);
      await refreshData?.();
      // The conversion response has no allowed transitions or activity; fetch the full lead.
      reload().catch(() => {});
    } catch (err) {
      setConvertError(err.message || 'فشل التحويل');
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <PageLoading tiles={0} rows={6} />
      </AppShell>
    );
  }

  if (!lead) {
    const forbidden = loadStatus === 403;
    return (
      <AppShell>
        <EmptyState
          icon={forbidden ? <LockIcon /> : <UsersIcon />}
          title={forbidden ? t('لا يمكنك فتح هذا العميل') : t('العميل غير موجود')}
          hint={
            forbidden
              ? t('هذا العميل مسند إلى موظف آخر. اطلب من المدير إعادة تعيينه لك إذا احتجت إليه.')
              : t('ربما حُذف هذا العميل أو أن الرابط غير صحيح.')
          }
          action={
            <Link to="/crm" className="btn btn-secondary">
              <ArrowBackIcon />
              {t('العودة إلى العملاء')}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const extra = lead.extraData || {};
  const hasValue = (key) => extra[key] !== undefined && extra[key] !== null && extra[key] !== '';
  const extraKeys = [
    ...BOT_FIELDS.map(([key]) => key).filter(hasValue),
    ...Object.keys(extra).filter((key) => !BOT_LABELS[key] && hasValue(key)),
  ];
  const activities = lead.activities || [];
  const transitions = lead.allowedTransitions || Object.keys(LEAD_STATUSES);
  const convertReady = CONVERT_READY.has(lead.status);
  const showConvertButton = canConvert && !isClosedLead(lead);
  const convertTitle = convertReady
    ? t('تسجيل في دورة + تحصيل دفعة')
    : t('انقل الحالة إلى مهتم أو مدفوع أولاً');
  const followUpDays = lead.nextFollowUpAt ? daysUntil(lead.nextFollowUpAt) : null;
  const assigneeOptions = leadOwners(employees, lead.assignedEmployee?.id);
  const convertLeadVars = {
    name: <strong>{lead.fullName}</strong>,
    course: <strong>{convertSuccess?.course?.name}</strong>,
  };

  return (
    <AppShell>
      <nav className="breadcrumb" aria-label={t('مسار التنقل')}>
        <Link to="/crm">{t('العملاء المحتملون')}</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{lead.fullName}</span>
      </nav>

      <div className="page-header">
        <div className="crm-detail-heading">
          <span className="avatar avatar-lg">{initials(lead.fullName)}</span>
          <div className="crm-detail-heading-text">
            <div className="crm-detail-title-row">
              <h1 className="page-title">{lead.fullName}</h1>
              <StatusBadge kind="lead" value={lead.status} />
            </div>
            <p className="page-subtitle crm-detail-meta">
              <span className="ltr tnum">{lead.phone || '—'}</span>
              <span className="crm-meta-sep" aria-hidden="true">·</span>
              <SourceBadge source={lead.source} />
              {lead.requestedCourseText && (
                <>
                  <span className="crm-meta-sep" aria-hidden="true">·</span>
                  <span className="track-pill">{lead.requestedCourseText}</span>
                </>
              )}
            </p>
          </div>
        </div>
        {showConvertButton && (
          <div className="page-header-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={openConvert}
              disabled={!convertReady}
              title={convertTitle}
            >
              <CoinsIcon />
              {t('تسجيل وتحصيل')}
            </button>
          </div>
        )}
      </div>

      {canConvert && CONVERT_LATER.has(lead.status) && (
        <div className="callout">
          <InfoIcon />
          <span>
            {t(
              'للتحصيل: انقل الحالة إلى «مهتم» أو أبعد في المسار، ثم اضغط «تسجيل وتحصيل». حالة «مدفوع» في الـ CRM وحدها لا تسجّل مالاً — التحصيل من هذا الزر.'
            )}
          </span>
        </div>
      )}

      <div className="crm-detail-grid">
        <div className="crm-detail-main">
          {enrollments.length > 0 && (
            <section className="card">
              <div className="card-header-row">
                <h3 className="card-title">{t('أصبح طالباً')}</h3>
                {enrolledStudent?.id && (
                  <Link to={`/students/${enrolledStudent.id}`} className="btn btn-ghost btn-sm">
                    {t('ملف الطالب')}
                    <ExternalIcon />
                  </Link>
                )}
              </div>
              <ul className="crm-enrollments">
                {enrollments.map((enrollment) => (
                  <li key={enrollment.id}>
                    <Link to={`/courses/${enrollment.course.id}`} className="crm-enrollment-course">
                      {enrollment.course.name}
                    </Link>
                    <span className="crm-enrollment-badges">
                      <StatusBadge kind="enrollment" value={enrollment.enrollmentStatus} />
                      <StatusBadge kind="payment" value={enrollment.paymentStatus} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {extraKeys.length > 0 && (
            <section className="card">
              <h3 className="card-title">{t('بيانات البوت')}</h3>
              <dl className="crm-defs">
                {extraKeys.map((key) => (
                  <div key={key} className={WIDE_BOT_FIELDS.has(key) ? 'is-wide' : undefined}>
                    <dt>{BOT_LABELS[key] ? t(BOT_LABELS[key]) : key}</dt>
                    <dd>{botValue(t, td, extra[key])}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="card">
            <h3 className="card-title">{t('إضافة ملاحظة')}</h3>
            <form className="crm-note-form" onSubmit={handleAddNote}>
              <label htmlFor="crm-note" className="sr-only">
                {t('نص الملاحظة')}
              </label>
              <textarea
                id="crm-note"
                className="textarea"
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t('اكتب ملاحظة عن آخر تواصل أو اتفاق مع العميل…')}
              />
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={savingNote || !noteText.trim()}>
                  <NoteIcon />
                  {savingNote ? t('جاري الحفظ…') : t('إضافة الملاحظة')}
                </button>
              </div>
            </form>
          </section>

          <section className="card">
            <div className="card-header-row">
              <h3 className="card-title">{t('سجل النشاط|lead')}</h3>
              {activities.length > 0 && (
                <span className="muted-text tnum">{activityCountLabel(t, activities.length)}</span>
              )}
            </div>
            {activities.length === 0 ? (
              <p className="empty-state">{t('لا يوجد نشاط مسجّل بعد.')}</p>
            ) : (
              <ol className="timeline">
                {activities.map((item) => (
                  <li key={item.id} className={`timeline-item type-${item.type}`}>
                    <span className="timeline-marker" aria-hidden="true" />
                    <div className="timeline-body">
                      <time className="timeline-date" dateTime={item.createdAt}>
                        {formatDateTime(item.createdAt)}
                      </time>
                      <p className="timeline-text">{activityText(item, t, td)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="crm-detail-side">
          <section className="card">
            <h3 className="card-title">{t('الحالة')}</h3>
            <div className="crm-status-current">
              <StatusBadge kind="lead" value={lead.status} />
            </div>
            {transitions.length === 0 ? (
              <p className="form-hint crm-status-final">{t('حالة نهائية، لا يمكن تغييرها.')}</p>
            ) : (
              <div className="form-group">
                <label htmlFor="crm-status">{t('تغيير الحالة')}</label>
                <select
                  id="crm-status"
                  value={lead.status}
                  disabled={statusSaving}
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  <option value={lead.status}>{LEAD_STATUSES[lead.status]?.label || lead.status}</option>
                  {transitions
                    .filter((key) => key !== lead.status)
                    .map((key) => (
                      <option key={key} value={key}>
                        {LEAD_STATUSES[key]?.label || key}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="crm-followup">
              <span className="form-label">{t('موعد المتابعة')}</span>
              {followUpLocked ? (
                <p className="form-hint">{t('لا يمكن تعيين متابعة لعميل مغلق أو مؤرشف.')}</p>
              ) : (
                <>
                  <input
                    type="date"
                    className="input"
                    aria-label={t('موعد المتابعة')}
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                  <div className="crm-followup-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={savingFollowUp}
                      onClick={handleSaveFollowUp}
                    >
                      {t('حفظ المتابعة')}
                    </button>
                    {lead.nextFollowUpAt && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={savingFollowUp}
                        onClick={handleClearFollowUp}
                      >
                        {t('إلغاء المتابعة')}
                      </button>
                    )}
                  </div>
                </>
              )}
              {lead.nextFollowUpAt && !followUpLocked && (
                <p className="form-hint crm-followup-current">
                  {t('الموعد الحالي: {date}', { date: formatDate(lead.nextFollowUpAt) })}
                  {followUpDays !== null && Math.abs(followUpDays) <= 7 && (
                    <span className={`crm-due ${followUpTone(lead.nextFollowUpAt)}`.trim()}>
                      {formatDueLabel(lead.nextFollowUpAt)}
                    </span>
                  )}
                </p>
              )}
              {followUpError && (
                <p className="form-error" role="alert">
                  {td(followUpError)}
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <h3 className="card-title">{t('الموظف المسؤول')}</h3>
            <div className="crm-assignee">
              {lead.assignedEmployee ? (
                <>
                  <span className="avatar">{initials(lead.assignedEmployee.fullName)}</span>
                  <span className="crm-assignee-name">{lead.assignedEmployee.fullName}</span>
                </>
              ) : (
                <>
                  <span className="avatar crm-avatar-empty">
                    <UserIcon size={16} />
                  </span>
                  <span className="muted-text">{t('غير معيّن')}</span>
                </>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="crm-assignee">{t('تعيين موظف')}</label>
              <select
                id="crm-assignee"
                value={lead.assignedEmployee?.id || ''}
                disabled={assigning}
                onChange={(e) => handleAssign(e.target.value)}
              >
                {!lead.assignedEmployee && <option value="">{t('— غير معيّن —')}</option>}
                {assigneeOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </option>
                ))}
              </select>
            </div>
          </section>
        </aside>
      </div>

      <Modal
        open={Boolean(closing)}
        onClose={() => {
          if (!statusSaving) setClosing(null);
        }}
        size="sm"
        title={closing === 'lost' ? t('تسجيل العميل كخسارة') : t('أرشفة العميل')}
        description={t('لا يمكن تغيير الحالة بعد ذلك، وتُلغى المتابعة المجدولة.')}
      >
        <form onSubmit={confirmClose}>
          <div className="form-group">
            <label htmlFor="crm-close-reason">{t('السبب (اختياري)')}</label>
            <textarea
              id="crm-close-reason"
              className="textarea"
              rows={3}
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              placeholder={t('مثلاً: السعر غير مناسب حالياً')}
              disabled={statusSaving}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-danger" disabled={statusSaving}>
              {statusSaving ? t('جاري الحفظ…') : closing === 'lost' ? t('تسجيل كخسارة') : t('أرشفة')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={statusSaving}
              onClick={() => setClosing(null)}
            >
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showConvert}
        onClose={() => {
          if (!converting) setShowConvert(false);
        }}
        title={t('تسجيل في دورة وتحصيل دفعة')}
        footer={
          convertSuccess ? (
            <>
              {convertSuccess.payment?.id && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => openPrint('payment', convertSuccess.payment.id)}
                >
                  <PrinterIcon />
                  {t('طباعة وصل القبض')}
                </button>
              )}
              <button
                type="button"
                className={convertSuccess.payment?.id ? 'btn btn-secondary' : 'btn btn-primary'}
                onClick={() => navigate(`/courses/${convertSuccess.course?.id}`)}
              >
                {t('فتح الدورة')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowConvert(false);
                  setConvertSuccess(null);
                }}
              >
                {t('إغلاق')}
              </button>
            </>
          ) : undefined
        }
      >
        {convertSuccess ? (
          <div className="crm-convert-success">
            <span className="dialog-icon">
              <CheckCircleIcon size={22} />
            </span>
            <div className="crm-convert-body">
              <p className="crm-convert-lead">
                {convertSuccess.enrollment?.paymentStatus === 'paid_in_full'
                  ? tr('تم تسجيل {name} في دورة {course} وتم تحصيل المبلغ كاملاً.', convertLeadVars)
                  : tr('تم تسجيل {name} في دورة {course} وتم تسجيل الدفعة.', convertLeadVars)}
              </p>
              <dl className="crm-defs crm-convert-summary">
                <div>
                  <dt>{t('حالة العميل')}</dt>
                  <dd>
                    <StatusBadge kind="lead" value={convertSuccess.lead?.status} />
                  </dd>
                </div>
                <div>
                  <dt>{t('المدفوع')}</dt>
                  <dd className="tnum">{formatMinor(convertSuccess.enrollment?.amountPaidMinor)}</dd>
                </div>
                <div>
                  <dt>{t('الإجمالي')}</dt>
                  <dd className="tnum">{formatMinor(convertSuccess.enrollment?.totalPriceMinor)}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConvertAndPay}>
            <p className="modal-hint">
              {t(
                'هذا الإجراء ينقل العميل إلى «مسجّل»، ينشئ الطالب، يسجّله في الدورة، ويسجّل دفعة حقيقية في المالية — وليس مجرد حالة «مدفوع» في الـ CRM.'
              )}
            </p>
            {convertError && (
              <p className="form-error" role="alert">
                {td(convertError)}
              </p>
            )}
            <div className="form-group">
              <label htmlFor="convert-course">{t('الدورة')}</label>
              <select
                id="convert-course"
                required
                value={convertForm.courseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                disabled={converting}
              >
                <option value="">{t('— اختر دورة —')}</option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.priceMinor != null ? ` · ${formatMinor(c.priceMinor)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="convert-amount">
                {t('مبلغ الدفعة ({currency})', { currency: getCurrencyLabel() })}
              </label>
              <input
                id="convert-amount"
                required
                className="ltr"
                inputMode="numeric"
                value={convertForm.amountMinor}
                onChange={(e) =>
                  setConvertForm({ ...convertForm, amountMinor: formatAmountInput(e.target.value) })
                }
                disabled={converting}
                placeholder={selectedCourse ? formatAmountInput(String(selectedCourse.priceMinor)) : '0'}
              />
              {selectedCourse && (
                <span className="form-hint">
                  {t('سعر الدورة: {price} — يمكنك تسجيل دفعة جزئية', {
                    price: formatMinor(selectedCourse.priceMinor),
                  })}
                </span>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="convert-method">{t('طريقة الدفع')}</label>
                <select
                  id="convert-method"
                  value={convertForm.method}
                  onChange={(e) => setConvertForm({ ...convertForm, method: e.target.value })}
                  disabled={converting}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {t(m.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="convert-note">{t('ملاحظة (اختياري)')}</label>
                <input
                  id="convert-note"
                  value={convertForm.note}
                  onChange={(e) => setConvertForm({ ...convertForm, note: e.target.value })}
                  disabled={converting}
                />
              </div>
            </div>
            {!courseOptions.length && <p className="form-error">{t('لا توجد دورات متاحة للتسجيل')}</p>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={converting || !courseOptions.length}>
                <CoinsIcon />
                {converting ? t('جاري التسجيل…') : t('تأكيد التسجيل والتحصيل')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={converting}
                onClick={() => setShowConvert(false)}
              >
                {t('إلغاء')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
