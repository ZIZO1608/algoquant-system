import { translate, translateIn } from '../i18n/core';

/** How a student paid. The value is stored on the payment; labels translate when read. */
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'transfer', label: 'تحويل بنكي' },
  { value: 'e_wallet', label: 'محفظة إلكترونية' },
  { value: 'card', label: 'بطاقة' },
  { value: 'other', label: 'أخرى' },
];

const BY_VALUE = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

/** The method's label in the current language; free text stored by older records passes through. */
export function paymentMethodLabel(value) {
  if (!value) return '';
  return BY_VALUE.has(value) ? translate(BY_VALUE.get(value)) : value;
}

/** The method's label in a given language (printed documents). */
export function paymentMethodLabelIn(lang, value) {
  if (!value) return '';
  return BY_VALUE.has(value) ? translateIn(lang, BY_VALUE.get(value)) : value;
}
