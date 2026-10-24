import { useState } from 'react';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { AlertIcon } from '../../components/icons';
import { useI18n } from '../../i18n';
import { formatAmountInput, formatMinor, getCurrencyLabel, parseMinorInput } from '../../utils/formatters';
import { PAYMENT_METHODS } from '../../utils/paymentMethods';
import { STATUS_NEEDS_REASON, STUDENT_STATUSES, STUDENT_STATUS_HELP, enrollmentAction } from './studentStatus';

function FormError({ message }) {
  const { td } = useI18n();
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      <AlertIcon size={16} />
      {td(message)}
    </p>
  );
}

/** Runs an async submit with saving + error state; the caller closes the modal on success. */
function useSubmit() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setSaving(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err.message || 'تعذّر إتمام الطلب. حاول مرة أخرى.');
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, run };
}

/** Choose the student's overall status, with a reason where the rules need one. */
export function StudentStatusModal({ student, initialStatus, onClose, onSubmit }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(
    initialStatus || STUDENT_STATUSES.find((s) => s !== student.status)
  );
  const [reason, setReason] = useState('');
  const { saving, error, setError, run } = useSubmit();
  const needsReason = STATUS_NEEDS_REASON.has(status);

  const submit = async (e) => {
    e.preventDefault();
    if (needsReason && !reason.trim()) {
      setError('اكتب سبب تغيير الحالة');
      return;
    }
    if (await run(() => onSubmit(status, reason.trim()))) onClose();
  };

  return (
    <Modal open onClose={onClose} title={t('تغيير حالة الطالب')} description={student.fullName} size="lg">
      <form onSubmit={submit}>
        <FormError message={error} />
        <div className="choice-list" role="radiogroup" aria-label={t('الحالة الجديدة')}>
          {STUDENT_STATUSES.map((value) => {
            const current = value === student.status;
            return (
              <label key={value} className={`choice-card ${status === value ? 'is-selected' : ''} ${current ? 'is-current' : ''}`}>
                <input
                  type="radio"
                  name="student-status"
                  value={value}
                  checked={status === value}
                  disabled={current}
                  onChange={() => setStatus(value)}
                />
                <span className="choice-card-body">
                  <span className="choice-card-title">
                    <StatusBadge kind="student" value={value} />
                    {current && <span className="choice-card-tag">{t('الحالة الحالية')}</span>}
                  </span>
                  <span className="choice-card-help">{t(STUDENT_STATUS_HELP[value])}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="form-group">
          <label htmlFor="student-status-reason">
            {needsReason ? t('السبب (مطلوب)') : t('السبب (اختياري)')}
          </label>
          <textarea
            id="student-status-reason"
            rows={2}
            value={reason}
            required={needsReason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || !status || status === student.status}>
            {saving ? t('جاري الحفظ…') : t('حفظ الحالة')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Move one enrollment to another allowed step (drop needs a reason). */
export function EnrollmentStatusModal({ enrollment, initialStatus, onClose, onSubmit }) {
  const { t } = useI18n();
  const options = enrollment.allowedTransitions || [];
  const [status, setStatus] = useState(initialStatus && options.includes(initialStatus) ? initialStatus : options[0]);
  const [reason, setReason] = useState('');
  const { saving, error, setError, run } = useSubmit();
  const needsReason = status === 'dropped';

  const submit = async (e) => {
    e.preventDefault();
    if (needsReason && !reason.trim()) {
      setError('اكتب سبب الانسحاب');
      return;
    }
    if (await run(() => onSubmit(status, reason.trim()))) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('تغيير حالة التسجيل')}
      description={enrollment.course?.name}
      size="lg"
    >
      <form onSubmit={submit}>
        <FormError message={error} />
        <p className="modal-hint enr-modal-current">
          {t('الحالة الحالية')}: <StatusBadge kind="enrollment" value={enrollment.enrollmentStatus} />
        </p>
        <div className="choice-list" role="radiogroup" aria-label={t('الحالة الجديدة')}>
          {options.map((value) => {
            const action = enrollmentAction(enrollment.enrollmentStatus, value);
            return (
              <label key={value} className={`choice-card tone-${action.tone} ${status === value ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="enrollment-status"
                  value={value}
                  checked={status === value}
                  onChange={() => setStatus(value)}
                />
                <span className="choice-card-body">
                  <span className="choice-card-title">
                    {t(action.label)}
                    <StatusBadge kind="enrollment" value={value} />
                  </span>
                  <span className="choice-card-help">{t(action.help)}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="form-group">
          <label htmlFor="enr-status-reason">{needsReason ? t('سبب الانسحاب (مطلوب)') : t('ملاحظة (اختياري)')}</label>
          <textarea
            id="enr-status-reason"
            rows={2}
            value={reason}
            required={needsReason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className={`btn ${needsReason ? 'btn-danger' : 'btn-primary'}`} disabled={saving || !status}>
            {saving ? t('جاري الحفظ…') : t('تأكيد')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const PRINT_AFTER_KEY = 'algo_print_after_payment';

function readPrintAfter() {
  try {
    return localStorage.getItem(PRINT_AFTER_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Record a payment; optionally print its receipt right after. */
export function PaymentModal({ enrollment, onClose, onSubmit }) {
  const { t } = useI18n();
  const remaining = Math.max(0, Number(enrollment.totalPriceMinor ?? 0) - Number(enrollment.amountPaidMinor ?? 0));
  const [form, setForm] = useState({ amount: '', method: 'cash', note: '' });
  const [printAfter, setPrintAfter] = useState(readPrintAfter);
  const { saving, error, setError, run } = useSubmit();
  const amount = parseMinorInput(form.amount);

  const togglePrint = (checked) => {
    setPrintAfter(checked);
    try {
      localStorage.setItem(PRINT_AFTER_KEY, checked ? '1' : '0');
    } catch {
      // remembered for this dialog only
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (amount <= 0) {
      setError('أدخل مبلغ الدفعة (أكبر من صفر)');
      return;
    }
    if (amount > remaining) {
      setError('مبلغ الدفع يتجاوز إجمالي سعر التسجيل');
      return;
    }
    const ok = await run(() => onSubmit({ amountMinor: amount, method: form.method, note: form.note.trim() }, printAfter));
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('تسجيل دفعة')}
      description={t('دورة {course} · المتبقي {remaining}', {
        course: enrollment.course?.name || '—',
        remaining: formatMinor(remaining),
      })}
    >
      <form onSubmit={submit}>
        <FormError message={error} />
        <div className="form-group">
          <label htmlFor="payment-amount">{t('المبلغ ({currency})', { currency: getCurrencyLabel() })}</label>
          <div className="input-with-action">
            <input
              id="payment-amount"
              type="text"
              inputMode="numeric"
              required
              className="ltr"
              placeholder="1,000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: formatAmountInput(e.target.value) })}
            />
            {remaining > 0 && (
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => setForm({ ...form, amount: formatAmountInput(String(remaining)) })}
              >
                {t('كامل المتبقي')}
              </button>
            )}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="payment-method">{t('طريقة الدفع')}</label>
            <select id="payment-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.label)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="payment-note">{t('ملاحظة')}</label>
            <input id="payment-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={printAfter} onChange={(e) => togglePrint(e.target.checked)} />
          {t('طباعة وصل القبض بعد الحفظ')}
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('جاري الحفظ…') : t('حفظ الدفعة')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Ask for a refund on an enrollment; finance approves and pays it from the Finance page. */
export function RefundModal({ enrollment, refundable, onClose, onSubmit }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ amount: '', reason: '' });
  const { saving, error, setError, run } = useSubmit();
  const amount = parseMinorInput(form.amount);

  const submit = async (e) => {
    e.preventDefault();
    if (amount <= 0) {
      setError('أدخل مبلغ الاسترداد (أكبر من صفر)');
      return;
    }
    if (amount > refundable) {
      setError('مبلغ الاسترداد يتجاوز المبلغ المدفوع القابل للاسترداد');
      return;
    }
    if (!form.reason.trim()) {
      setError('اكتب سبب الاسترداد');
      return;
    }
    if (await run(() => onSubmit({ amountMinor: amount, reason: form.reason.trim() }))) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('طلب استرداد')}
      description={t('دورة {course} · قابل للاسترداد حتى {amount}', {
        course: enrollment.course?.name || '—',
        amount: formatMinor(refundable),
      })}
    >
      <form onSubmit={submit}>
        <FormError message={error} />
        <div className="form-group">
          <label htmlFor="refund-amount">{t('المبلغ ({currency})', { currency: getCurrencyLabel() })}</label>
          <input
            id="refund-amount"
            type="text"
            inputMode="numeric"
            required
            className="ltr"
            placeholder="1,000"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: formatAmountInput(e.target.value) })}
          />
        </div>
        <div className="form-group">
          <label htmlFor="refund-reason">{t('السبب')}</label>
          <textarea
            id="refund-reason"
            rows={2}
            required
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <p className="modal-hint">{t('يُراجَع الطلب ويُعتمد ويُصرف من صفحة المالية، ثم يمكن طباعة سند الاسترداد.')}</p>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('جاري الإرسال…') : t('إرسال الطلب')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('إلغاء')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Cancel a payment; the receipt stays on record, marked as voided. */
export function VoidPaymentModal({ payment, receiptNumber, onClose, onSubmit }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const { saving, error, setError, run } = useSubmit();

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('سبب الإلغاء مطلوب');
      return;
    }
    if (await run(() => onSubmit(reason.trim()))) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('إلغاء الدفعة')}
      description={t('الوصل {number} بقيمة {amount}', { number: receiptNumber, amount: formatMinor(payment.amountMinor) })}
    >
      <form onSubmit={submit}>
        <FormError message={error} />
        <p className="callout warning">
          <AlertIcon size={18} />
          <span>{t('يُخصم المبلغ من المدفوع ويبقى الوصل في السجل بعلامة «ملغى». لا يمكن التراجع عن الإلغاء.')}</span>
        </p>
        <div className="form-group">
          <label htmlFor="void-reason">{t('سبب الإلغاء')}</label>
          <textarea id="void-reason" rows={2} required value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-danger" disabled={saving}>
            {saving ? t('جاري الإلغاء…') : t('إلغاء الدفعة')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('تراجع')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
