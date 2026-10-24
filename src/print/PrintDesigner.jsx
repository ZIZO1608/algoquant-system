import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useDialog } from '../components/DialogProvider';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { documentsApi, settingsApi } from '../api/client';
import { RefreshIcon } from '../components/icons';
import PrintPreview from './PrintPreview';
import { CustomSizeFields, PaperSelect, RangeField, Segmented, Stepper } from './PrintControls';
import { sampleDocument } from './sampleDocuments';
import {
  DEFAULT_PRINT_SETTINGS,
  DOC_TYPES,
  DOC_TYPE_IDS,
  FIELD_LABELS,
  LIMITS,
  SETTINGS_KEY,
  formatDocNumber,
  normalizePrintSettings,
} from './printSettings';
import './PrintDialog.css';
import './PrintDesigner.css';

/** Settings → "الإيصالات والطباعة": everything printed documents show, with a live preview. */
export default function PrintDesigner() {
  const { t, td, lang: uiLang } = useI18n();
  const { settings: appSettings, loadSettings } = useApp();
  const toast = useToast();
  const { confirm } = useDialog();

  const saved = useMemo(() => normalizePrintSettings(appSettings?.[SETTINGS_KEY]), [appSettings]);
  const [draft, setDraft] = useState(saved);
  const [savedKey, setSavedKey] = useState(() => JSON.stringify(saved));
  const [docType, setDocType] = useState('payment');
  const [previewPaper, setPreviewPaper] = useState(null);
  const [previewCustom, setPreviewCustom] = useState({ customWidth: 100, customHeight: '' });
  const [saving, setSaving] = useState(false);
  const [numbering, setNumbering] = useState(null);
  const [nextInput, setNextInput] = useState('');
  const [numberSaving, setNumberSaving] = useState(false);
  const [metrics, setMetrics] = useState(null);

  // Settings loaded after the page opened (or saved elsewhere) replace an untouched draft.
  const savedJson = JSON.stringify(saved);
  const dirty = JSON.stringify(draft) !== savedKey;
  if (savedJson !== savedKey && !dirty) {
    setSavedKey(savedJson);
    setDraft(saved);
  }

  useEffect(() => {
    documentsApi.numbering().then(setNumbering).catch(() => setNumbering(null));
  }, []);

  const doc = draft.docs[docType];
  const meta = DOC_TYPES[docType];
  const docLang = draft.look.language === 'ui' ? uiLang : draft.look.language;
  const sample = useMemo(() => sampleDocument(docType, docLang), [docType, docLang]);
  const previewOptions = {
    paper: previewPaper || doc.paper,
    orientation: doc.orientation,
    ...previewCustom,
    copies: Math.min(2, doc.copies),
    fontScale: draft.look.fontScale,
    margin: null,
    lang: docLang,
  };

  const setOrg = (patch) => setDraft((d) => ({ ...d, org: { ...d.org, ...patch } }));
  const setLook = (patch) => setDraft((d) => ({ ...d, look: { ...d.look, ...patch } }));
  const setText = (patch) => setDraft((d) => ({ ...d, text: { ...d.text, ...patch } }));
  const setDoc = (patch) =>
    setDraft((d) => ({ ...d, docs: { ...d.docs, [docType]: { ...d.docs[docType], ...patch } } }));
  const setListItem = (key, index, value) => {
    const list = [...(doc[key] || ['', '', ''])];
    list[index] = value;
    setDoc({ [key]: list.every((v) => !v.trim()) ? null : list });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const clean = normalizePrintSettings(draft);
      await settingsApi.update({ [SETTINGS_KEY]: clean });
      await loadSettings();
      setDraft(clean);
      setSavedKey(JSON.stringify(clean));
      toast.success(t('تم حفظ إعدادات الطباعة'));
    } catch (err) {
      toast.error(td(err.message) || t('تعذّر حفظ الإعدادات'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    const ok = await confirm({
      title: t('استعادة التصميم الافتراضي'),
      message: t('ستعود كل إعدادات الإيصالات إلى القيم الافتراضية. لن يُحفظ شيء حتى تضغط «حفظ».'),
      confirmLabel: t('استعادة'),
    });
    if (ok) setDraft(normalizePrintSettings(DEFAULT_PRINT_SETTINGS));
  };

  const numberInfo = numbering?.[docType];
  const handleNextNumber = async () => {
    const next = Number(nextInput);
    if (!Number.isInteger(next) || next < 1) {
      toast.error(t('أدخل رقماً صحيحاً موجباً'));
      return;
    }
    setNumberSaving(true);
    try {
      const state = await documentsApi.setNextNumber(docType, next);
      setNumbering((prev) => ({ ...prev, [docType]: state }));
      setNextInput('');
      toast.success(t('سيبدأ الترقيم من {number}', { number: formatDocNumber(doc.prefix, next, draft.look.numberPadding) }));
    } catch (err) {
      toast.error(td(err.message));
    } finally {
      setNumberSaving(false);
    }
  };

  return (
    <div className="designer">
      <div className="designer-form">
        {/* Academy details */}
        <section className="card designer-card">
          <h3 className="card-title">{t('بيانات الأكاديمية')}</h3>
          <p className="settings-lead">{t('تظهر في رأس كل إيصال وسند وكشف حساب.')}</p>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pd-org-name">{t('الاسم')}</label>
              <input id="pd-org-name" value={draft.org.name} onChange={(e) => setOrg({ name: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="pd-org-tagline">{t('سطر تعريفي')}</label>
              <input
                id="pd-org-tagline"
                value={draft.org.tagline}
                placeholder={t('مثال: أكاديمية البرمجة والذكاء الاصطناعي')}
                onChange={(e) => setOrg({ tagline: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pd-org-address">{t('العنوان')}</label>
            <input id="pd-org-address" value={draft.org.address} onChange={(e) => setOrg({ address: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pd-org-phones">{t('أرقام الهاتف')}</label>
              <input
                id="pd-org-phones"
                className="ltr"
                value={draft.org.phones}
                placeholder="0933 000 000 · 011 000 0000"
                onChange={(e) => setOrg({ phones: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pd-org-email">{t('البريد الإلكتروني')}</label>
              <input id="pd-org-email" className="ltr" value={draft.org.email} onChange={(e) => setOrg({ email: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pd-org-web">{t('الموقع الإلكتروني')}</label>
              <input id="pd-org-web" className="ltr" value={draft.org.website} onChange={(e) => setOrg({ website: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="pd-org-reg">{t('رقم السجل')}</label>
              <input id="pd-org-reg" value={draft.org.registration} onChange={(e) => setOrg({ registration: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Look */}
        <section className="card designer-card">
          <h3 className="card-title">{t('المظهر والمقاسات')}</h3>
          <div className="designer-grid">
            <div className="print-opt">
              <span className="print-opt-label">{t('لغة المستندات')}</span>
              <Segmented
                label={t('لغة المستندات')}
                value={draft.look.language}
                onChange={(language) => setLook({ language })}
                options={[
                  { value: 'ui', label: t('حسب لغة الواجهة') },
                  { value: 'ar', label: t('العربية دائماً') },
                  { value: 'en', label: t('الإنجليزية دائماً') },
                ]}
              />
            </div>
            <div className="print-opt">
              <span className="print-opt-label">{t('الألوان')}</span>
              <Segmented
                label={t('الألوان')}
                value={draft.look.accent}
                onChange={(accent) => setLook({ accent })}
                options={[
                  { value: 'brand', label: t('ألوان الشعار') },
                  { value: 'mono', label: t('أبيض وأسود') },
                ]}
              />
            </div>
            <RangeField
              id="pd-font"
              label={t('حجم النص')}
              value={draft.look.fontScale}
              min={LIMITS.fontScale[0]}
              max={LIMITS.fontScale[1]}
              step={5}
              unit="%"
              onChange={(fontScale) => setLook({ fontScale })}
              hint={t('يتناسب تلقائياً مع حجم الورق، وهذه النسبة تكبّره أو تصغّره.')}
            />
            <RangeField
              id="pd-line"
              label={t('تباعد الأسطر')}
              value={draft.look.lineHeight}
              min={LIMITS.lineHeight[0]}
              max={LIMITS.lineHeight[1]}
              step={0.05}
              onChange={(lineHeight) => setLook({ lineHeight })}
            />
            <RangeField
              id="pd-logo"
              label={t('حجم الشعار')}
              value={draft.look.logoSizeMm}
              min={LIMITS.logoSizeMm[0]}
              max={LIMITS.logoSizeMm[1]}
              unit={` ${t('مم')}`}
              onChange={(logoSizeMm) => setLook({ logoSizeMm })}
            />
            <RangeField
              id="pd-margin"
              label={t('هوامش الأوراق')}
              value={draft.look.marginSheetMm}
              min={LIMITS.marginSheetMm[0]}
              max={LIMITS.marginSheetMm[1]}
              unit={` ${t('مم')}`}
              onChange={(marginSheetMm) => setLook({ marginSheetMm })}
            />
            <RangeField
              id="pd-margin-roll"
              label={t('هوامش الرول الحراري')}
              value={draft.look.marginRollMm}
              min={LIMITS.marginRollMm[0]}
              max={LIMITS.marginRollMm[1]}
              unit={` ${t('مم')}`}
              onChange={(marginRollMm) => setLook({ marginRollMm })}
            />
            <RangeField
              id="pd-pad"
              label={t('عدد خانات الرقم')}
              value={draft.look.numberPadding}
              min={LIMITS.numberPadding[0]}
              max={LIMITS.numberPadding[1]}
              onChange={(numberPadding) => setLook({ numberPadding })}
              hint={t('مثال: {number}', { number: formatDocNumber(doc.prefix, 12, draft.look.numberPadding) })}
            />
          </div>
          <div className="designer-checks">
            <label className="designer-check">
              <input type="checkbox" checked={draft.look.showLogo} onChange={(e) => setLook({ showLogo: e.target.checked })} />
              {t('إظهار الشعار')}
            </label>
            <label className="designer-check">
              <input type="checkbox" checked={draft.look.frame} onChange={(e) => setLook({ frame: e.target.checked })} />
              {t('إطار حول المستند')}
            </label>
            <label className="designer-check">
              <input
                type="checkbox"
                checked={draft.look.showPrintedAt}
                onChange={(e) => setLook({ showPrintedAt: e.target.checked })}
              />
              {t('إظهار وقت الطباعة')}
            </label>
          </div>
        </section>

        {/* Per document */}
        <section className="card designer-card">
          <h3 className="card-title">{t('إعدادات كل مستند')}</h3>
          <div className="filter-chips designer-doc-chips" role="tablist" aria-label={t('نوع المستند')}>
            {DOC_TYPE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={docType === id}
                className={`chip ${docType === id ? 'active' : ''}`}
                onClick={() => {
                  setDocType(id);
                  setPreviewPaper(null);
                  setNextInput('');
                }}
              >
                {t(DOC_TYPES[id].label)}
              </button>
            ))}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pd-doc-title">{t('عنوان المستند')}</label>
              <input
                id="pd-doc-title"
                value={doc.title}
                placeholder={t(meta.title)}
                onChange={(e) => setDoc({ title: e.target.value })}
              />
            </div>
            {docType !== 'statement' && (
              <div className="form-group">
                <label htmlFor="pd-doc-prefix">{t('بادئة الرقم')}</label>
                <input
                  id="pd-doc-prefix"
                  className="ltr"
                  maxLength={12}
                  value={doc.prefix}
                  onChange={(e) => setDoc({ prefix: e.target.value })}
                />
              </div>
            )}
          </div>

          {docType !== 'statement' && numberInfo && (
            <div className="designer-numbering">
              <div className="designer-numbering-info">
                <span>
                  {t('آخر رقم مستخدم')}{' '}
                  <strong className="ltr tnum">
                    {numberInfo.lastUsed ? formatDocNumber(doc.prefix, numberInfo.lastUsed, draft.look.numberPadding) : '—'}
                  </strong>
                </span>
                <span>
                  {t('الرقم التالي')}{' '}
                  <strong className="ltr tnum">{formatDocNumber(doc.prefix, numberInfo.next, draft.look.numberPadding)}</strong>
                </span>
              </div>
              <div className="designer-numbering-set">
                <label className="sr-only" htmlFor="pd-next-number">
                  {t('ابدأ الترقيم من')}
                </label>
                <input
                  id="pd-next-number"
                  type="number"
                  className="input ltr tnum"
                  min={(numberInfo.lastUsed || 0) + 1}
                  placeholder={t('ابدأ الترقيم من…')}
                  value={nextInput}
                  onChange={(e) => setNextInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleNextNumber}
                  disabled={!nextInput || numberSaving}
                >
                  {numberSaving ? t('جاري الحفظ…') : t('تطبيق')}
                </button>
              </div>
              <span className="form-hint">
                {t('مفيد لمتابعة ترقيم دفتر إيصالات ورقي. يجب أن يكون الرقم أكبر من آخر رقم مستخدم، ويُطبَّق فوراً.')}
              </span>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pd-doc-paper">{t('الورق الافتراضي')}</label>
              <PaperSelect id="pd-doc-paper" value={doc.paper} onChange={(paper) => { setDoc({ paper }); setPreviewPaper(null); }} />
            </div>
            <div className="form-group">
              <span className="form-label">{t('الاتجاه')}</span>
              <Segmented
                label={t('الاتجاه')}
                value={doc.orientation}
                onChange={(orientation) => setDoc({ orientation })}
                options={[
                  { value: 'portrait', label: t('عمودي') },
                  { value: 'landscape', label: t('أفقي') },
                ]}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <span className="form-label">{t('عدد النسخ')}</span>
              <Stepper
                id="pd-doc-copies"
                label={t('عدد النسخ')}
                value={doc.copies}
                min={LIMITS.copies[0]}
                max={LIMITS.copies[1]}
                onChange={(copies) => setDoc({ copies })}
              />
            </div>
            <div className="form-group">
              <span className="form-label">{t('خانات التوقيع')}</span>
              <Stepper
                id="pd-doc-signs"
                label={t('خانات التوقيع')}
                value={doc.signatureCount}
                min={LIMITS.signatureCount[0]}
                max={LIMITS.signatureCount[1]}
                onChange={(signatureCount) => setDoc({ signatureCount })}
              />
            </div>
          </div>

          {doc.signatureCount > 0 && (
            <div className="form-group">
              <span className="form-label">{t('عناوين خانات التوقيع')}</span>
              <div className="designer-inline-inputs">
                {Array.from({ length: doc.signatureCount }, (_, i) => (
                  <input
                    key={i}
                    className="input"
                    aria-label={t('خانة التوقيع {n}', { n: i + 1 })}
                    placeholder={t(meta.signatures[i] || 'التوقيع')}
                    value={doc.signatures?.[i] || ''}
                    onChange={(e) => setListItem('signatures', i, e.target.value)}
                  />
                ))}
              </div>
            </div>
          )}

          {doc.copies > 1 && (
            <div className="form-group">
              <span className="form-label">{t('اسم كل نسخة')}</span>
              <div className="designer-inline-inputs">
                {Array.from({ length: Math.min(3, doc.copies) }, (_, i) => (
                  <input
                    key={i}
                    className="input"
                    aria-label={t('اسم النسخة {n}', { n: i + 1 })}
                    placeholder={t(meta.copyLabels[i] || 'نسخة')}
                    value={doc.copyLabels?.[i] || ''}
                    onChange={(e) => setListItem('copyLabels', i, e.target.value)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <span className="form-label">{t('ما يظهر في المستند')}</span>
            <div className="designer-checks">
              {Object.keys(doc.fields).map((field) => (
                <label key={field} className="designer-check">
                  <input
                    type="checkbox"
                    checked={doc.fields[field]}
                    onChange={(e) => setDoc({ fields: { ...doc.fields, [field]: e.target.checked } })}
                  />
                  {t(FIELD_LABELS[field])}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="pd-doc-note">{t('ملاحظة أسفل هذا المستند')}</label>
            <textarea
              id="pd-doc-note"
              rows={2}
              value={doc.note}
              placeholder={t('مثال: الرسوم المدفوعة غير قابلة للاسترداد بعد الجلسة الثانية.')}
              onChange={(e) => setDoc({ note: e.target.value })}
            />
          </div>
        </section>

        {/* Footer */}
        <section className="card designer-card">
          <h3 className="card-title">{t('التذييل والعملة')}</h3>
          <div className="form-group">
            <label htmlFor="pd-footer">{t('رسالة التذييل')}</label>
            <input
              id="pd-footer"
              value={draft.text.footer}
              placeholder={t('مثال: شكراً لثقتكم بنا')}
              onChange={(e) => setText({ footer: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="pd-terms">{t('الشروط والأحكام')}</label>
            <textarea id="pd-terms" rows={3} value={draft.text.terms} onChange={(e) => setText({ terms: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pd-cur-ar">{t('اسم العملة كتابةً (عربي)')}</label>
              <input id="pd-cur-ar" value={draft.text.currencyWordsAr} onChange={(e) => setText({ currencyWordsAr: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="pd-cur-en">{t('اسم العملة كتابةً (إنجليزي)')}</label>
              <input
                id="pd-cur-en"
                className="ltr"
                value={draft.text.currencyWordsEn}
                onChange={(e) => setText({ currencyWordsEn: e.target.value })}
              />
            </div>
          </div>
        </section>

        <div className="designer-savebar">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? t('جاري الحفظ…') : t('حفظ الإعدادات')}
          </button>
          {dirty && <span className="designer-dirty">{t('لديك تغييرات غير محفوظة')}</span>}
          <button type="button" className="btn btn-ghost btn-sm designer-reset" onClick={handleResetAll}>
            <RefreshIcon size={16} />
            {t('استعادة التصميم الافتراضي')}
          </button>
        </div>
      </div>

      <aside className="card card-flush designer-preview" aria-label={t('معاينة مباشرة')}>
        <div className="designer-preview-bar">
          <strong>{t('معاينة مباشرة')}</strong>
          <div className="designer-preview-paper">
            <label className="sr-only" htmlFor="pd-preview-paper">
              {t('ورق المعاينة')}
            </label>
            <PaperSelect id="pd-preview-paper" value={previewPaper || doc.paper} onChange={setPreviewPaper} />
          </div>
        </div>
        {(previewPaper || doc.paper) === 'custom' && (
          <div className="designer-preview-custom">
            <CustomSizeFields
              idPrefix="pd-preview-custom"
              width={previewCustom.customWidth}
              height={previewCustom.customHeight}
              onChange={(patch) => setPreviewCustom((p) => ({ ...p, ...patch }))}
            />
          </div>
        )}
        {metrics && metrics.fit < 1 && (
          <div className={`designer-preview-note ${metrics.overflow ? 'is-danger' : ''}`}>
            {metrics.overflow
              ? t('المحتوى أطول من الصفحة: اختر ورقاً أكبر أو قلّل حجم النص')
              : t('صُغّر النص إلى {n}% ليتسع في الصفحة', { n: Math.round(metrics.fit * 100) })}
          </div>
        )}
        <PrintPreview
          type={docType}
          data={sample}
          settings={draft}
          options={previewOptions}
          className="designer-frame"
          title={t('معاينة مباشرة')}
          onMetrics={setMetrics}
        />
      </aside>
    </div>
  );
}
