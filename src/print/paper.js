/**
 * Paper sizes for printed documents, in millimetres.
 * Sheets have a fixed height; receipt rolls (thermal printers) have none: the page is as long
 * as the document, measured after it renders. "a4-2up" prints two copies on one A4 sheet
 * (student copy + academy copy) with a cut line between them.
 * Labels are Arabic source text or plain names; translate them when rendering.
 */
export const PAPER_PRESETS = [
  { id: 'a4', label: 'A4', width: 210, height: 297, group: 'sheet' },
  { id: 'a4-2up', label: 'A4 — نسختان في الصفحة', width: 210, height: 297, group: 'sheet', twoUp: true },
  { id: 'a5', label: 'A5', width: 148, height: 210, group: 'sheet' },
  { id: 'a6', label: 'A6', width: 105, height: 148, group: 'sheet' },
  { id: 'b5', label: 'B5', width: 176, height: 250, group: 'sheet' },
  { id: 'letter', label: 'Letter', width: 215.9, height: 279.4, group: 'sheet' },
  { id: 'half-letter', label: 'Half Letter', width: 139.7, height: 215.9, group: 'sheet' },
  { id: 'legal', label: 'Legal', width: 215.9, height: 355.6, group: 'sheet' },
  { id: 'roll-80', label: 'رول حراري 80 مم', width: 80, height: null, group: 'roll' },
  { id: 'roll-76', label: 'رول 76 مم', width: 76, height: null, group: 'roll' },
  { id: 'roll-58', label: 'رول حراري 58 مم', width: 58, height: null, group: 'roll' },
  { id: 'custom', label: 'مقاس مخصص', width: null, height: null, group: 'custom' },
];

export const PAPER_GROUPS = [
  { id: 'sheet', label: 'أوراق' },
  { id: 'roll', label: 'رول إيصالات (طابعة حرارية)' },
  { id: 'custom', label: 'مخصص' },
];

const BY_ID = new Map(PAPER_PRESETS.map((p) => [p.id, p]));

export const CUSTOM_LIMITS = { minWidth: 40, maxWidth: 500, minHeight: 40, maxHeight: 1200 };

export function isPaperId(id) {
  return BY_ID.has(id);
}

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The page to print on: { id, width, height (null = roll), roll, twoUp, landscape, cell }.
 * `cell` is the area one copy of the document fills (half the sheet for 2-up).
 */
export function resolvePaper({ paper, orientation, customWidth, customHeight } = {}) {
  const preset = BY_ID.get(paper) || BY_ID.get('a5');
  let width;
  let height;
  if (preset.id === 'custom') {
    width = round1(clamp(customWidth, CUSTOM_LIMITS.minWidth, CUSTOM_LIMITS.maxWidth, 148));
    const h = Number(customHeight);
    height = customHeight === '' || customHeight == null || !Number.isFinite(h) || h <= 0
      ? null
      : round1(clamp(h, CUSTOM_LIMITS.minHeight, CUSTOM_LIMITS.maxHeight, 210));
  } else {
    width = preset.width;
    height = preset.height;
  }

  const roll = height == null;
  const twoUp = Boolean(preset.twoUp);
  const landscape = !roll && !twoUp && orientation === 'landscape';
  if (landscape) [width, height] = [height, width];

  const cell = twoUp ? { width, height: height / 2 } : { width, height };
  return { id: preset.id, width, height, roll, twoUp, landscape, cell };
}

/**
 * How dense the layout is for one copy: "roll" (narrow thermal style, one column),
 * "compact" (A5, A6, half sheets) or "full" (A4 and larger).
 */
export function layoutFormat(page) {
  if (page.cell.width <= 90) return 'roll';
  if (page.cell.width < 160 || (page.cell.height != null && page.cell.height < 160)) return 'compact';
  return 'full';
}

/** Base text size in points for a copy of this width, before the user's text-size setting. */
export function baseFontPt(page) {
  const w = page.cell.width;
  if (w <= 90) return round1(7.5 + (Math.max(58, w) - 58) * 0.045);
  // Sheets follow their shorter side, so a half sheet (2-up, A5 landscape) reads like A5.
  const side = Math.min(w, page.cell.height ?? w);
  return round1(Math.min(10.5, 7 + (Math.max(58, side) - 58) * 0.022));
}

/**
 * The page margin when the user has not picked one for this print: the roll margin for rolls;
 * for sheets the saved margin, kept in proportion on small papers (A6, half sheets) and never
 * below 4 mm, which most printers cannot print into anyway.
 */
export function defaultMargin(page, look) {
  if (page.roll) return look.marginRollMm;
  const shortSide = Math.min(page.cell.width, page.cell.height ?? page.cell.width);
  return Math.min(look.marginSheetMm, Math.max(4, Math.round(shortSide * 0.06)));
}

/** Logo size for this paper: the saved size, scaled down on small papers so it never dominates. */
export function logoSize(page, look) {
  const share = page.cell.width < 125 && !page.roll ? 0.13 : 0.25;
  return Math.min(look.logoSizeMm, page.cell.width * share);
}

export const MM_PER_PX = 25.4 / 96;

export function formatMm(n) {
  return String(round1(n)).replace(/\.0$/, '');
}
