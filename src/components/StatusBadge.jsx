import { statusInfo } from '../utils/statusMaps';

/** <StatusBadge kind="lead" value={lead.status} /> */
export default function StatusBadge({ kind, value, plain = false, className = '' }) {
  const { label, tone } = statusInfo(kind, value);
  return <span className={`badge tone-${tone} ${plain ? 'plain' : ''} ${className}`.trim()}>{label}</span>;
}
