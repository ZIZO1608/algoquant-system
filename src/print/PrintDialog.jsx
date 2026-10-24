import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { AlertIcon, InfoIcon, MaximizeIcon, MinimizeIcon, PrinterIcon, RefreshIcon } from '../components/icons';
import { useApp } from '../context/AppContext';
import { LANGUAGE_NAMES, useI18n } from '../i18n';
import { documentsApi } from '../api/client';
import PrintPreview from './PrintPreview';
import { CustomSizeFields, PaperSelect, RangeField, Segmented, Stepper } from './PrintControls';
import { defaultMargin, formatMm, resolvePaper } from './paper';
import {
  DOC_TYPES,
  LIMITS,
  clearDeviceOptions,
  formatDocNumber,
  initialOptions,
  normalizePrintSettings,
  saveDeviceOptions,
} from './printSettings';
import './PrintDialog.css';

/**
 * Print preview dialog: loads the document, shows it exactly as it will print, and lets the
 * user change the paper (any preset, a receipt roll or a custom size), orientation, copies,
 * text size, margins and language for this print. The last choice is remembered per document
 * type on this device.
 */
export default function PrintDialog({ job, onClose }) {
  const { t, td, lang: uiLang } = useI18n();
  const { settings: appSettings } = useApp();
  const toast = useToast();
  const settings = useMemo(() => normalizePrintSettings(appSettings?.printSettings), [appSettings?.printSettings]);
  const [options, setOptions] = useState(() => initialOptions(settings, job.type, uiLang));
  const [data, setData] = useState(job.data || null);
  const [loading, setLoading] = useState(!job.data);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [zoom, setZoom] = useState('fit');
  const [printing, setPrinting] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    if (job.data) return undefined;
    let cancelled = false;
    documentsApi
      .get(job.type, job.id)
      .then((doc) => {
        if (!cancelled) setData(doc);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job]);

  const set = (patch) => setOptions((prev) => ({ ...prev, ...patch }));
  const page = resolvePaper(options);
  const meta = DOC_TYPES[job.type];
  const docTitle = settings.docs[job.type].title.trim() || t(meta.title);
  const number = data?.number != null
    ? formatDocNumber(settings.docs[job.type].prefix, data.number, settings.look.numberPadding)
    : '';
  const marginDefault = defaultMargin(page, settings.look);
  const marginMax = page.roll ? LIMITS.marginRollMm[1] : LIMITS.marginSheetMm[1];

  const handlePrint = useCallback(async () => {
    if (!previewRef.current || !data || printing) return;
    setPrinting(true);
    try {
      await previewRef.current.print();
      saveDeviceOptions(job.type, options);
    } catch {
      toast.error(t('تعذّرت الطباعة. حاول مرة أخرى.'));
    } finally {
      setPrinting(false);
    }
  }, [data, printing, job.type, options, toast, t]);

  // Ctrl/Cmd+P prints the document, not the app page behind the dialog.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePrint]);

  const resetOptions = () => {
    clearDeviceOptions(job.type);
    setOptions(initialOptions(settings, job.type, uiLang));
  };

  const sizeLabel = page.roll
    ? t('عرض {w} مم · الطول حسب المحتوى', { w: formatMm(page.width) })
    : t('{w} × {h} مم', { w: formatMm(page.width), h: formatMm(page.height) });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('طباعة: {title}', { title: docTitle })}
      description={number ? t('المستند رقم {number}', { number }) : undefined}
      className="print-dialog"
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={handlePrint} disabled={!data || printing}>
            <PrinterIcon />
            {printing ? t('جاري التحضير…') : t('طباعة')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('إغلاق')}
          </button>
        </>
      }
    >
      <div className="print-layout">
        <aside className="print-options" aria-label={t('خيارات الطباعة')}>
          <div className="print-opt">
            <span className="print-opt-label">{t('لغة المستند')}</span>
            <Segmented
              label={t('لغة المستند')}
              value={options.lang}
              onChange={(lang) => set({ lang })}
              options={[
                { value: 'ar', label: LANGUAGE_NAMES.ar },
                { value: 'en', label: LANGUAGE_NAMES.en },
              ]}
            />
          </div>

          <div className="print-opt">
            <label className="print-opt-label" htmlFor="print-paper">
              {t('حجم الورق')}
            </label>
            <PaperSelect id="print-paper" value={options.paper} onChange={(paper) => set({ paper })} />
            {options.paper === 'custom' && (
              <CustomSizeFields
                idPrefix="print-custom"
                width={options.customWidth}
                height={options.customHeight}
                onChange={set}
              />
            )}
            {options.paper === 'custom' && (
              <span className="form-hint">{t('اترك الطول فارغاً لورق الرول: يُحسب الطول من المحتوى.')}</span>
            )}
          </div>

          <div className="print-opt">
            <span className="print-opt-label">{t('الاتجاه')}</span>
            <Segmented
              label={t('الاتجاه')}
              value={page.landscape ? 'landscape' : 'portrait'}
              onChange={(orientation) => set({ orientation })}
              disabled={page.roll || page.twoUp}
              options={[
                { value: 'portrait', label: t('عمودي') },
                { value: 'landscape', label: t('أفقي') },
              ]}
            />
          </div>

          <div className="print-opt">
            <span className="print-opt-label">{t('عدد النسخ')}</span>
            <Stepper
              id="print-copies"
              label={t('عدد النسخ')}
              value={options.copies}
              min={LIMITS.copies[0]}
              max={LIMITS.copies[1]}
              onChange={(copies) => set({ copies })}
            />
            {page.twoUp && <span className="form-hint">{t('نسختان في كل ورقة A4 مع خط قص بينهما.')}</span>}
          </div>

          <RangeField
            id="print-font"
            label={t('حجم النص')}
            value={options.fontScale}
            min={LIMITS.fontScale[0]}
            max={LIMITS.fontScale[1]}
            step={5}
            unit="%"
            onChange={(fontScale) => set({ fontScale })}
          />

          <RangeField
            id="print-margin"
            label={t('الهوامش')}
            value={options.margin ?? marginDefault}
            min={0}
            max={marginMax}
            unit={` ${t('مم')}`}
            onChange={(margin) => set({ margin })}
          />

          <button type="button" className="btn btn-ghost btn-sm print-reset" onClick={resetOptions}>
            <RefreshIcon size={16} />
            {t('استعادة الإعدادات الافتراضية')}
          </button>

          <div className="print-tip">
            <InfoIcon size={16} />
            <span>
              {t('في نافذة الطباعة: اختر الطابعة، واجعل الهوامش «بلا» أو «افتراضية» والمقياس 100%، وفعّل «رسومات الخلفية» لتظهر الألوان.')}
            </span>
          </div>
        </aside>

        <section className="print-pane" aria-label={t('معاينة الطباعة')}>
          <div className="print-pane-bar">
            <span className="print-size tnum">{sizeLabel}</span>
            {metrics?.pages > 1 && (
              <span className="badge tone-neutral plain">{t('{n} صفحات', { n: metrics.pages })}</span>
            )}
            {metrics && metrics.fit < 1 && !metrics.overflow && (
              <span className="badge tone-warning plain">
                {t('صُغّر النص إلى {n}% ليتسع في الصفحة', { n: Math.round(metrics.fit * 100) })}
              </span>
            )}
            {metrics?.overflow && (
              <span className="badge tone-danger plain">
                <AlertIcon size={14} />
                {t('المحتوى أطول من الصفحة: اختر ورقاً أكبر أو قلّل حجم النص')}
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm print-zoom"
              onClick={() => setZoom((z) => (z === 'fit' ? 'actual' : 'fit'))}
            >
              {zoom === 'fit' ? <MaximizeIcon size={16} /> : <MinimizeIcon size={16} />}
              {zoom === 'fit' ? t('الحجم الفعلي') : t('ملاءمة العرض')}
            </button>
          </div>

          {loading && (
            <div className="print-loading">
              <span className="spinner" aria-hidden="true" />
              <span>{t('جاري تحميل المستند…')}</span>
            </div>
          )}
          {!loading && error && (
            <EmptyState icon={<AlertIcon />} title={t('تعذّر تحميل المستند')} hint={td(error)} />
          )}
          {!loading && !error && data && (
            <PrintPreview
              ref={previewRef}
              type={job.type}
              data={data}
              settings={settings}
              options={options}
              zoom={zoom}
              title={number ? `${docTitle} ${number}` : docTitle}
              onMetrics={setMetrics}
            />
          )}
        </section>
      </div>
    </Modal>
  );
}
