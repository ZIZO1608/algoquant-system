import { LANGUAGE_NAMES, LANGUAGE_SHORT, useI18n } from '../i18n';
import { GlobeIcon } from './icons';
import './LanguageToggle.css';

/**
 * Switches the UI between Arabic and English; the button names the language it switches to.
 * variant: 'topbar' (app bar button with a short code) | 'pill' (pages without the app shell)
 */
export default function LanguageToggle({ variant = 'topbar', className = '' }) {
  const { lang, toggleLang, t } = useI18n();
  const next = lang === 'ar' ? 'en' : 'ar';
  const label = t('التبديل إلى {language}', { language: LANGUAGE_NAMES[next] });
  const pill = variant === 'pill';

  return (
    <button
      type="button"
      className={`${pill ? 'lang-pill' : 'topbar-btn lang-toggle'} ${className}`.trim()}
      onClick={toggleLang}
      aria-label={label}
      title={label}
    >
      <GlobeIcon size={pill ? 16 : 18} />
      <span className="lang-toggle-text" lang={next}>
        {pill ? LANGUAGE_NAMES[next] : LANGUAGE_SHORT[next]}
      </span>
    </button>
  );
}
