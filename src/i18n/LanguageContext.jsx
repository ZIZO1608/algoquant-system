import { cloneElement, createContext, isValidElement, useContext, useEffect, useMemo, useState } from 'react';
import { applyDocumentLang, getDir, getLang, lookup, setLang, subscribeLang, translate, translateData } from './core';

const LanguageContext = createContext(null);

/**
 * Like translate(), but {placeholders} may be React elements:
 *   tr('ينتهي بـ {hint}', { hint: <code className="ltr">{secretHint}</code> })
 */
function translateRich(text, vars) {
  const entry = lookup(text);
  const template = typeof entry === 'function' ? entry(vars || {}) : entry;
  if (typeof template !== 'string' || !vars) return template;
  return template
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part, i) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      if (!name || !(name in vars)) return part;
      const value = vars[name];
      return isValidElement(value) ? cloneElement(value, { key: i }) : value;
    });
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getLang);

  useEffect(() => subscribeLang(setLangState), []);
  useEffect(() => applyDocumentLang(lang), [lang]);

  const value = useMemo(
    () => ({
      lang,
      dir: getDir(lang),
      isRtl: lang === 'ar',
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      // Fresh function identities per language, so useMemo/useCallback that list them recompute.
      t: (text, vars) => translate(text, vars),
      tr: (text, vars) => translateRich(text, vars),
      td: (text) => translateData(text),
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}
