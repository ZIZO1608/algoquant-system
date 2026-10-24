import { useI18n } from '../i18n';
import { Logo } from './Brand';

export function Skeleton({ width, height = 14, radius, className = '', style }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius, display: 'block', ...style }}
      aria-hidden="true"
    />
  );
}

/** Skeleton layout for a page body while its data loads. */
export function PageLoading({ tiles = 4, rows = 5, title = true }) {
  const { t } = useI18n();
  return (
    <div className="page-loading" aria-busy="true" aria-label={t('جاري التحميل')}>
      {title && <span className="skeleton skeleton-title" />}
      {tiles > 0 && (
        <div className="skeleton-grid">
          {Array.from({ length: tiles }).map((_, i) => (
            <span key={i} className="skeleton skeleton-tile" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}

/** Full-viewport loader used while the app shell or a route chunk loads. */
export function AppLoading({ label }) {
  const { t } = useI18n();
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <Logo size={56} />
      <span className="spinner" />
      <span className="app-loading-label">{label ?? t('جاري التحميل…')}</span>
    </div>
  );
}
