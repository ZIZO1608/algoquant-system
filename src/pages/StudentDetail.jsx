import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { PageLoading } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useDialog } from '../components/DialogProvider';
import {
  AlertIcon,
  ArrowBackIcon,
  BanIcon,
  BookIcon,
  CalendarIcon,
  CertificateIcon,
  CoinsIcon,
  EditIcon,
  GraduationIcon,
  PauseCircleIcon,
  PlusIcon,
  PrinterIcon,
  ReceiptIcon,
  TrashIcon,
  WalletIcon,
} from '../components/icons';
import { useEntity } from '../hooks/useEntity';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import {
  formatAmountInput,
  formatDate,
  formatMinor,
  getCurrencyLabel,
  initials,
  parseMinorInput,
  studentBalance,
} from '../utils/formatters';
import { paymentMethodLabel } from '../utils/paymentMethods';
import { statusLabel } from '../utils/statusMaps';
import { studentsApi, walletsApi } from '../api/client';
import { usePrint } from '../print/PrintProvider';
import { formatDocNumber, normalizePrintSettings } from '../print/printSettings';
import EnrollmentCard from './student/EnrollmentCard';
import StatusHistory from './student/StatusHistory';
import {
  EnrollmentStatusModal,
  PaymentModal,
  RefundModal,
  StudentStatusModal,
  VoidPaymentModal,
} from './student/StudentModals';
import { attendanceRate, refundableAmount } from './student/studentStatus';
import './StudentDetail.css';
import './student/student.css';

const STUDENT_TABS = ['overview', 'courses', 'payments', 'attendance', 'certificates', 'evaluations', 'history'];

const STATUS_ICONS = {
  frozen: PauseCircleIcon,
  graduated: GraduationIcon,
  withdrawn: ArrowBackIcon,
  blocked: BanIcon,
};

