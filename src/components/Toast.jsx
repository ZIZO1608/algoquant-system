import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { AlertIcon, CheckCircleIcon, InfoIcon, XIcon } from './icons';
import './Toast.css';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircleIcon,
  error: AlertIcon,
  warning: AlertIcon,
  info: InfoIcon,
};

export function ToastProvider({ children }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone, message, opts = {}) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, tone, message, title: opts.title }]);
      const ms = opts.duration ?? (tone === 'error' ? 6000 : 3600);
      window.setTimeout(() => remove(id), ms);
      return id;
    },
    [remove]
  );

  const api = useMemo(
    () => ({
      success: (m, o) => push('success', m, o),
      error: (m, o) => push('error', m, o),
      warning: (m, o) => push('warning', m, o),
      info: (m, o) => push('info', m, o),
      dismiss: remove,
    }),
    [push, remove]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => {
          const Icon = ICONS[item.tone] || InfoIcon;
          return (
            <div key={item.id} className={`toast tone-${item.tone}`}>
              <span className="toast-icon">
                <Icon size={18} />
              </span>
              <div className="toast-text">
                {item.title && <strong>{item.title}</strong>}
                <span>{item.message}</span>
              </div>
              <button type="button" className="toast-close" onClick={() => remove(item.id)} aria-label={t('إغلاق')}>
                <XIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
