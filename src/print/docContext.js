import { createContext, useContext } from 'react';
import { getDir, getLocale, translateDataIn, translateIn } from '../i18n/core';
import { formatAmount, getRawCurrencyLabel } from '../utils/formatters';
import { statusInfo, statusLabelIn } from '../utils/statusMaps';
import { paymentMethodLabelIn } from '../utils/paymentMethods';
import { amountInWords } from './amountWords';
import { DOC_TYPES, formatDocNumber } from './printSettings';

/**
 * Everything a printed document needs to render in its own language, independent of the UI
 * language: translation, dates, money, amounts in words, labels, and the document's settings.
 */
export const DocContext = createContext(null);

/** First-strong isolate / pop directional isolate: keep data's direction inside a sentence. */
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);

export function useDoc() {
  return useContext(DocContext);
}

const dateCache = new Map();
function dateFormatter(lang, withTime) {
  const key = `${lang}|${withTime}`;
  if (!dateCache.has(key)) {
    const options = withTime
      ? { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }
      : { year: 'numeric', month: 'long', day: 'numeric' };
    dateCache.set(key, new Intl.DateTimeFormat(getLocale(lang), options));
  }
  return dateCache.get(key);
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function makeDocContext({ lang, settings, type, format }) {
  const t = (text, vars) => translateIn(lang, text, vars);
  const doc = settings.docs[type];
  const meta = DOC_TYPES[type];
  const currency = translateDataIn(lang, getRawCurrencyLabel());
  const currencyWords = lang === 'en' ? settings.text.currencyWordsEn : settings.text.currencyWordsAr;

  // A box the admin left empty keeps its built-in label.
  const signatures = Array.from(
    { length: doc.signatureCount },
    (_, i) => doc.signatures?.[i]?.trim() || t(meta.signatures[i] || 'التوقيع')
  );

  return {
    lang,
    dir: getDir(lang),
    type,
    format,
    settings,
    doc,
    t,
    td: (text) => translateDataIn(lang, text),
    date: (value) => {
      const d = toDate(value);
      return d ? dateFormatter(lang, false).format(d) : '—';
    },
    dateTime: (value) => {
      const d = toDate(value);
      return d ? dateFormatter(lang, true).format(d) : '—';
    },
    /** Wraps data (names, reasons) placed inside a translated sentence in a bidi isolate. */
    iso: (value) => (value == null || value === '' ? value : FSI + value + PDI),
    amount: (value) => formatAmount(value),
    money: (value) => `${formatAmount(value)} ${currency}`,
    currency,
    words: (value) =>
      t('فقط {amount} لا غير', { amount: `${amountInWords(value, lang)} ${currencyWords}`.trim() }),
    status: (kind, value) => statusLabelIn(lang, kind, value),
    tone: (kind, value) => statusInfo(kind, value).tone,
    method: (value) => paymentMethodLabelIn(lang, value),
    number: (n) => formatDocNumber(doc.prefix, n, settings.look.numberPadding),
    show: (field) => doc.fields?.[field] !== false,
    title: doc.title.trim() || t(meta.title),
    /** Signature box labels: the admin's own, or the built-in ones. */
    signatures,
    copyLabel: (index, copies) => {
      if (copies < 2) return '';
      const custom = doc.copyLabels?.[index]?.trim();
      return custom || t(meta.copyLabels[index] || 'نسخة');
    },
  };
}
