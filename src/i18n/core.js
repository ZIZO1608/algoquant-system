/**
 * Language state and translation for the Arabic-source UI.
 *
 * Arabic text in the code is the translation key; English lives in ./en/*.js.
 * Arabic is the default. React components use `useI18n()` from ./LanguageContext.jsx;
 * plain modules (formatters, status maps, the API client) call `translate()` directly.
 * See docs/I18N.md.
 */
import EN, { SERVER_PATTERNS } from './en/index.js';

export const LANGUAGES = ['ar', 'en'];
export const DEFAULT_LANG = 'ar';
/** Each language's name written in that language — never translated. */
export const LANGUAGE_NAMES = { ar: 'العربية', en: 'English' };
export const LANGUAGE_SHORT = { ar: 'ع', en: 'EN' };
export const LANG_STORAGE_KEY = 'algo_lang';

const HAS_ARABIC = /[؀-ۿ]/;
/** "مطلوب|withdrawal": a suffix that separates two English meanings of one Arabic string. */
const CONTEXT_SUFFIX = /\|[a-z][\w-]*$/;
const DOCUMENT_TITLES = { ar: 'Algo Quant — لوحة الإدارة', en: 'Algo Quant — Admin Panel' };

function readStoredLang() {
  try {
    const value = localStorage.getItem(LANG_STORAGE_KEY);
    return LANGUAGES.includes(value) ? value : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

let current = typeof window === 'undefined' ? DEFAULT_LANG : readStoredLang();
const listeners = new Set();

export function getLang() {
  return current;
}

export function getDir(lang = current) {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/** Intl locale. Both languages use the Gregorian calendar and Latin digits. */
export function getLocale(lang = current) {
  return lang === 'ar' ? 'ar-u-nu-latn-ca-gregory' : 'en-GB';
}

export function applyDocumentLang(lang = current) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = getDir(lang);
  document.title = DOCUMENT_TITLES[lang];
}

export function setLang(next) {
  if (!LANGUAGES.includes(next) || next === current) return;
  current = next;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // storage unavailable: the choice lasts for this page load
  }
  applyDocumentLang(next);
  listeners.forEach((listener) => listener(next));
}

export function subscribeLang(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => String(vars[name] ?? match));
}

const warned = new Set();

/** The dictionary entry for `text` in the current language (string or function), or the Arabic text. */
export function lookup(text) {
  if (typeof text !== 'string' || !HAS_ARABIC.test(text)) return text;
  if (current === 'ar') return text.replace(CONTEXT_SUFFIX, '');
  if (Object.hasOwn(EN, text)) return EN[text];
  if (import.meta.env?.DEV && !warned.has(text)) {
    warned.add(text);
    console.warn(`[i18n] No English for: ${text}`);
  }
  return text.replace(CONTEXT_SUFFIX, '');
}

/**
 * Translate a UI string. `vars` fill {placeholders}:
 *   translate('بعد {n} أيام', { n: 3 })  →  "بعد 3 أيام" | "in 3 days"
 * Text without Arabic (already English, codes, numbers) passes through unchanged.
 */
export function translate(text, vars) {
  const entry = lookup(text);
  if (typeof entry === 'function') return entry(vars || {});
  return typeof entry === 'string' ? interpolate(entry, vars) : entry;
}

/**
 * Translate text that came from the server or database: error messages, notification
 * titles, ledger descriptions, seeded labels. Unknown text is returned unchanged, so
 * user-entered data is never altered.
 */
export function translateData(text) {
  return translateDataIn(current, text);
}

/**
 * translate() into a fixed language instead of the UI language. Printed documents use it:
 * a receipt can print in Arabic while the screen is in English.
 */
export function translateIn(lang, text, vars) {
  if (typeof text !== 'string' || !HAS_ARABIC.test(text)) return text;
  const plain = text.replace(CONTEXT_SUFFIX, '');
  const entry = lang === 'ar' ? plain : Object.hasOwn(EN, text) ? EN[text] : plain;
  if (typeof entry === 'function') return entry(vars || {});
  return interpolate(entry, vars);
}

/** translateData() into a fixed language. */
export function translateDataIn(lang, text) {
  if (lang === 'ar' || typeof text !== 'string' || !HAS_ARABIC.test(text)) return text;
  const key = text.trim();
  if (Object.hasOwn(EN, key)) {
    const entry = EN[key];
    return typeof entry === 'function' ? entry({}) : entry;
  }
  const again = (inner) => translateDataIn(lang, inner);
  for (const [pattern, render] of SERVER_PATTERNS) {
    const match = pattern.exec(key);
    if (match) return render(match, again);
  }
  return text;
}

/** An object with the same keys whose Arabic values are translated each time they are read. */
export function translatedMap(source) {
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    Object.defineProperty(out, key, { enumerable: true, get: () => translate(value) });
  }
  return out;
}
