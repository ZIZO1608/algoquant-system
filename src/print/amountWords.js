/* i18n-check: skip-file — Arabic number words are language data, not UI text. */
/**
 * Whole amounts in words for receipts: Arabic (تفقيط) and English.
 *
 * Arabic follows the usual receipt style: masculine counting, groups joined with "و",
 * ألف / ألفان / آلاف (3–10) / ألفاً (11–99), and the construct form مئتا ألف.
 *   1,500,000 → مليون وخمسمئة ألف
 *   25,000    → خمسة وعشرون ألفاً
 *   101,000   → مئة ألف وألف
 */

const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const AR_TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const AR_HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];
// [one, two, 3–10, 11–99 accusative]
const AR_SCALES = [
  null,
  ['ألف', 'ألفان', 'آلاف', 'ألفاً'],
  ['مليون', 'مليونان', 'ملايين', 'مليوناً'],
  ['مليار', 'ملياران', 'مليارات', 'ملياراً'],
  ['تريليون', 'تريليونان', 'تريليونات', 'تريليوناً'],
];

function arBelowHundred(n) {
  if (n === 0) return '';
  if (n < 10) return AR_ONES[n];
  if (n < 20) return AR_TEENS[n - 10];
  const unit = n % 10;
  const ten = Math.floor(n / 10);
  return unit ? `${AR_ONES[unit]} و${AR_TENS[ten]}` : AR_TENS[ten];
}

function arBelowThousand(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [AR_HUNDREDS[hundreds], arBelowHundred(rest)].filter(Boolean).join(' و');
}

/** One group (1–999) followed by its scale word. */
function arScaledGroup(group, scale) {
  const [one, two, few, many] = AR_SCALES[scale];
  if (group === 1) return one;
  if (group === 2) return two;
  if (group <= 10) return `${arBelowThousand(group)} ${few}`;

  const hundreds = Math.floor(group / 100);
  const rest = group % 100;
  if (rest === 0) {
    // مئة ألف، مئتا ألف (construct form)، ثلاثمئة ألف
    return `${hundreds === 2 ? 'مئتا' : AR_HUNDREDS[hundreds]} ${one}`;
  }
  if (rest <= 2 && hundreds > 0) {
    const head = `${hundreds === 2 ? 'مئتا' : AR_HUNDREDS[hundreds]} ${one}`;
    return `${head} و${rest === 1 ? one : two}`;
  }
  if (rest <= 10) return `${arBelowThousand(group)} ${few}`;
  return `${arBelowThousand(group)} ${many}`;
}

export function toArabicWords(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'صفر';
  const groups = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts = [];
  for (let scale = groups.length - 1; scale >= 0; scale -= 1) {
    const group = groups[scale];
    if (!group) continue;
    parts.push(scale === 0 ? arBelowThousand(group) : arScaledGroup(group, Math.min(scale, 4)));
  }
  return parts.join(' و');
}

const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

function enBelowThousand(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundreds) parts.push(`${EN_ONES[hundreds]} hundred`);
  if (rest) {
    if (rest < 20) parts.push(EN_ONES[rest]);
    else parts.push(EN_TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${EN_ONES[rest % 10]}` : ''));
  }
  return parts.join(' ');
}

export function toEnglishWords(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'zero';
  const groups = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts = [];
  for (let scale = groups.length - 1; scale >= 0; scale -= 1) {
    if (!groups[scale]) continue;
    parts.push([enBelowThousand(groups[scale]), EN_SCALES[Math.min(scale, 4)]].filter(Boolean).join(' '));
  }
  return parts.join(' ');
}

export function amountInWords(value, lang) {
  return lang === 'en' ? toEnglishWords(value) : toArabicWords(value);
}
