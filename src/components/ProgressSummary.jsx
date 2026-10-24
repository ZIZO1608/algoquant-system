import './ProgressSummary.css';
import { useI18n } from '../i18n';
import { SPECIALTY_LABELS } from '../utils/formatters';

export default function ProgressSummary({ tasks = [], totals = null }) {
  const { t } = useI18n();
  // totals cover every task of the course; the task list itself is filtered by specialty.
  const done = totals?.total ? totals.done : tasks.filter((task) => task.status === 'done').length;
  const total = totals?.total ?? tasks.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const hidden = totals?.hidden ?? 0;

  const byDept = Object.entries(SPECIALTY_LABELS)
    .map(([deptKey, dept]) => {
      const deptTasks = tasks.filter((task) => task.specialty === deptKey);
      const deptCompleted = deptTasks.filter((task) => task.status === 'done').length;
      return {
        id: deptKey,
        ...dept,
        total: deptTasks.length,
        completed: deptCompleted,
        percent: deptTasks.length ? Math.round((deptCompleted / deptTasks.length) * 100) : 0,
      };
    })
    .filter((d) => d.total > 0);

  const r = 42;
  const c = 2 * Math.PI * r;

  return (
    <div className="progress-summary card">
      <h3 className="card-title">{t('ملخص التقدم')}</h3>
      <div className="progress-ring-wrap">
        <svg className="progress-ring" viewBox="0 0 100 100" role="img" aria-label={t('اكتمل {percent}% من المهام', { percent })}>
          <circle className="progress-ring-bg" cx="50" cy="50" r={r} />
          <circle
            className="progress-ring-fill"
            cx="50"
            cy="50"
            r={r}
            strokeDasharray={`${(percent / 100) * c} ${c}`}
          />
        </svg>
        <span className="progress-ring-text">
          <strong className="tnum">{percent}%</strong>
          <span className="tnum">{t('{done}/{total} مهمة', { done, total })}</span>
        </span>
      </div>
      <div className="progress-dept-bars">
        {byDept.map((dept) => (
          <div key={dept.id} className="progress-dept-row">
            <span className={`dept-badge ${dept.className}`}>{dept.label}</span>
            <div className="progress-bar-track">
              <div className={`progress-bar-fill ${dept.className}`} style={{ width: `${dept.percent}%` }} />
            </div>
            <span className="progress-dept-count tnum">
              {dept.completed}/{dept.total}
            </span>
          </div>
        ))}
      </div>
      {hidden > 0 && <p className="hint">{t('الأرقام لكل الأقسام؛ القائمة تعرض مهام تخصصك فقط.')}</p>}
      {total === 0 && <p className="empty-state">{t('لا توجد مهام بعد')}</p>}
    </div>
  );
}
