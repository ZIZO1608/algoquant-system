import { SPECIALTY_LABELS } from '../utils/formatters';

export default function DepartmentBadge({ specialty, department }) {
  const key = specialty || department;
  const dept = SPECIALTY_LABELS[key];
  if (!dept) return null;
  return (
    <span className={`dept-badge ${dept.className}`}>
      {dept.label}
    </span>
  );
}
