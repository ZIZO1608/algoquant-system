import { useState, useEffect } from 'react';
import './TaskRow.css';
import DepartmentBadge from './DepartmentBadge';
import { useI18n } from '../i18n';
import { TASK_STATUS_LABELS, SPECIALTY_LABELS, formatDueLabel, initials } from '../utils/formatters';
import { filterEmployeesForSpecialty, getDueUrgencyClass } from '../utils/taskSpecialty';
import { tasksApi } from '../api/client';
import { CalendarIcon, ChevronDownIcon, SparkIcon } from './icons';

export default function TaskRow({ task, employees = [], onTransition, onUpdate }) {
  const { t, td } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  // Holds an API error or an Arabic fallback key; shown through td() so it follows the language.
  const [error, setError] = useState('');
  const [suggested, setSuggested] = useState([]);
  const isDone = task.status === 'done';

  const eligibleEmployees = filterEmployeesForSpecialty(employees, task.specialty);
  const recommendedId = suggested[0]?.id ?? null;
  const recommended = eligibleEmployees.find((e) => e.id === recommendedId) || null;
  const deptClass = SPECIALTY_LABELS[task.specialty]?.className || `dept-${task.specialty}`;
  const urgencyClass = getDueUrgencyClass(task.dueAt, task.status);
  // A finished task is not late any more, so it shows no due chip.
  const dueLabel = isDone ? null : formatDueLabel(task.dueAt);

  useEffect(() => {
    if (!expanded) return undefined;
    if (!task?.id && !task?.specialty) return undefined;
    let cancelled = false;
    const load = task.id ? tasksApi.suggestedAssigneesForTask(task.id) : tasksApi.suggestedAssignees(task.specialty);
    load
      .then((list) => {
        if (!cancelled) setSuggested(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setSuggested([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, task?.id, task?.specialty]);

  const handleToggle = async () => {
    if (toggling || !onTransition) return;
    const nextStatus = isDone ? 'pending' : 'done';
    setToggling(true);
    setError('');
    try {
      await onTransition(task.id, nextStatus);
    } catch (err) {
      setError(err.message || 'تعذّر تحديث الحالة');
    } finally {
      setToggling(false);
    }
  };

  const handleUpdate = async (field, value) => {
    setSaving(true);
    setError('');
    try {
      const body =
        field === 'assignedEmployeeId'
          ? { assignedEmployeeId: value || null }
          : field === 'dueAt'
            ? { dueAt: value || null }
            : { notes: value };
      await tasksApi.update(task.id, body);
      if (onUpdate) await onUpdate();
    } catch (err) {
      setError(err.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const isUnassigned = !task.assignedEmployee;
  const rowClass = [
    'task-row',
    deptClass,
    isDone ? 'completed' : '',
    task.status === 'late' ? 'late' : '',
    urgencyClass,
    isUnassigned && !isDone ? 'is-unassigned' : '',
    expanded ? 'is-expanded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass}>
      <div className="task-row-main">
        <label className="task-check" title={isDone ? t('إعادة فتح المهمة') : t('إنجاز المهمة')}>
          <input
            type="checkbox"
            checked={isDone}
            disabled={toggling || !onTransition}
            onChange={handleToggle}
            aria-label={t('إنجاز مهمة {title}', { title: task.title })}
          />
          <span className="task-check-box" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.5l2.3 2.3L9.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </label>

        <button type="button" className="task-row-body" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          <span className="task-row-line">
            <span className="task-title">{task.title}</span>
            <DepartmentBadge specialty={task.specialty} />
            {isUnassigned && !isDone && (
              <span className="task-unassigned-pop" title={t('هذه المهمة بلا مسؤول')}>
                <span className="task-unassigned-pop-dot" aria-hidden="true" />
                {t('غير معيّن')}
              </span>
            )}
          </span>
          <span className="task-row-meta">
            {dueLabel && (
              <span className={`task-due-badge ${urgencyClass}`}>
                <CalendarIcon size={12} />
                {dueLabel}
              </span>
            )}
            {task.assignedEmployee && (
              <span className="task-assignee-inline" title={task.assignedEmployee.fullName}>
                <span className="avatar avatar-sm">{initials(task.assignedEmployee.fullName)}</span>
                <span className="task-assignee-name">{task.assignedEmployee.fullName}</span>
              </span>
            )}
            <span className={`badge plain task-status-badge status-${task.status}`}>
              {TASK_STATUS_LABELS[task.status] || task.status}
            </span>
          </span>
        </button>

        <span className="task-expand-icon" aria-hidden="true">
          <ChevronDownIcon size={16} />
        </span>
      </div>

      {error && <p className="form-error task-row-error">{td(error)}</p>}

      {expanded && (
        <div className="task-row-expanded">
          <div className="task-field full">
            <span className="form-label">{t('الوصف')}</span>
            <p className="task-description-text">{task.notes?.trim() ? task.notes : t('لا يوجد وصف لهذه المهمة')}</p>
          </div>
          <div className="task-field">
            <label className="form-label" htmlFor={`task-assignee-${task.id}`}>
              {t('المسؤول')}
            </label>
            <select
              id={`task-assignee-${task.id}`}
              className="select"
              value={task.assignedEmployee?.id || ''}
              disabled={saving}
              onChange={(e) => handleUpdate('assignedEmployeeId', e.target.value)}
            >
              <option value="">{t('— اختر —')}</option>
              {eligibleEmployees.map((emp) => {
                const tip = suggested.find((s) => s.id === emp.id);
                const badge = tip ? (tip.id === recommendedId ? t(' · موصى به') : tip.absentToday ? t(' · غائب اليوم') : '') : '';
                return (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}
                    {badge}
                  </option>
                );
              })}
            </select>
            {recommended && !task.assignedEmployee && (
              <button
                type="button"
                className="btn btn-soft btn-sm task-recommend-btn"
                disabled={saving}
                onClick={() => handleUpdate('assignedEmployeeId', recommended.id)}
              >
                <SparkIcon />
                {t('تعيين {name} (أقل حمل)', { name: recommended.fullName })}
              </button>
            )}
            {eligibleEmployees.length === 0 && <span className="hint">{t('لا يوجد موظفون بهذا التخصص')}</span>}
          </div>
          <div className="task-field">
            <label className="form-label" htmlFor={`task-due-${task.id}`}>
              {t('الموعد النهائي')}
            </label>
            <input
              id={`task-due-${task.id}`}
              className="input ltr"
              type="date"
              defaultValue={task.dueAt ? task.dueAt.slice(0, 10) : ''}
              disabled={saving}
              onBlur={(e) => handleUpdate('dueAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
