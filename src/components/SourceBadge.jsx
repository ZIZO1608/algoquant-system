import { getSourceLabel } from '../utils/formatters';

export default function SourceBadge({ source }) {
  const label = getSourceLabel(source);
  const code = typeof source === 'object' ? source?.code : source;
  return (
    <span className={`source-badge ${code || ''}`}>
      <span className="source-badge-dot" />
      {label}
    </span>
  );
}
