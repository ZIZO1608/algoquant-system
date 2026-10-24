import { useI18n } from '../i18n';
import { CUSTOM_LIMITS, PAPER_GROUPS, PAPER_PRESETS } from './paper';

/** Paper size picker grouped into sheets, receipt rolls and a custom size. */
export function PaperSelect({ id, value, onChange, disabled }) {
  const { t } = useI18n();
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {PAPER_GROUPS.map((group) => (
        <optgroup key={group.id} label={t(group.label)}>
          {PAPER_PRESETS.filter((p) => p.group === group.id).map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.label)}
              {p.width && p.height ? ` — ${p.width} × ${p.height}` : p.width ? ` — ${p.width}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Width × height inputs for the custom paper size; an empty height means a roll. */
export function CustomSizeFields({ idPrefix, width, height, onChange }) {
  const { t } = useI18n();
  return (
    <div className="print-custom-size">
      <label className="print-mini-field" htmlFor={`${idPrefix}-w`}>
        <span>{t('العرض (مم)')}</span>
        <input
          id={`${idPrefix}-w`}
          type="number"
          className="input ltr tnum"
          min={CUSTOM_LIMITS.minWidth}
          max={CUSTOM_LIMITS.maxWidth}
          step="1"
          value={width ?? ''}
          onChange={(e) => onChange({ customWidth: e.target.value === '' ? '' : Number(e.target.value) })}
        />
      </label>
      <span className="print-custom-x" aria-hidden="true">
        ×
      </span>
      <label className="print-mini-field" htmlFor={`${idPrefix}-h`}>
        <span>{t('الطول (مم)')}</span>
        <input
          id={`${idPrefix}-h`}
          type="number"
          className="input ltr tnum"
          min={CUSTOM_LIMITS.minHeight}
          max={CUSTOM_LIMITS.maxHeight}
          step="1"
          placeholder={t('تلقائي')}
          value={height ?? ''}
          onChange={(e) => onChange({ customHeight: e.target.value === '' ? '' : Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

/** Two or three mutually exclusive buttons. */
export function Segmented({ value, options, onChange, disabled, label }) {
  return (
    <div className="print-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled slider with its value shown beside it. */
export function RangeField({ id, label, value, min, max, step = 1, unit, onChange, hint }) {
  return (
    <div className="print-range">
      <label htmlFor={id}>
        <span>{label}</span>
        <output htmlFor={id} className="tnum ltr">
          {value}
          {unit}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );
}

/** − n + for small counts (copies). */
export function Stepper({ id, value, min, max, onChange, label }) {
  const { t } = useI18n();
  return (
    <div className="print-stepper" role="group" aria-label={label}>
      <button type="button" className="btn btn-secondary btn-icon btn-sm" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t('إنقاص')}>
        −
      </button>
      <output id={id} className="tnum">
        {value}
      </output>
      <button type="button" className="btn btn-secondary btn-icon btn-sm" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t('زيادة')}>
        +
      </button>
    </div>
  );
}
