import { InboxIcon } from './icons';

export default function EmptyState({ icon, title, hint, action, className = '' }) {
  return (
    <div className={`empty-block ${className}`.trim()}>
      <span className="empty-block-icon">{icon || <InboxIcon />}</span>
      {title && <h3>{title}</h3>}
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}
