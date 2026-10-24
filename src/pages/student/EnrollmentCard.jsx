import { Link } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge';
import { CertificateIcon, CheckIcon, CoinsIcon, EditIcon, UndoIcon } from '../../components/icons';
import { useI18n } from '../../i18n';
import { formatDate, formatMinor } from '../../utils/formatters';
import { statusLabel } from '../../utils/statusMaps';
import { ENROLLMENT_STEPS, attendanceRate, enrollmentAction, nextEnrollmentStep, refundableAmount } from './studentStatus';

/** The four steps of one enrollment; a dropped enrollment shows where it stopped. */
export function EnrollmentStepper({ status, droppedReason }) {
  // Subscribes to the language so the step labels switch with it.
  useI18n();
  const dropped = status === 'dropped';
  const current = ENROLLMENT_STEPS.indexOf(status);
  return (
    <div className={`enr-stepper ${dropped ? 'is-dropped' : ''}`}>
      <ol>
        {ENROLLMENT_STEPS.map((step, i) => {
          const state = dropped ? 'off' : i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={step} className={`enr-step is-${state}`}>
              <span className="enr-step-dot" aria-hidden="true">
                {state === 'done' ? <CheckIcon size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="enr-step-label">{statusLabel('enrollment', step)}</span>
            </li>
          );
        })}
      </ol>
      {dropped && (
        <p className="enr-dropped">
          <StatusBadge kind="enrollment" value="dropped" />
          {droppedReason && <span>{droppedReason}</span>}
        </p>
      )}
    </div>
  );
}

/**
 * One course a student is enrolled in: steps, payment, attendance and the actions staff take.
 * Handlers come from StudentDetail; a missing handler hides its button.
 */
export default function EnrollmentCard({
  enrollment: e,
  attendance,
  droppedReason,
  onNextStep,
  onCertify,
  onChangeStatus,
  onPayment,
  onRefund,
}) {
  const { t } = useI18n();
  const total = Number(e.totalPriceMinor ?? 0);
  const paid = Number(e.amountPaidMinor ?? 0);
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 100;
  const rate = attendanceRate(attendance);
  const next = nextEnrollmentStep(e);
  const certificate = (e.certificates || []).find((c) => c.status === 'issued');
  const canCertify = e.paymentStatus === 'paid_in_full';
  const refundable = refundableAmount(e);

  return (
    <article className="card enr-card">
      <header className="enr-card-head">
        <div className="enr-card-title">
          {e.course?.id ? (
            <Link to={`/courses/${e.course.id}`}>{e.course.name}</Link>
          ) : (
            <span>{e.course?.name || '—'}</span>
          )}
          <span className="enr-card-sub tnum">
            {t('سُجّل في {date}', { date: formatDate(e.enrolledAt) })}
          </span>
        </div>
        <StatusBadge kind="enrollment" value={e.enrollmentStatus} />
      </header>

      <EnrollmentStepper status={e.enrollmentStatus} droppedReason={droppedReason} />

      <div className="enr-metrics">
        <div className="enr-metric">
          <div className="enr-metric-top">
            <span className="enr-metric-label">{t('الدفع')}</span>
            <StatusBadge kind="payment" value={e.paymentStatus} />
          </div>
          <div className="enr-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span className={`enr-bar-fill ${percent >= 100 ? 'is-full' : ''}`} style={{ inlineSize: `${percent}%` }} />
          </div>
          <span className="enr-metric-value tnum">
            {t('{paid} من {total}', { paid: formatMinor(paid), total: formatMinor(total) })}
          </span>
        </div>
        <div className="enr-metric">
          <div className="enr-metric-top">
            <span className="enr-metric-label">{t('الحضور')}</span>
            {rate != null && <strong className="tnum">{rate}%</strong>}
          </div>
          <div className="enr-bar">
            <span className="enr-bar-fill is-attendance" style={{ inlineSize: `${rate ?? 0}%` }} />
          </div>
          <span className="enr-metric-value tnum">
            {attendance?.total
              ? t('حضر {n} من {total} جلسة مسجّلة', {
                  n: attendance.present + attendance.late,
                  total: attendance.total,
                })
              : t('لا يوجد حضور مسجّل بعد')}
          </span>
        </div>
        {certificate && (
          <div className="enr-metric enr-cert">
            <CertificateIcon size={18} />
            <span>{t('شهادة صادرة في {date}', { date: formatDate(certificate.issuedAt) })}</span>
          </div>
        )}
      </div>

      <footer className="enr-actions">
        {next === 'certify' && onCertify && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onCertify(e)}
            disabled={!canCertify}
            title={canCertify ? undefined : t('يجب سداد الرسوم كاملة قبل إصدار الشهادة')}
          >
            <CertificateIcon size={16} />
            {t('إصدار شهادة')}
          </button>
        )}
        {next && next !== 'certify' && onNextStep && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onNextStep(e, next)}>
            {next === 'enrolled' ? <UndoIcon size={16} /> : <CheckIcon size={16} />}
            {t(enrollmentAction(e.enrollmentStatus, next).label)}
          </button>
        )}
        {onPayment && paid < total && e.enrollmentStatus !== 'dropped' && (
          <button type="button" className="btn btn-soft btn-sm" onClick={() => onPayment(e)}>
            <CoinsIcon size={16} />
            {t('تسجيل دفعة')}
          </button>
        )}
        {onRefund && refundable > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRefund(e)}>
            {t('استرداد مبلغ')}
          </button>
        )}
        {onChangeStatus && (e.allowedTransitions || []).length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm enr-more" onClick={() => onChangeStatus(e)}>
            <EditIcon size={16} />
            {t('تغيير الحالة')}
          </button>
        )}
        {next === 'certify' && !canCertify && onCertify && (
          <span className="enr-hint">{t('يجب سداد الرسوم كاملة قبل إصدار الشهادة')}</span>
        )}
      </footer>
    </article>
  );
}
