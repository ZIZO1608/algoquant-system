import './StatCard.css';

/**
 * value: string | number
 * label: string
 * icon: ReactNode (optional)
 * hint: string (optional, small text under the value)
 * trend: string | { text, tone: 'positive' | 'negative' | 'neutral' }
 * variant: 'headline' | 'warning' | 'success' | undefined
 */
export default function StatCard({ value, label, icon, hint, trend, variant, onClick }) {
  let trendText = null;
  let trendTone = 'neutral';
  if (typeof trend === 'string') {
    trendText = trend;
    trendTone = trend.startsWith('-') ? 'negative' : 'positive';
  } else if (trend && typeof trend === 'object') {
    trendText = trend.text;
    trendTone = trend.tone || 'neutral';
  }

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      className={`stat-card ${variant || ''} ${onClick ? 'is-clickable' : ''}`.trim()}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {icon && <span className="stat-card-icon">{icon}</span>}
      </div>
      <div className="stat-card-value tnum">{value}</div>
      {(hint || trendText) && (
        <div className="stat-card-foot">
          {trendText && <span className={`stat-card-trend ${trendTone}`}>{trendText}</span>}
          {hint && <span className="stat-card-hint">{hint}</span>}
        </div>
      )}
    </Tag>
  );
}
