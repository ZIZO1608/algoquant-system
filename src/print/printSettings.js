import { BRAND_NAME } from '../components/Brand';
import { isPaperId } from './paper';

/**
 * Print settings: the academy's details, the look of every document and the defaults per
 * document type. Admins edit them in Settings → "الإيصالات والطباعة"; they are saved as the
 * app setting "printSettings". Each device also remembers the last paper, copies and text
 * size used per document (printers differ between computers), in localStorage.
 *
 * Text fields left empty fall back to the built-in Arabic source text, which is translated
 * into the document language; text an admin typed is printed exactly as typed.
 */

export const SETTINGS_KEY = 'printSettings';
const DEVICE_KEY = 'algo_print_prefs';

/** Document types, in the order the designer lists them. Labels are Arabic source text. */
export const DOC_TYPES = {
  payment: {
    label: 'وصل قبض (دفعة طالب)',
    title: 'وصل قبض',
    prefix: 'RC-',
    paper: 'a5',
    signatures: ['توقيع المستلم', 'توقيع الطالب'],
    copyLabels: ['نسخة الطالب', 'نسخة الأكاديمية', 'نسخة المحاسبة'],
    fields: ['studentPhone', 'course', 'method', 'receivedBy', 'note', 'balance', 'amountWords'],
  },
  expense: {
    label: 'سند صرف (مصروف)',
    title: 'سند صرف',
    prefix: 'EX-',
    paper: 'a5',
    signatures: ['المحاسب', 'المدير', 'المستلم'],
    copyLabels: ['الأصل', 'نسخة', 'نسخة'],
    fields: ['category', 'course', 'createdBy', 'amountWords'],
  },
  refund: {
    label: 'سند استرداد (طالب)',
    title: 'سند استرداد',
    prefix: 'RF-',
    paper: 'a5',
    signatures: ['المحاسب', 'المدير', 'توقيع الطالب'],
    copyLabels: ['نسخة الطالب', 'نسخة الأكاديمية', 'نسخة المحاسبة'],
    fields: ['studentPhone', 'course', 'balance', 'history', 'amountWords'],
  },
  owner_withdrawal: {
    label: 'سند سحب المالك',
    title: 'سند سحب المالك',
    prefix: 'OW-',
    paper: 'a5',
    signatures: ['المحاسب', 'المالك'],
    copyLabels: ['الأصل', 'نسخة', 'نسخة'],
    fields: ['createdBy', 'amountWords'],
  },
  wallet_withdrawal: {
    label: 'سند صرف مستحقات موظف',
    title: 'سند صرف مستحقات',
    prefix: 'WD-',
    paper: 'a5',
    signatures: ['المحاسب', 'توقيع الموظف'],
    copyLabels: ['نسخة الموظف', 'نسخة المحاسبة', 'نسخة'],
    fields: ['reviewedBy', 'history', 'amountWords'],
  },
  statement: {
    label: 'كشف حساب طالب',
    title: 'كشف حساب طالب',
    prefix: '',
    paper: 'a4',
    signatures: ['المحاسب', 'ختم الأكاديمية'],
    copyLabels: ['الأصل', 'نسخة', 'نسخة'],
    fields: ['courses', 'ledger', 'attendance'],
  },
};

export const DOC_TYPE_IDS = Object.keys(DOC_TYPES);

/** Optional parts of each document the admin can show or hide. Labels are Arabic source text. */
export const FIELD_LABELS = {
  studentPhone: 'هاتف الطالب',
  course: 'الدورة',
  method: 'طريقة الدفع',
  receivedBy: 'اسم المستلم',
  note: 'الملاحظة',
  balance: 'ملخص الرسوم والمتبقي',
  amountWords: 'المبلغ كتابةً',
  category: 'الفئة',
  createdBy: 'اسم من سجّله',
  history: 'مراحل الاعتماد',
  reviewedBy: 'اسم المعتمِد',
  courses: 'جدول الدورات',
  ledger: 'الحركات المالية بالتفصيل',
  attendance: 'نسبة الحضور',
};

export const LIMITS = {
  fontScale: [70, 160],
  logoSizeMm: [8, 40],
  lineHeight: [1.2, 2],
  marginSheetMm: [0, 30],
  marginRollMm: [0, 10],
  copies: [1, 5],
  signatureCount: [0, 3],
  numberPadding: [1, 8],
};

function docDefaults(id) {
  const d = DOC_TYPES[id];
  return {
    title: '',
    prefix: d.prefix,
    paper: d.paper,
    orientation: 'portrait',
    copies: 1,
    fields: Object.fromEntries(d.fields.map((f) => [f, true])),
    signatureCount: d.signatures.length,
    signatures: null,
    copyLabels: null,
    note: '',
  };
}

