import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import DepartmentBadge from '../components/DepartmentBadge';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { getDueUrgencyClass, employeeInitials, filterEmployeesForSpecialty, isOpenTask } from '../utils/taskSpecialty';
import { formatDueLabel } from '../utils/formatters';
import { employeesApi, tasksApi } from '../api/client';
import {
  CalendarIcon,
  ExternalIcon,
  MaximizeIcon,
  MinimizeIcon,
  SearchIcon,
  SparkIcon,
  TasksIcon,
} from '../components/icons';
import './Tasks.css';

// Labels are Arabic source text, translated with t() when rendered.
const COLUMNS = [
  { id: 'pending', label: 'جديد', empty: 'لا مهام جديدة' },
  { id: 'in_progress', label: 'قيد التنفيذ', empty: 'اسحب مهمة هنا لبدء العمل' },
  { id: 'done', label: 'مكتمل', empty: 'لا مهام مكتملة بعد' },
  { id: 'late', label: 'متأخر', empty: 'لا مهام متأخرة، أحسنت!' },
];

const SPECIALTY_OPTIONS = [
  { value: 'all', label: 'كل الأقسام' },
  { value: 'sales', label: 'مبيعات' },
  { value: 'operation', label: 'عمليات' },
  { value: 'logistics', label: 'لوجستيات' },
  { value: 'media', label: 'ميديا' },
  { value: 'accountant', label: 'محاسبة' },
];

