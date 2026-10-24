import { useEffect, useId, useRef } from 'react';
import { useI18n } from '../i18n';
import { XIcon } from './icons';
import './Modal.css';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: Escape closes, Tab is trapped, focus is restored on close,
 * the page behind stops scrolling. `size`: sm | md | lg | xl (`wide` = lg).
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
  size,
  closeOnOverlay = true,
  hideClose = false,
  className = '',
}) {
  const { t } = useI18n();
  const panelRef = useRef(null);
  const lastActiveRef = useRef(null);
  // Parents usually pass an inline onClose; reading it through a ref keeps the effect below
  // from re-running (and moving focus back to the first field) on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    lastActiveRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusables = panel ? Array.from(panel.querySelectorAll(FOCUSABLE)) : [];
    const first = focusables.find((el) => !el.classList.contains('modal-close')) || focusables[0];
    (first || panel)?.focus?.({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab' && panel) {
        const list = Array.from(panel.querySelectorAll(FOCUSABLE));
        if (!list.length) {
          e.preventDefault();
          return;
        }
        const firstEl = list[0];
        const lastEl = list[list.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      lastActiveRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = size ? `modal-${size}` : wide ? 'modal-lg' : 'modal-md';

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={`modal ${sizeClass} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        ref={panelRef}
        tabIndex={-1}
      >
        {(title || !hideClose) && (
          <div className="modal-head">
            <div className="modal-head-text">
              {title && (
                <h3 className="modal-title" id={titleId}>
                  {title}
                </h3>
              )}
              {description && (
                <p className="modal-desc" id={descId}>
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button type="button" className="btn btn-icon modal-close" onClick={onClose} aria-label={t('إغلاق')}>
                <XIcon />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
