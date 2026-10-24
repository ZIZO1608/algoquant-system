import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import Modal from './Modal';
import { AlertIcon, InfoIcon } from './icons';

const DialogContext = createContext(null);

/**
 * Branded replacement for window.confirm / window.alert.
 *   const { confirm, alert } = useDialog();
 *   if (await confirm({ title, message, danger: true })) ...
 */
export function DialogProvider({ children }) {
  const { t } = useI18n();
  const [state, setState] = useState(null);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        const o = typeof opts === 'string' ? { message: opts } : opts || {};
        setState({ type: 'confirm', ...o, resolve });
      }),
    []
  );

  const alert = useCallback(
    (opts) =>
      new Promise((resolve) => {
        const o = typeof opts === 'string' ? { message: opts } : opts || {};
        setState({ type: 'alert', ...o, resolve });
      }),
    []
  );

  const close = (result) => {
    state?.resolve?.(result);
    setState(null);
  };

  const api = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  const isAlert = state?.type === 'alert';
  const tone = state?.danger ? 'danger' : state?.tone || (isAlert ? 'info' : 'warning');
  const title = state?.title ?? (isAlert ? t('تنبيه') : t('تأكيد الإجراء'));

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={title}
        size="sm"
        closeOnOverlay={false}
        footer={
          isAlert ? (
            <button type="button" className="btn btn-primary" onClick={() => close(true)}>
              {state?.confirmLabel || t('حسناً')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`btn ${state?.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {state?.confirmLabel || t('تأكيد')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
                {state?.cancelLabel || t('إلغاء')}
              </button>
            </>
          )
        }
      >
        <div className="dialog-body">
          <span className={`dialog-icon ${tone}`}>
            {tone === 'info' ? <InfoIcon size={22} /> : <AlertIcon size={22} />}
          </span>
          <p className="dialog-message">{state?.message}</p>
        </div>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