export default function StudentDetail() {
  const { id } = useParams();
  const { refreshData, courses, hasPrivilege, settings: appSettings } = useApp();
  const { t, td } = useI18n();
  const toast = useToast();
  const { confirm } = useDialog();
  const openPrint = usePrint();
  const { data: student, loading, error, reload } = useEntity(studentsApi.get, id);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(STUDENT_TABS.includes(urlTab) ? urlTab : 'overview');

  // The open tab lives in the address, so a tab can be linked to and survives a refresh.
  useEffect(() => {
    if (STUDENT_TABS.includes(urlTab) && urlTab !== activeTab) setActiveTab(urlTab);
  }, [urlTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTab = (id) => {
    setActiveTab(id);
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ courseId: '', totalPriceMinor: '' });
  const [enrollError, setEnrollError] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  // One dialog at a time: { type, enrollment?, payment?, status? }
  const [dialog, setDialog] = useState(null);

  const printSettings = useMemo(() => normalizePrintSettings(appSettings?.printSettings), [appSettings?.printSettings]);
  const isAdmin = hasPrivilege('admin');
  const canEnroll = isAdmin || hasPrivilege('operation');
  const canOps = isAdmin || hasPrivilege('operation');
  const canPayment = isAdmin || hasPrivilege('operation') || hasPrivilege('accountant');
  const canFinance = isAdmin || hasPrivilege('accountant');
  const canPrintReceipt = canPayment || hasPrivilege('sales');

  const refresh = async () => {
    await reload();
    await refreshData();
  };

  const receiptNumber = (p) => formatDocNumber(printSettings.docs.payment.prefix, p.receiptNo, printSettings.look.numberPadding);
  const refundNumber = (r) => formatDocNumber(printSettings.docs.refund.prefix, r.voucherNo, printSettings.look.numberPadding);

  /* ── Actions ───────────────────────────────────────────────────────────── */

  const openEnroll = () => {
    setEnrollError('');
    setEnrollForm({ courseId: '', totalPriceMinor: '' });
    setShowEnroll(true);
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    setEnrolling(true);
    setEnrollError('');
    try {
      await studentsApi.enroll(enrollForm.courseId, {
        studentId: id,
        totalPriceMinor: enrollForm.totalPriceMinor ? parseMinorInput(enrollForm.totalPriceMinor) : undefined,
      });
      await refresh();
      setShowEnroll(false);
      toast.success(t('تم تسجيل الطالب في الدورة'));
    } catch (err) {
      setEnrollError(err.message);
    } finally {
      setEnrolling(false);
    }
  };

  const setStudentStatus = async (status, reason) => {
    await studentsApi.setStatus(id, status, reason);
    await refresh();
    toast.success(t('تم تحديث حالة الطالب'));
  };

  const transitionEnrollment = async (enrollment, toStatus, reason) => {
    await studentsApi.transitionEnrollment(enrollment.id, toStatus, reason);
    await refresh();
    toast.success(t('تم تحديث حالة التسجيل'));
  };

  const handleNextStep = async (enrollment, toStatus) => {
    // Reinstating takes a seat again; ask first. Plain forward steps apply at once.
    if (toStatus === 'enrolled') {
      const ok = await confirm({
        title: t('إعادة التسجيل'),
        message: t('سيعود الطالب إلى دورة «{course}» ويُحجز له مقعد. هل تريد المتابعة؟', {
          course: enrollment.course?.name || '—',
        }),
        confirmLabel: t('إعادة التسجيل'),
      });
      if (!ok) return;
    }
    try {
      await transitionEnrollment(enrollment, toStatus);
    } catch (err) {
      toast.error(td(err.message));
    }
  };

  const handleCertify = async (enrollment) => {
    const ok = await confirm({
      title: t('إصدار شهادة'),
      message: t('سيتم إصدار شهادة إتمام لهذا التسجيل. هل تريد المتابعة؟'),
      confirmLabel: t('إصدار'),
    });
    if (!ok) return;
    try {
      await studentsApi.issueCertificate(enrollment.id);
      await refresh();
      toast.success(t('تم إصدار الشهادة'));
    } catch (err) {
      toast.error(td(err.message));
    }
  };

  const handlePayment = async (enrollment, body, printAfter) => {
    const result = await studentsApi.recordPayment(enrollment.id, body);
    await refresh();
    toast.success(t('تم تسجيل الدفعة'));
    if (printAfter && result?.payment?.id) openPrint('payment', result.payment.id);
  };

  const handleRefund = async (enrollment, body) => {
    await walletsApi.initiateRefund({ enrollmentId: enrollment.id, ...body });
    await refresh();
    toast.success(t('تم إرسال طلب الاسترداد إلى المالية'));
  };

  const handleVoid = async (payment, reason) => {
    await studentsApi.voidPayment(payment.id, reason);
    await refresh();
    toast.success(t('تم إلغاء الدفعة'));
  };

  /* ── Loading / missing ─────────────────────────────────────────────────── */

  if (loading) {
    return (
      <AppShell>
        <PageLoading tiles={4} rows={6} />
      </AppShell>
    );
  }

  if (error || !student) {
    return (
      <AppShell>
        <EmptyState
          icon={<GraduationIcon />}
          title={t('الطالب غير موجود')}
          hint={error ? td(error) : t('ربما حُذف هذا الطالب أو أن الرابط غير صحيح.')}
          action={
            <Link to="/students" className="btn btn-secondary">
              <ArrowBackIcon />
              {t('العودة إلى الطلاب')}
            </Link>
          }
        />
      </AppShell>
    );
  }

  /* ── Derived data ──────────────────────────────────────────────────────── */

  const enrollments = student.enrollments || [];
  const attendance = student.attendance || [];
  const evaluations = student.evaluations || [];
  const history = student.statusHistory || [];
  const stats = student.attendanceStats || { total: 0, present: 0, late: 0, absent: 0, excused: 0, byCourse: {} };
  const allPayments = enrollments
    .flatMap((e) => (e.payments || []).map((p) => ({ ...p, courseName: e.course?.name })))
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  const refunds = enrollments
    .flatMap((e) => (e.refunds || []).map((r) => ({ ...r, courseName: e.course?.name })))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const certificates = enrollments.flatMap((e) =>
    (e.certificates || []).map((c) => ({ ...c, courseName: e.course?.name }))
  );
  const balance = studentBalance(enrollments);
  const totalPaid = enrollments.reduce((sum, e) => sum + Number(e.amountPaidMinor ?? 0), 0);
  const running = enrollments.filter((e) => ['enrolled', 'attending'].includes(e.enrollmentStatus));
  const finished = enrollments.filter((e) => ['completed', 'certified'].includes(e.enrollmentStatus));
  const rate = attendanceRate(stats);
  const status = student.status || 'active';
  const StatusIcon = STATUS_ICONS[status];
  const lastStudentChange = history.find((h) => h.entityType === 'student');
  const droppedReason = (enrollmentId) =>
    history.find((h) => h.entityType === 'enrollment' && h.entityId === enrollmentId && h.toStatus === 'dropped')?.reason;
  const suggestGraduate =
    canOps && status === 'active' && enrollments.length > 0 && running.length === 0 && finished.length > 0;
  const blocked = status === 'blocked';

  const tabs = [
    { id: 'overview', label: t('نظرة عامة') },
    { id: 'courses', label: t('الدورات'), count: enrollments.length },
    { id: 'payments', label: t('المدفوعات'), count: allPayments.length + refunds.length },
    { id: 'attendance', label: t('الحضور') },
    { id: 'certificates', label: t('الشهادات'), count: certificates.length },
    { id: 'evaluations', label: t('التقييمات'), count: evaluations.length },
    { id: 'history', label: t('سجل الحالة'), count: history.length },
  ];

  const cardHandlers = {
    onNextStep: canOps ? handleNextStep : undefined,
    onCertify: canOps ? handleCertify : undefined,
    onChangeStatus: canOps ? (e) => setDialog({ type: 'enrollment', enrollment: e }) : undefined,
    onPayment: canPayment ? (e) => setDialog({ type: 'payment', enrollment: e }) : undefined,
    onRefund: canFinance ? (e) => setDialog({ type: 'refund', enrollment: e }) : undefined,
  };

  const paymentColumns = [
    {
      key: 'number',
      label: t('رقم الوصل'),
      render: (p) => <span className="ltr tnum fw-700">{receiptNumber(p)}</span>,
    },
    { key: 'date', label: t('التاريخ'), render: (p) => <span className="tnum">{formatDate(p.paidAt)}</span> },
    { key: 'course', label: t('الدورة'), render: (p) => p.courseName || '—' },
    {
      key: 'amount',
      label: t('المبلغ'),
      render: (p) => (
        <span className={`tnum fw-700 ${p.voidedAt ? 'amount-voided' : ''}`}>{formatMinor(p.amountMinor)}</span>
      ),
    },
    {
      key: 'method',
      label: t('الطريقة'),
      render: (p) => paymentMethodLabel(p.method) || <span className="cell-muted">—</span>,
    },
    {
      key: 'receivedBy',
      label: t('المستلم'),
      render: (p) => p.receivedBy?.fullName || <span className="cell-muted">—</span>,
    },
    {
      key: 'state',
      label: t('الحالة'),
      render: (p) =>
        p.voidedAt ? (
          <span className="cell-stack">
            <span className="badge tone-danger">{t('ملغى|receipt')}</span>
            {p.voidReason && <span className="cell-muted">{p.voidReason}</span>}
          </span>
        ) : (
          <span className="badge tone-success">{t('صالح')}</span>
        ),
    },
    {
      key: 'actions',
      label: t('إجراءات'),
      render: (p) => (
        <div className="cell-actions">
          {canPrintReceipt && (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => openPrint('payment', p.id)}
              aria-label={t('طباعة الوصل {number}', { number: receiptNumber(p) })}
              title={t('طباعة الوصل')}
            >
              <PrinterIcon size={18} />
            </button>
          )}
          {canFinance && !p.voidedAt && (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm btn-danger-text"
              onClick={() => setDialog({ type: 'void', payment: p })}
              aria-label={t('إلغاء الدفعة')}
              title={t('إلغاء الدفعة')}
            >
              <TrashIcon size={18} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const refundColumns = [
    { key: 'number', label: t('رقم السند'), render: (r) => <span className="ltr tnum fw-700">{refundNumber(r)}</span> },
    { key: 'date', label: t('التاريخ'), render: (r) => <span className="tnum">{formatDate(r.createdAt)}</span> },
    { key: 'course', label: t('الدورة'), render: (r) => r.courseName || '—' },
    { key: 'amount', label: t('المبلغ'), render: (r) => <span className="tnum fw-700">{formatMinor(r.amountMinor)}</span> },
    { key: 'reason', label: t('السبب'), render: (r) => r.reason || '—' },
    { key: 'status', label: t('الحالة'), render: (r) => <StatusBadge kind="refund" value={r.status} /> },
    {
      key: 'actions',
      label: t('إجراءات'),
      render: (r) =>
        canFinance ? (
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => openPrint('refund', r.id)}
            aria-label={t('طباعة سند الاسترداد')}
            title={t('طباعة سند الاسترداد')}
          >
            <PrinterIcon size={18} />
          </button>
        ) : null,
    },
  ];

  const attendanceColumns = [
    {
      key: 'session',
      label: t('الجلسة'),
      render: (a) => (a.session?.sessionNumber != null ? t('الجلسة {n}', { n: a.session.sessionNumber }) : '—'),
    },
    { key: 'course', label: t('الدورة'), render: (a) => a.session?.course?.name || '—' },
    { key: 'status', label: t('الحالة'), render: (a) => <StatusBadge kind="attendance" value={a.status} /> },
    { key: 'date', label: t('التاريخ'), render: (a) => <span className="tnum">{formatDate(a.markedAt)}</span> },
  ];

  const evaluationColumns = [
    { key: 'date', label: t('التاريخ'), render: (ev) => <span className="tnum">{formatDate(ev.submittedAt)}</span> },
    { key: 'courseScore', label: t('المحاور'), className: 'tnum', render: (ev) => ev.courseScore ?? '—' },
    { key: 'teacherScore', label: t('المدرّب'), className: 'tnum', render: (ev) => ev.teacherScore ?? '—' },
    { key: 'hallScore', label: t('القاعة'), className: 'tnum', render: (ev) => ev.hallScore ?? '—' },
    {
      key: 'benefit',
      label: t('الإفادة'),
      render: (ev) =>
        ev.benefitLevel != null
          ? `${ev.benefitLevel}${ev.benefitReason ? ` — ${ev.benefitReason}` : ''}`
          : '—',
    },
    { key: 'recommended', label: t('ترشيح دورات'), render: (ev) => ev.recommendedCourses || '—' },
    { key: 'comment', label: t('ملاحظات'), render: (ev) => ev.comment || '—' },
  ];

  const statementButton = canPrintReceipt ? (
    <button type="button" className="btn btn-secondary" onClick={() => openPrint('statement', student.id)}>
      <ReceiptIcon />
      {t('كشف حساب')}
    </button>
  ) : null;

  const enrollableCourses = courses.filter(
    (c) => ['enrollment_open', 'active'].includes(c.status) && !enrollments.some((e) => e.course?.id === c.id)
  );

  return (
    <AppShell>
      <nav className="breadcrumb" aria-label={t('مسار التنقل')}>
        <Link to="/students">{t('الطلاب')}</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{student.fullName}</span>
      </nav>

      <div className="page-header">
        <div className="student-heading">
          <span className="avatar avatar-lg">{initials(student.fullName)}</span>
          <div className="student-heading-text">
            <div className="student-title-row">
              <h1 className="page-title">{student.fullName}</h1>
              {canOps ? (
                <button
                  type="button"
                  className="student-status-button"
                  onClick={() => setDialog({ type: 'student' })}
                  title={t('تغيير حالة الطالب')}
                >
                  <StatusBadge kind="student" value={status} />
                  <EditIcon size={14} />
                </button>
              ) : (
                <StatusBadge kind="student" value={status} />
              )}
            </div>
            <p className="page-subtitle student-meta">
              <span className="ltr tnum">{student.phone || '—'}</span>
              {student.email && (
                <>
                  <span className="student-meta-sep" aria-hidden="true">·</span>
                  <span className="ltr">{student.email}</span>
                </>
              )}
              <span className="student-meta-sep" aria-hidden="true">·</span>
              <span className="tnum">{t('طالب منذ {date}', { date: formatDate(student.createdAt) })}</span>
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          {statementButton}
          {canEnroll && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openEnroll}
              disabled={blocked}
              title={blocked ? t('الطالب محظور — ارفع الحظر أولاً لتسجيله') : undefined}
            >
              <PlusIcon />
              {t('تسجيل في دورة')}
            </button>
          )}
        </div>
      </div>

      {status !== 'active' && (
        <div className={`student-status-banner tone-${status}`}>
          {StatusIcon && <StatusIcon size={22} />}
          <div className="student-status-banner-text">
            <strong>
              {student.statusChangedAt || lastStudentChange
                ? t('الحالة: {status} منذ {date}', {
                    status: statusLabel('student', status),
                    date: formatDate(student.statusChangedAt || lastStudentChange.createdAt),
                  })
                : t('الحالة: {status}', { status: statusLabel('student', status) })}
            </strong>
            {student.statusReason && <span>{td(student.statusReason)}</span>}
          </div>
          {canOps && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDialog({ type: 'student', status: 'active' })}
            >
              {t('إعادة التفعيل')}
            </button>
          )}
        </div>
      )}

      {suggestGraduate && (
        <div className="callout student-suggest">
          <GraduationIcon size={20} />
          <span>{t('أنهى الطالب كل دوراته. هل تريد تحويل حالته إلى «خرّيج»؟')}</span>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={() => setDialog({ type: 'student', status: 'graduated' })}
          >
            {t('تحويل إلى خرّيج')}
          </button>
        </div>
      )}

      <div className="grid-4 student-kpis">
        <StatCard
          value={running.length}
          label={t('دورات جارية')}
          hint={t('من أصل {n} تسجيلات', { n: enrollments.length })}
          icon={<BookIcon />}
        />
        <StatCard value={formatMinor(totalPaid)} label={t('إجمالي المدفوع')} icon={<WalletIcon />} variant="success" />
        <StatCard
          value={formatMinor(balance)}
          label={t('الرصيد المستحق')}
          icon={<CoinsIcon />}
          variant={balance > 0 ? 'warning' : undefined}
          hint={balance > 0 ? t('غير مسدّد') : t('لا يوجد رصيد مستحق')}
        />
        <StatCard
          value={rate != null ? `${rate}%` : '—'}
          label={t('نسبة الحضور')}
          icon={<CalendarIcon />}
          hint={
            stats.total
              ? t('حضر {n} من {total} جلسة مسجّلة', { n: stats.present + stats.late, total: stats.total })
              : t('لا يوجد حضور مسجّل بعد')
          }
        />
      </div>

      <div className="tabs" role="tablist" aria-label={t('أقسام ملف الطالب')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
            {tab.count != null && <span className="tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="student-overview">
          <div className="card">
            <h3 className="card-title">{t('بيانات الطالب')}</h3>
            <dl className="detail-grid">
              <div>
                <dt>{t('الاسم الكامل')}</dt>
                <dd>{student.fullName}</dd>
              </div>
              <div>
                <dt>{t('الحالة')}</dt>
                <dd>
                  <StatusBadge kind="student" value={status} />
                </dd>
              </div>
              <div>
                <dt>{t('الهاتف')}</dt>
                <dd>
                  <span className="ltr tnum">{student.phone || '—'}</span>
                </dd>
              </div>
              <div>
                <dt>{t('البريد الإلكتروني')}</dt>
                <dd>
                  <span className="ltr">{student.email || '—'}</span>
                </dd>
              </div>
              <div>
                <dt>{t('الرصيد المستحق')}</dt>
                <dd>
                  {balance > 0 ? (
                    <span className="amount-negative">{formatMinor(balance)}</span>
                  ) : (
                    <span className="muted-text">{t('لا يوجد')}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('الشهادات')}</dt>
                <dd className="tnum">{certificates.filter((c) => c.status === 'issued').length}</dd>
              </div>
              {student.notes && (
                <div className="detail-grid-full">
                  <dt>{t('ملاحظات')}</dt>
                  <dd className="detail-notes">{student.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <div className="card-header-row">
              <h3 className="card-title">{t('الدورات')}</h3>
              {enrollments.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => selectTab('courses')}>
                  {t('عرض التفاصيل')}
                </button>
              )}
            </div>
            {enrollments.length === 0 ? (
              <p className="empty-state">{t('لا توجد تسجيلات بعد')}</p>
            ) : (
              <ul className="student-course-list">
                {enrollments.map((e) => {
                  const total = Number(e.totalPriceMinor ?? 0);
                  const paid = Number(e.amountPaidMinor ?? 0);
                  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 100;
                  return (
                    <li key={e.id} className="student-course-row">
                      {e.course?.id ? (
                        <Link to={`/courses/${e.course.id}`} className="student-course-name">
                          {e.course.name}
                        </Link>
                      ) : (
                        <span className="student-course-name">—</span>
                      )}
                      <StatusBadge kind="enrollment" value={e.enrollmentStatus} />
                      <button
                        type="button"
                        className="student-course-progress"
                        onClick={() => selectTab('courses')}
                        title={t('نسبة المدفوع من قيمة التسجيل')}
                      >
                        <span className="enr-bar student-course-bar" aria-hidden="true">
                          <span className={`enr-bar-fill ${percent >= 100 ? 'is-full' : ''}`} style={{ inlineSize: `${percent}%` }} />
                        </span>
                        <span className="student-course-paid tnum">{t('مدفوع {percent}%', { percent })}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === 'courses' &&
        (enrollments.length === 0 ? (
          <EmptyState
            icon={<BookIcon />}
            title={t('لا توجد تسجيلات بعد')}
            hint={t('سجّل الطالب في دورة لتظهر هنا مع حالة الحضور والدفع.')}
            action={
              canEnroll && !blocked ? (
                <button type="button" className="btn btn-primary" onClick={openEnroll}>
                  <PlusIcon />
                  {t('تسجيل في دورة')}
                </button>
              ) : null
            }
          />
        ) : (
          <div className="enr-list">
            {enrollments.map((e) => (
              <EnrollmentCard
                key={e.id}
                enrollment={e}
                attendance={stats.byCourse?.[e.course?.id]}
                droppedReason={droppedReason(e.id)}
                {...cardHandlers}
              />
            ))}
          </div>
        ))}

      {activeTab === 'payments' && (
        <div className="student-payments">
          <div className="card card-flush">
            <div className="card-header-row">
              <h3 className="card-title">{t('الدفعات والإيصالات')}</h3>
              {statementButton && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPrint('statement', student.id)}>
                  <PrinterIcon size={16} />
                  {t('طباعة كشف الحساب')}
                </button>
              )}
            </div>
            <DataTable columns={paymentColumns} rows={allPayments} emptyMessage={t('لا توجد مدفوعات بعد')} minWidth={860} />
          </div>
          {refunds.length > 0 && (
            <div className="card card-flush">
              <div className="card-header-row">
                <h3 className="card-title">{t('طلبات الاسترداد')}</h3>
              </div>
              <DataTable columns={refundColumns} rows={refunds} minWidth={760} />
            </div>
          )}
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="card card-flush">
          <DataTable columns={attendanceColumns} rows={attendance} emptyMessage={t('لا يوجد سجل حضور بعد')} />
        </div>
      )}

      {activeTab === 'certificates' && (
        <div className="card">
          <h3 className="card-title">{t('الشهادات')}</h3>
          {certificates.length === 0 ? (
            <p className="empty-state">{t('لا توجد شهادات بعد')}</p>
          ) : (
            <ul className="cert-list">
              {certificates.map((c) => (
                <li key={c.id} className="cert-row">
                  <span className="cert-icon">
                    <CertificateIcon size={20} />
                  </span>
                  <div className="cert-body">
                    <span className="cert-course">{c.courseName || '—'}</span>
                    <span className="cert-date tnum">{formatDate(c.issuedAt)}</span>
                  </div>
                  <StatusBadge kind="certificate" value={c.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'evaluations' && (
        <div className="card card-flush">
          <DataTable
            columns={evaluationColumns}
            rows={evaluations}
            emptyMessage={t('لا توجد تقييمات بعد')}
            minWidth={860}
          />
        </div>
      )}

      {activeTab === 'history' && <StatusHistory history={history} />}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      <Modal
        open={showEnroll}
        onClose={() => setShowEnroll(false)}
        title={t('تسجيل في دورة')}
        description={t('تسجيل {name} في دورة جديدة', { name: student.fullName })}
      >
        <form onSubmit={handleEnroll}>
          {enrollError && (
            <p className="form-error" role="alert">
              <AlertIcon size={16} />
              {td(enrollError)}
            </p>
          )}
          {status !== 'active' && !blocked && (
            <p className="callout">
              <AlertIcon size={18} />
              <span>
                {t('حالة الطالب الآن «{status}»، وسيعود «نشطاً» تلقائياً عند تسجيله.', {
                  status: statusLabel('student', status),
                })}
              </span>
            </p>
          )}
          <div className="form-group">
            <label htmlFor="enroll-course">{t('الدورة')}</label>
            <select
              id="enroll-course"
              required
              value={enrollForm.courseId}
              onChange={(e) => setEnrollForm({ ...enrollForm, courseId: e.target.value })}
            >
              <option value="">{t('— اختر دورة —')}</option>
              {enrollableCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {formatMinor(c.priceMinor)}
                </option>
              ))}
            </select>
            {enrollableCourses.length === 0 && (
              <span className="form-hint">{t('لا توجد دورات مفتوحة للتسجيل لم يُسجَّل فيها الطالب بعد.')}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="enroll-price">
              {t('السعر ({currency}) — اختياري', { currency: getCurrencyLabel() })}
            </label>
            <input
              id="enroll-price"
              type="text"
              inputMode="numeric"
              className="ltr"
              placeholder="100,000"
              value={enrollForm.totalPriceMinor}
              onChange={(e) => setEnrollForm({ ...enrollForm, totalPriceMinor: formatAmountInput(e.target.value) })}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={enrolling || !enrollForm.courseId}>
              {enrolling ? t('جاري التسجيل…') : t('تسجيل|verb')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowEnroll(false)}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      {dialog?.type === 'student' && (
        <StudentStatusModal
          student={student}
          initialStatus={dialog.status}
          onClose={() => setDialog(null)}
          onSubmit={setStudentStatus}
        />
      )}
      {dialog?.type === 'enrollment' && (
        <EnrollmentStatusModal
          enrollment={dialog.enrollment}
          onClose={() => setDialog(null)}
          onSubmit={(toStatus, reason) => transitionEnrollment(dialog.enrollment, toStatus, reason)}
        />
      )}
      {dialog?.type === 'payment' && (
        <PaymentModal
          enrollment={dialog.enrollment}
          onClose={() => setDialog(null)}
          onSubmit={(body, printAfter) => handlePayment(dialog.enrollment, body, printAfter)}
        />
      )}
      {dialog?.type === 'refund' && (
        <RefundModal
          enrollment={dialog.enrollment}
          refundable={refundableAmount(dialog.enrollment)}
          onClose={() => setDialog(null)}
          onSubmit={(body) => handleRefund(dialog.enrollment, body)}
        />
      )}
      {dialog?.type === 'void' && (
        <VoidPaymentModal
          payment={dialog.payment}
          receiptNumber={receiptNumber(dialog.payment)}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => handleVoid(dialog.payment, reason)}
        />
      )}
    </AppShell>
  );
}
