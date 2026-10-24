import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDir } from '../i18n/core';
import documentCss from './document.css?inline';
import { DocContext, makeDocContext } from './docContext';
import { DocumentCopy } from './documents';
import { MM_PER_PX, baseFontPt, defaultMargin, layoutFormat, logoSize, resolvePaper } from './paper';

/**
 * The print preview and the printer in one: an isolated iframe that holds the pages at their
 * real size (scaled on screen to fit), so what you see is exactly what prints. Receipt rolls
 * are measured to set their length; sheets whose content would overflow shrink the text a
 * little until it fits (never below MIN_FIT) and report it through onMetrics.
 */

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';
const MIN_FIT = 0.62;
const MAX_FIT_STEPS = 8;
/** Pages are drawn a hair shorter than the paper so rounding never spills onto a blank page. */
const PAGE_SAFETY_MM = 0.6;

const SRC_DOC = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_HREF}">
<style>${documentCss}</style><style id="page-css"></style></head>
<body><div id="print-root"></div></body></html>`;

const r2 = (n) => Math.round(n * 100) / 100;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const PrintPreview = forwardRef(function PrintPreview(
  { type, data, settings, options, zoom = 'fit', title, className = '', onMetrics },
  ref
) {
  const frameRef = useRef(null);
  const stageRef = useRef(null);
  const [mount, setMount] = useState(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);
  const [docHeightPx, setDocHeightPx] = useState(0);
  const [fit, setFit] = useState(1);
  const lastMetrics = useRef('');

  const lang = options.lang;
  const page = useMemo(
    () => resolvePaper(options),
    [options]
  );
  const format = layoutFormat(page);
  const flow = type === 'statement' && !page.roll;
  const look = settings.look;
  const margin = options.margin ?? defaultMargin(page, look);
  const copies = Math.max(1, options.copies || 1);

  // Start over whenever something that changes the size of the content changes.
  const sizeKey = `${type}|${page.id}|${page.width}|${page.height}|${options.fontScale}|${margin}|${lang}|${copies}|${JSON.stringify(settings)}|${data?.id}`;
  const [fitKey, setFitKey] = useState(sizeKey);
  const fitSteps = useRef(0);
  if (fitKey !== sizeKey) {
    setFitKey(sizeKey);
    setFit(1);
    fitSteps.current = 0;
  }

  const fontPt = r2(baseFontPt(page) * (options.fontScale / 100) * fit);
  const logoMm = logoSize(page, look);
  const rollHeightMm = page.roll ? Math.max(40, Math.ceil(docHeightPx * MM_PER_PX) + 2) : null;
  const pageHeightMm = page.roll ? rollHeightMm : page.height;
  const cellHeightMm = page.roll
    ? null
    : page.twoUp
      ? (page.height - PAGE_SAFETY_MM) / 2 - 0.3
      : page.height - PAGE_SAFETY_MM;

  const pageCss = useMemo(() => {
    const size = `${page.width}mm ${pageHeightMm}mm`;
    return [
      flow ? `@page { size: ${size}; margin: ${margin}mm; }` : `@page { size: ${size}; margin: 0; }`,
      ':root {',
      `  --page-w: ${page.width}mm;`,
      `  --page-h: ${r2(pageHeightMm - (page.roll ? 0 : PAGE_SAFETY_MM))}mm;`,
      `  --cell-h: ${cellHeightMm ? r2(cellHeightMm) : 0}mm;`,
      `  --pad: ${margin}mm;`,
      `  --fs: ${fontPt}pt;`,
      `  --lh: ${look.lineHeight};`,
      `  --logo: ${r2(logoMm)}mm;`,
      '}',
      flow ? '@media print { .pd-page.is-flow { width: auto !important; min-height: 0 !important; } }' : '',
    ].join('\n');
  }, [page, pageHeightMm, cellHeightMm, flow, margin, fontPt, look.lineHeight, logoMm]);

  const ctx = useMemo(
    () => makeDocContext({ lang, settings, type, format }),
    [lang, settings, type, format]
  );

  /* Frame plumbing: mount point, language, page CSS */
  const handleLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc) setMount(doc.getElementById('print-root'));
  }, []);

  useEffect(() => {
    // A cached srcdoc can finish loading before React attaches onLoad.
    const doc = frameRef.current?.contentDocument;
    if (doc?.readyState === 'complete' && doc.getElementById('print-root')) handleLoad();
  }, [handleLoad]);

  // A layout effect, declared before the measuring one, so sizes are measured with the new CSS.
  useLayoutEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!mount || !doc) return;
    doc.documentElement.lang = lang;
    doc.documentElement.dir = getDir(lang);
    doc.title = title || ctx.title;
    const style = doc.getElementById('page-css');
    if (style) style.textContent = pageCss;
  }, [mount, lang, pageCss, title, ctx.title]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setFrameWidth(el.clientWidth));
    ro.observe(el);
    setFrameWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Web fonts arrive after the first render and change text heights: watch the documents
  // from inside the frame and measure again when they resize. Shrink-to-fit waits for the
  // fonts, or the wider fallback font would shrink the text for nothing.
  const [, setResizeTick] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const docObserver = useRef(null);
  useEffect(() => {
    const win = frameRef.current?.contentWindow;
    if (!mount || !win?.ResizeObserver) return undefined;
    let alive = true;
    const ro = new win.ResizeObserver(() => setResizeTick((n) => n + 1));
    docObserver.current = ro;
    const fonts = win.document.fonts;
    if (!fonts) setFontsReady(true);
    else
      fonts.ready.then(
        () => alive && setFontsReady(true),
        () => alive && setFontsReady(true)
      );
    return () => {
      alive = false;
      ro.disconnect();
      docObserver.current = null;
    };
  }, [mount]);

  /* Measure after every render that can change the content's size */
  useLayoutEffect(() => {
    if (!mount || !stageRef.current) return;
    const docs = Array.from(mount.querySelectorAll('.pd-doc'));
    docs.forEach((el) => docObserver.current?.observe(el));
    const tallest = docs.reduce((max, el) => Math.max(max, el.offsetHeight), 0);
    // On a fixed page the document stretches to fill it (the spacer takes the slack), so the
    // content's own height is the document minus whatever the spacer grew beyond its minimum.
    const natural = docs.reduce((max, el) => {
      const spacer = el.querySelector('.pd-spacer');
      if (!spacer) return Math.max(max, el.offsetHeight);
      const minPx = parseFloat(spacer.ownerDocument.defaultView.getComputedStyle(spacer).minHeight) || 0;
      return Math.max(max, el.offsetHeight - Math.max(0, spacer.offsetHeight - minPx));
    }, 0);
    const cell = mount.querySelector('.pd-cell');
    const cellPx = cell && !page.roll && !flow ? cell.clientHeight : 0;
    const overflow = cellPx > 0 && natural > cellPx + 1;

    if (page.roll && Math.abs(tallest - docHeightPx) > 1) setDocHeightPx(tallest);
    setStageHeight(stageRef.current.offsetHeight);

    // Shrink when it overflows, grow back when there is clear room; a few steps at most.
    if (cellPx > 0 && fontsReady && fitSteps.current < MAX_FIT_STEPS) {
      let next = fit;
      if (overflow && fit > MIN_FIT) next = Math.max(MIN_FIT, r2(fit * (cellPx / natural) * 0.97));
      else if (!overflow && fit < 1 && natural < cellPx * 0.9) next = Math.min(1, r2(fit * (cellPx / natural) * 0.95));
      if (next !== fit) {
        fitSteps.current += 1;
        setFit(next);
        return;
      }
    }
    const metrics = {
      overflow,
      fit,
      pages: page.twoUp ? Math.ceil(copies / 2) : copies,
      widthMm: page.width,
      heightMm: page.roll ? rollHeightMm : page.height,
      roll: page.roll,
      format,
    };
    // Only report real changes, or a parent that stores them would re-render forever.
    const key = JSON.stringify(metrics);
    if (key !== lastMetrics.current) {
      lastMetrics.current = key;
      onMetrics?.(metrics);
    }
  });

  /* Print exactly the frame, after its fonts and logo are ready */
  useImperativeHandle(
    ref,
    () => ({
      async print() {
        const win = frameRef.current?.contentWindow;
        const doc = win?.document;
        if (!win || !doc) return false;
        try {
          await doc.fonts?.ready;
        } catch {
          // fonts are a nicety; system fonts still print
        }
        await Promise.all(
          Array.from(doc.images).map((img) =>
            img.complete
              ? null
              : new Promise((resolve) => {
                  img.addEventListener('load', resolve, { once: true });
                  img.addEventListener('error', resolve, { once: true });
                })
          )
        );
        // Let a re-measure after the fonts landed (roll length, fit) reach the page CSS.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        win.focus();
        win.print();
        return true;
      },
    }),
    []
  );

  const pageWidthPx = page.width / MM_PER_PX;
  const scale = zoom === 'fit' && frameWidth ? Math.min(1.25, Math.max(0.2, (frameWidth - 36) / pageWidthPx)) : 1;

  const copyIndexes = Array.from({ length: copies }, (_, i) => i);
  const copy = (i) => (
    <DocumentCopy type={type} data={data} copyLabel={ctx.copyLabel(i, copies)} />
  );

  let pages;
  if (page.twoUp) {
    pages = chunk(copyIndexes, 2).map((pair) => (
      <div key={pair[0]} className="pd-page">
        <div className="pd-cell">{copy(pair[0])}</div>
        <div className="pd-cut" />
        <div className="pd-cell">{pair[1] !== undefined ? copy(pair[1]) : null}</div>
      </div>
    ));
  } else {
    const pageClass = page.roll ? 'is-roll' : flow ? 'is-flow' : '';
    pages = copyIndexes.map((i) => (
      <div key={i} className={`pd-page ${pageClass}`}>
        <div className="pd-cell">{copy(i)}</div>
      </div>
    ));
  }

  const stageClass = [
    'pd-stage',
    `fmt-${format}`,
    look.accent === 'mono' ? 'accent-mono' : 'accent-brand',
    look.frame ? 'pd-frame' : '',
    page.cell.width < 125 ? 'is-narrow' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <iframe
        ref={frameRef}
        className={`print-frame ${className}`.trim()}
        srcDoc={SRC_DOC}
        onLoad={handleLoad}
        title={title || ctx.title}
      />
      {mount &&
        data &&
        createPortal(
          <DocContext.Provider value={ctx}>
            <div className="pd-desk">
              <div
                className="pd-viewport"
                style={{ width: `${pageWidthPx * scale}px`, height: `${stageHeight * scale}px` }}
              >
                <div ref={stageRef} className={stageClass} style={{ transform: `scale(${scale})` }}>
                  {pages}
                </div>
              </div>
            </div>
          </DocContext.Provider>,
          mount
        )}
    </>
  );
});

export default PrintPreview;