export default function Tasks() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const { tasks, courses, transitionTask, user, refreshData } = useApp();
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [assigningId, setAssigningId] = useState(null);
  const [transitioningId, setTransitioningId] = useState(null);
  const [suggestionsBySpecialty, setSuggestionsBySpecialty] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    employeesApi.list().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const specialtyKeys = useMemo(
    () => [...new Set(tasks.map((task) => task.specialty).filter(Boolean))].sort().join(','),
    [tasks]
  );

  useEffect(() => {
    if (!specialtyKeys) return undefined;
    let cancelled = false;
    Promise.all(
      specialtyKeys.split(',').map(async (specialty) => {
        try {
          const list = await tasksApi.suggestedAssignees(specialty);
          return [specialty, Array.isArray(list) ? list : []];
        } catch {
          return [specialty, []];
        }
      })
    ).then((entries) => {
      if (!cancelled) setSuggestionsBySpecialty(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [specialtyKeys]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (specialtyFilter !== 'all' && task.specialty !== specialtyFilter) return false;
      if (courseFilter !== 'all' && task.courseId !== courseFilter) return false;
      if (myTasksOnly && task.assignedEmployee?.id !== user?.id) return false;
      if (q) {
        const haystack = `${task.title} ${task.course?.name ?? ''} ${task.assignedEmployee?.fullName ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, specialtyFilter, courseFilter, myTasksOnly, user?.id, search]);

  // "Open" is the shared definition and includes late tasks — a late task is still work to do.
  const openCount = filtered.filter(isOpenTask).length;
  const lateCount = filtered.filter((task) => task.status === 'late').length;
  const unassignedCount = filtered.filter((task) => !task.assignedEmployee && task.status !== 'done').length;

  const handleDrop = async (colId) => {
    setDragOverCol(null);
    const taskId = draggedTaskId;
    setDraggedTaskId(null);
    if (!taskId || transitioningId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === colId) return;
    setTransitioningId(taskId);
    try {
      await transitionTask(taskId, colId);
    } catch (err) {
      toast.error(err.message || t('تعذّر نقل المهمة'));
    } finally {
      setTransitioningId(null);
    }
  };

  const handleAssign = async (taskId, employeeId) => {
    setAssigningId(taskId);
    try {
      await tasksApi.update(taskId, { assignedEmployeeId: employeeId || null });
      await refreshData();
      toast.success(employeeId ? t('تم تعيين المسؤول') : t('تمت إزالة المسؤول'));
    } catch (err) {
      toast.error(err.message || t('تعذّر التعيين'));
    } finally {
      setAssigningId(null);
    }
  };

  const moveTask = async (taskId, colId) => {
    if (transitioningId) return;
    setTransitioningId(taskId);
    try {
      await transitionTask(taskId, colId);
    } catch (err) {
      toast.error(err.message || t('تعذّر تحديث الحالة'));
    } finally {
      setTransitioningId(null);
    }
  };

  return (
    <AppShell>
      <div className={`tasks-page ${isFullscreen ? 'is-fullscreen' : ''}`}>
        {!isFullscreen && (
          <div className="page-header tasks-header">
            <div>
              <h1 className="page-title">{t('المهام')}</h1>
              <p className="page-subtitle">{t('صندوق مهام الفريق عبر جميع الدورات')}</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setIsFullscreen(true)} title={t('توسيع اللوحة')}>
              <MaximizeIcon />
              {t('توسيع')}
            </button>
          </div>
        )}

        <div className="tasks-toolbar">
          <div className="tasks-toolbar-group">
            <button
              type="button"
              className={`chip tasks-chip ${myTasksOnly ? 'active' : ''}`}
              onClick={() => setMyTasksOnly(!myTasksOnly)}
              aria-pressed={myTasksOnly}
            >
              <span className="tasks-chip-avatar">{employeeInitials(user?.fullName)}</span>
              {t('مهامي')}
            </button>
            <select className="select tasks-select" value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)} aria-label={t('القسم')}>
              {SPECIALTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.label)}
                </option>
              ))}
            </select>
            <select className="select tasks-select" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} aria-label={t('الدورة')}>
              <option value="all">{t('كل الدورات')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="tasks-toolbar-stats">
              <div className="tasks-stat">
                <span className="tasks-stat-value tnum">{openCount}</span>
                <span className="tasks-stat-label">{t('مفتوحة')}</span>
              </div>
              <div className={`tasks-stat ${lateCount > 0 ? 'is-danger' : ''}`}>
                <span className="tasks-stat-value tnum">{lateCount}</span>
                <span className="tasks-stat-label">{t('متأخرة')}</span>
              </div>
              <div className={`tasks-stat ${unassignedCount > 0 ? 'is-danger' : ''}`}>
                <span className="tasks-stat-value tnum">{unassignedCount}</span>
                <span className="tasks-stat-label">{t('بدون مسؤول')}</span>
              </div>
            </div>
          </div>
          <div className="tasks-toolbar-end">
            <div className="tasks-search-wrap">
              <SearchIcon size={16} />
              <input
                type="search"
                className="tasks-search"
                placeholder={t('بحث عن مهمة…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('بحث عن مهمة')}
              />
            </div>
            {isFullscreen && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsFullscreen(false)} title={t('تصغير (Esc)')}>
                <MinimizeIcon />
                {t('تصغير')}
              </button>
            )}
          </div>
        </div>

        <div className="kanban-board">
          {COLUMNS.map((col) => {
            const colTasks = filtered.filter((task) => task.status === col.id);
            const isDragTarget = dragOverCol === col.id;
            return (
              <section
                key={col.id}
                className={`kanban-column kanban-col-${col.id} ${isDragTarget ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null);
                }}
                onDrop={() => handleDrop(col.id)}
                aria-label={t('{label}، {count} مهام', { label: t(col.label), count: colTasks.length })}
              >
                <header className="kanban-column-head">
                  <span className="kanban-column-dot" aria-hidden="true" />
                  <h3 className="kanban-column-title">{t(col.label)}</h3>
                  <span className="kanban-column-count tnum">{colTasks.length}</span>
                </header>

                <div className="kanban-column-body">
                  {colTasks.length === 0 ? (
                    <div className="kanban-empty">
                      <TasksIcon size={18} />
                      <p>{t(col.empty)}</p>
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const urgencyClass = getDueUrgencyClass(task.dueAt, task.status);
                      const assignee = task.assignedEmployee;
                      const isExpanded = expandedTaskId === task.id;
                      // A finished task is not late any more, so it shows no due chip.
                      const dueLabel = task.status === 'done' ? null : formatDueLabel(task.dueAt);
                      const eligibleEmployees = filterEmployeesForSpecialty(employees, task.specialty);
                      const suggested = suggestionsBySpecialty[task.specialty] || [];
                      const recommendedId = suggested[0]?.id;
                      const recommended = eligibleEmployees.find((e) => e.id === recommendedId) || null;
                      const isAssigning = assigningId === task.id;
                      const isTransitioning = transitioningId === task.id;
                      const isUnassigned = !assignee;
                      return (
                        <article
                          key={task.id}
                          className={`kanban-card ${urgencyClass} ${isExpanded ? 'is-expanded' : ''} ${draggedTaskId === task.id ? 'is-dragging' : ''} ${isUnassigned && task.status !== 'done' ? 'is-unassigned' : ''} ${isTransitioning ? 'is-busy' : ''}`}
                          draggable
                          onDragStart={() => setDraggedTaskId(task.id)}
                          onDragEnd={() => {
                            setDraggedTaskId(null);
                            setDragOverCol(null);
                          }}
                          onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedTaskId(isExpanded ? null : task.id);
                            }
                          }}
                        >
                          <div className="kanban-card-top">
                            <div className="kanban-card-top-start">
                              <DepartmentBadge specialty={task.specialty} />
                              {isUnassigned && task.status !== 'done' && (
                                <span className="task-unassigned-pop" title={t('هذه المهمة بلا مسؤول')}>
                                  <span className="task-unassigned-pop-dot" aria-hidden="true" />
                                  {t('غير معيّن')}
                                </span>
                              )}
                            </div>
                            {dueLabel && (
                              <span className={`kanban-due-chip ${urgencyClass}`}>
                                <CalendarIcon size={12} />
                                {dueLabel}
                              </span>
                            )}
                          </div>

                          <p className="kanban-card-title">{task.title}</p>
                          {task.course?.name && <p className="kanban-card-course">{task.course.name}</p>}

                          <div className="kanban-card-footer">
                            {assignee ? (
                              <span className="kanban-assignee" title={assignee.fullName}>
                                <span className="avatar avatar-sm">{employeeInitials(assignee.fullName)}</span>
                                <span className="kanban-assignee-name">{assignee.fullName}</span>
                              </span>
                            ) : (
                              <span className="kanban-unassigned">{t('انقر لتعيين مسؤول')}</span>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="kanban-card-detail" onClick={(e) => e.stopPropagation()}>
                              <p className="kanban-card-notes">{task.notes?.trim() ? task.notes : t('لا يوجد وصف لهذه المهمة')}</p>

                              <div className="kanban-assign-block">
                                <label className="form-label" htmlFor={`assign-${task.id}`}>
                                  {t('المسؤول')}
                                </label>
                                <select
                                  id={`assign-${task.id}`}
                                  className="select"
                                  value={assignee?.id || ''}
                                  disabled={isAssigning}
                                  onChange={(e) => handleAssign(task.id, e.target.value)}
                                >
                                  <option value="">{t('— اختر موظفاً —')}</option>
                                  {eligibleEmployees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.fullName}
                                      {recommended?.id === emp.id ? t(' · موصى به') : ''}
                                    </option>
                                  ))}
                                </select>
                                {recommended && !assignee && (
                                  <button
                                    type="button"
                                    className="btn btn-soft btn-sm"
                                    disabled={isAssigning}
                                    onClick={() => handleAssign(task.id, recommended.id)}
                                  >
                                    <SparkIcon />
                                    {t('تعيين {name} (أقل حمل)', { name: recommended.fullName })}
                                  </button>
                                )}
                                {eligibleEmployees.length === 0 && <p className="hint">{t('لا يوجد موظفون بهذا التخصص')}</p>}
                              </div>

                              <div className="kanban-card-actions">
                                <div className="kanban-move-group">
                                  {COLUMNS.filter((c) => c.id !== task.status).map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      className={`kanban-move-btn move-${c.id}`}
                                      disabled={isTransitioning}
                                      onClick={() => moveTask(task.id, c.id)}
                                    >
                                      {t(c.label)}
                                    </button>
                                  ))}
                                </div>
                                {task.courseId && (
                                  <button type="button" className="kanban-open-course" onClick={() => navigate(`/courses/${task.courseId}`)}>
                                    <ExternalIcon size={14} />
                                    {t('فتح الدورة')}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
