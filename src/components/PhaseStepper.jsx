import './PhaseStepper.css';
import { useI18n } from '../i18n';
import { CheckIcon } from './icons';

export default function PhaseStepper({ phases = [], tasks = [], currentPhaseKey, hasHiddenTasks = false }) {
  const { t } = useI18n();
  if (!phases.length) return null;
  const currentIndex = phases.findIndex((p) => p.key === currentPhaseKey);

  return (
    <ol className="phase-stepper" aria-label={t('مراحل دورة الحياة')}>
      {phases.map((phase, index) => {
        const phaseTasks = tasks.filter((task) => task.phaseKey === phase.key);
        const completed = phaseTasks.filter((task) => task.status === 'done').length;
        const isActive = phase.key === currentPhaseKey;
        const isPast = currentIndex > index;
        const isComplete = phaseTasks.length > 0 && completed === phaseTasks.length;
        const pct = phaseTasks.length ? Math.round((completed / phaseTasks.length) * 100) : 0;
        return (
          <li
            key={phase.key}
            className={`phase-step ${isActive ? 'active' : ''} ${isPast || isComplete ? 'past' : ''}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className="phase-step-marker" aria-hidden="true">
              {isPast || isComplete ? <CheckIcon size={14} /> : index + 1}
            </span>
            <span className="phase-step-text">
              <span className="phase-step-label">{t(phase.labelAr)}</span>
              <span className="phase-step-count tnum">
                {phaseTasks.length
                  ? `${completed}/${phaseTasks.length}`
                  : hasHiddenTasks
                    ? t('مهام أقسام أخرى')
                    : t('لا مهام')}
              </span>
            </span>
            <span className="phase-step-bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