export const DEFAULT_PRINT_SETTINGS = {
  version: 1,
  org: {
    name: BRAND_NAME,
    tagline: '',
    address: '',
    phones: '',
    email: '',
    website: '',
    registration: '',
  },
  look: {
    language: 'ui',
    accent: 'brand',
    showLogo: true,
    logoSizeMm: 16,
    fontScale: 100,
    lineHeight: 1.5,
    marginSheetMm: 12,
    marginRollMm: 3,
    frame: true,
    numberPadding: 5,
    showPrintedAt: true,
  },
  text: {
    footer: '',
    terms: '',
    currencyWordsAr: 'ليرة سورية',
    currencyWordsEn: 'Syrian pounds',
  },
  docs: Object.fromEntries(DOC_TYPE_IDS.map((id) => [id, docDefaults(id)])),
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function num(value, [min, max], fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function str(value, fallback, max = 400) {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function strList(value, size) {
  if (!Array.isArray(value)) return null;
  return Array.from({ length: size }, (_, i) => str(value[i], '', 80));
}

function oneOf(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

/** Settings from the server merged over the defaults, every value checked and clamped. */
export function normalizePrintSettings(raw) {
  const src = isObj(raw) ? raw : {};
  const d = DEFAULT_PRINT_SETTINGS;
  const org = isObj(src.org) ? src.org : {};
  const look = isObj(src.look) ? src.look : {};
  const text = isObj(src.text) ? src.text : {};
  const docs = isObj(src.docs) ? src.docs : {};

  return {
    version: 1,
    org: Object.fromEntries(Object.entries(d.org).map(([k, v]) => [k, str(org[k], v, 300)])),
    look: {
      language: oneOf(look.language, ['ui', 'ar', 'en'], d.look.language),
      accent: oneOf(look.accent, ['brand', 'mono'], d.look.accent),
      showLogo: typeof look.showLogo === 'boolean' ? look.showLogo : d.look.showLogo,
      logoSizeMm: num(look.logoSizeMm, LIMITS.logoSizeMm, d.look.logoSizeMm),
      fontScale: num(look.fontScale, LIMITS.fontScale, d.look.fontScale),
      lineHeight: num(look.lineHeight, LIMITS.lineHeight, d.look.lineHeight),
      marginSheetMm: num(look.marginSheetMm, LIMITS.marginSheetMm, d.look.marginSheetMm),
      marginRollMm: num(look.marginRollMm, LIMITS.marginRollMm, d.look.marginRollMm),
      frame: typeof look.frame === 'boolean' ? look.frame : d.look.frame,
      numberPadding: Math.round(num(look.numberPadding, LIMITS.numberPadding, d.look.numberPadding)),
      showPrintedAt: typeof look.showPrintedAt === 'boolean' ? look.showPrintedAt : d.look.showPrintedAt,
    },
    text: {
      footer: str(text.footer, d.text.footer, 500),
      terms: str(text.terms, d.text.terms, 1500),
      currencyWordsAr: str(text.currencyWordsAr, d.text.currencyWordsAr, 60) || d.text.currencyWordsAr,
      currencyWordsEn: str(text.currencyWordsEn, d.text.currencyWordsEn, 60) || d.text.currencyWordsEn,
    },
    docs: Object.fromEntries(
      DOC_TYPE_IDS.map((id) => {
        const def = docDefaults(id);
        const doc = isObj(docs[id]) ? docs[id] : {};
        const fields = isObj(doc.fields) ? doc.fields : {};
        return [
          id,
          {
            title: str(doc.title, '', 80),
            prefix: str(doc.prefix, def.prefix, 12),
            paper: isPaperId(doc.paper) ? doc.paper : def.paper,
            orientation: oneOf(doc.orientation, ['portrait', 'landscape'], 'portrait'),
            copies: Math.round(num(doc.copies, LIMITS.copies, 1)),
            fields: Object.fromEntries(
              Object.keys(def.fields).map((f) => [f, typeof fields[f] === 'boolean' ? fields[f] : true])
            ),
            signatureCount: Math.round(num(doc.signatureCount, LIMITS.signatureCount, def.signatureCount)),
            signatures: strList(doc.signatures, 3),
            copyLabels: strList(doc.copyLabels, 3),
            note: str(doc.note, '', 500),
          },
        ];
      })
    ),
  };
}

/** "RC-00012": the prefix plus the sequence number padded with zeros. */
export function formatDocNumber(prefix, number, padding = 5) {
  if (number == null || number === '') return '';
  return `${prefix || ''}${String(number).padStart(padding, '0')}`;
}

/* ── Per-device print options ──────────────────────────────────────────────── */

export const DEVICE_OPTION_KEYS = [
  'paper',
  'orientation',
  'customWidth',
  'customHeight',
  'copies',
  'fontScale',
  'margin',
  'lang',
];

function readDevice() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}');
    return isObj(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function loadDeviceOptions(type) {
  const all = readDevice();
  return isObj(all[type]) ? all[type] : {};
}

export function saveDeviceOptions(type, options) {
  try {
    const all = readDevice();
    all[type] = Object.fromEntries(DEVICE_OPTION_KEYS.map((k) => [k, options[k]]));
    localStorage.setItem(DEVICE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the choice lasts until the dialog closes
  }
}

export function clearDeviceOptions(type) {
  try {
    const all = readDevice();
    delete all[type];
    localStorage.setItem(DEVICE_KEY, JSON.stringify(all));
  } catch {
    // nothing to clear
  }
}

/** The options a print starts with: the admin defaults for the document, then this device's last choice. */
export function initialOptions(settings, type, uiLang) {
  const doc = settings.docs[type];
  const look = settings.look;
  const base = {
    paper: doc.paper,
    orientation: doc.orientation,
    customWidth: 100,
    customHeight: '',
    copies: doc.copies,
    fontScale: look.fontScale,
    margin: null,
    lang: look.language === 'ui' ? uiLang : look.language,
  };
  const saved = loadDeviceOptions(type);
  const merged = { ...base };
  for (const key of DEVICE_OPTION_KEYS) {
    if (saved[key] !== undefined && saved[key] !== null) merged[key] = saved[key];
  }
  if (!isPaperId(merged.paper)) merged.paper = base.paper;
  merged.orientation = oneOf(merged.orientation, ['portrait', 'landscape'], 'portrait');
  merged.copies = Math.round(num(merged.copies, LIMITS.copies, base.copies));
  merged.fontScale = num(merged.fontScale, LIMITS.fontScale, base.fontScale);
  merged.lang = oneOf(merged.lang, ['ar', 'en'], base.lang);
  merged.margin = merged.margin == null || merged.margin === '' ? null : num(merged.margin, [0, 30], null);
  return merged;
}
