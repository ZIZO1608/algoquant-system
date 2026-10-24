import { useI18n } from '../i18n';
import './Brand.css';

export const BRAND_NAME = 'Algo Quant';
export const BRAND_TAGLINE = 'نظام إدارة الأكاديمية';

/** The logo mark alone. Picks the smallest source that stays crisp at 2x. */
export function Logo({ size = 40, className = '' }) {
  const src = size > 96 ? '/brand/logo-mark-512.png' : size > 48 ? '/brand/logo-mark-256.png' : '/brand/logo-mark-128.png';
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={`brand-logo ${className}`.trim()}
      draggable="false"
    />
  );
}

/** Logo + wordmark. `tone="light"` for dark backgrounds (sidebar). */
export function BrandLockup({ size = 36, tone = 'ink', tagline = true, className = '' }) {
  const { t } = useI18n();
  return (
    <span className={`brand-lockup tone-${tone} ${className}`.trim()}>
      <Logo size={size} />
      <span className="brand-text">
        <span className="brand-name">{BRAND_NAME}</span>
        {tagline && <span className="brand-tagline">{t(BRAND_TAGLINE)}</span>}
      </span>
    </span>
  );
}
