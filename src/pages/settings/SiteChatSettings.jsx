import { useCallback, useEffect, useState } from 'react';
import { useDialog } from '../../components/DialogProvider';
import { useToast } from '../../components/Toast';
import { useI18n } from '../../i18n';
import { settingsApi } from '../../api/client';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import {
  AlertIcon,
  CheckCircleIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshIcon,
  SendIcon,
} from '../../components/icons';
import './SiteChatSettings.css';

/** Settings → Website chats: the connection that brings algoquant.vip bot conversations in. */
export default function SiteChatSettings() {
  const { t, tr, td } = useI18n();
  const toast = useToast();
  const { confirm } = useDialog();
  const [data, setData] = useState(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState('');
  const [testResult, setTestResult] = useState(null);

  const apply = useCallback((next) => {
    setData(next);
    setSiteUrl(next.siteUrl);
  }, []);

  useEffect(() => {
    settingsApi
      .siteChat()
      .then(apply)
      .catch((err) => toast.error(td(err.message)));
  }, [apply, toast, td]);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      return await fn();
    } catch (err) {
      toast.error(td(err.message));
      return null;
    } finally {
      setBusy('');
    }
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('تم النسخ'));
    } catch {
      toast.error(t('تعذّر النسخ'));
    }
  };

  const toggle = () =>
    run('toggle', async () => {
      const next = await settingsApi.updateSiteChat({ enabled: !data.enabled });
      apply(next);
      toast.success(next.enabled ? t('تم تشغيل الربط مع الموقع') : t('تم إيقاف الربط مع الموقع'));
    });

  const saveUrl = (e) => {
    e.preventDefault();
    run('url', async () => {
      apply(await settingsApi.updateSiteChat({ siteUrl }));
      toast.success(t('تم حفظ رابط الموقع'));
    });
  };

  const test = () =>
    run('test', async () => {
      const result = await settingsApi.testSiteChat();
      setTestResult(result);
    });

  const sync = (full) =>
    run(full ? 'full' : 'sync', async () => {
      if (full) {
        const ok = await confirm({
          title: t('إعادة استيراد كل المحادثات؟'),
          message: t('يقرأ النظام كل محادثات الموقع من البداية. المحادثات الموجودة لا تتكرر، ولا تصل إشعارات عن القديمة منها.'),
          confirmLabel: t('إعادة الاستيراد'),
        });
        if (!ok) return;
      }
      const res = await settingsApi.syncSiteChat(full ? { full: true } : {});
      apply(res.settings);
      if (res.ok) toast.success(t('تمت المزامنة — وصلت {n} محادثة محدّثة', { n: res.received }));
      else toast.error(t('تعذّرت المزامنة: {error}', { error: res.error }));
    });

  const rotate = () =>
    run('rotate', async () => {
      const ok = await confirm({
        title: t('تغيير رمز الربط؟'),
        message: t('يتوقف الربط فوراً حتى تضع الرمز الجديد في Lovable باسم ERP_SYNC_TOKEN وتنشر الموقع.'),
        confirmLabel: t('تغيير الرمز'),
        danger: true,
      });
      if (!ok) return;
      apply(await settingsApi.rotateSiteChatToken());
      setShowToken(true);
      toast.success(t('تم إنشاء رمز جديد — انسخه إلى Lovable'));
    });

  if (!data) {
    return (
      <div className="card sc-settings-loading">
        <span className="spinner" />
      </div>
    );
  }

  const failing = Boolean(
    data.lastErrorAt && (!data.lastSuccessAt || new Date(data.lastErrorAt) > new Date(data.lastSuccessAt))
  );
  const status = !data.enabled
    ? { tone: 'muted', label: t('متوقف') }
    : failing
      ? { tone: 'warning', label: t('لا يصل إلى الموقع') }
      : data.lastSuccessAt
        ? { tone: 'success', label: t('متصل') }
        : { tone: 'neutral', label: t('بانتظار أول مزامنة') };
  const feedUrl = `${data.siteUrl}${data.feedPath}`;
  const maskedToken = `${'•'.repeat(24)}${data.token.slice(-4)}`;

  return (
    <div className="sc-settings">
      <div className="card">
        <div className="card-header-row">
          <div className="sc-settings-title">
            <h3 className="card-title">{t('الربط مع موقع algoquant.vip')}</h3>
            <span className={`badge tone-${status.tone}`}>{status.label}</span>
          </div>
          <button
            type="button"
            className={`btn ${data.enabled ? 'btn-secondary' : 'btn-primary'}`}
            onClick={toggle}
            disabled={busy === 'toggle'}
          >
            {data.enabled ? t('إيقاف الربط') : t('تشغيل الربط')}
          </button>
        </div>
        <p className="muted-text sc-settings-lead">
          {t('يسأل النظام الموقع كل {n} ثوانٍ عن المحادثات الجديدة، ويكمل من حيث توقف إذا كان الجهاز مطفأً.', {
            n: data.pollSeconds,
          })}
        </p>

        <dl className="webhook-defs">
          <div className="webhook-def">
            <dt>{t('آخر مزامنة ناجحة')}</dt>
            <dd title={data.lastSuccessAt ? formatDateTime(data.lastSuccessAt) : undefined}>
              {data.lastSuccessAt ? formatRelativeTime(data.lastSuccessAt) : t('لم تتم بعد')}
            </dd>
          </div>
          <div className="webhook-def">
            <dt>{t('المحادثات المحفوظة')}</dt>
            <dd className="tnum">{data.conversations}</dd>
          </div>
          <div className="webhook-def">
            <dt>{t('آخر إرسال فوري من الموقع')}</dt>
            <dd>{data.lastPushAt ? formatRelativeTime(data.lastPushAt) : t('لم يصل بعد (اختياري)')}</dd>
          </div>
          <div className="webhook-def">
            <dt>{t('نقطة القراءة على الموقع')}</dt>
            <dd>
              <code className="ltr">{feedUrl}</code>
            </dd>
          </div>
        </dl>

        {failing && data.lastError && (
          <div className="callout warning sc-settings-callout">
            <AlertIcon />
            <div className="sc-settings-callout-text">
              <strong>
                {t('آخر محاولة فشلت {when}', { when: formatRelativeTime(data.lastErrorAt) })}
              </strong>
              <code className="ltr">{data.lastError}</code>
            </div>
          </div>
        )}

        <form className="sc-settings-row" onSubmit={saveUrl}>
          <div className="form-group sc-settings-grow">
            <label htmlFor="site-chat-url">{t('رابط الموقع')}</label>
            <input
              id="site-chat-url"
              className="input ltr"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://algoquant.vip"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={busy === 'url' || !siteUrl.trim() || siteUrl.trim() === data.siteUrl}
          >
            {t('حفظ')}
          </button>
        </form>

        <div className="form-group">
          <span className="form-label">{t('رمز الربط (ERP_SYNC_TOKEN)')}</span>
          <div className="sc-token">
            <code className="ltr sc-token-value">{showToken ? data.token : maskedToken}</code>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? t('إخفاء') : t('إظهار')}
              title={showToken ? t('إخفاء') : t('إظهار')}
            >
              {showToken ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(data.token)}>
              <CopyIcon size={16} />
              {t('نسخ')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={rotate} disabled={busy === 'rotate'}>
              <RefreshIcon size={16} />
              {t('تغيير الرمز')}
            </button>
          </div>
          <p className="form-hint">
            {t('الرمز نفسه يوضع في Lovable كـ Secret. من يملكه يستطيع إرسال محادثات إلى النظام، فلا تشاركه.')}
          </p>
        </div>

        <div className="sc-settings-actions">
          <button type="button" className="btn btn-secondary" onClick={test} disabled={busy === 'test'}>
            {busy === 'test' ? <span className="spinner" /> : <SendIcon size={16} />}
            {t('اختبار الاتصال')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sync(false)}
            disabled={busy === 'sync' || busy === 'full'}
          >
            {busy === 'sync' ? <span className="spinner" /> : <RefreshIcon size={16} />}
            {t('مزامنة الآن')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => sync(true)}
            disabled={busy === 'sync' || busy === 'full'}
          >
            {t('إعادة استيراد كل المحادثات')}
          </button>
        </div>

        {testResult && (
          <div className={`callout ${testResult.ok ? '' : 'warning'} sc-settings-callout`}>
            {testResult.ok ? <CheckCircleIcon /> : <AlertIcon />}
            <div className="sc-settings-callout-text">
              {testResult.ok ? (
                <strong>
                  {t('الموقع يجيب ({ms} ms) — عنده {n} محادثة', {
                    ms: testResult.latencyMs,
                    n: testResult.conversations ?? 0,
                  })}
                </strong>
              ) : (
                <>
                  <strong>{t('الموقع لم يقبل الاتصال')}</strong>
                  <code className="ltr">{testResult.error}</code>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">{t('خطوات الربط')}</h3>
        <ol className="sc-steps">
          <li>{t('انسخ رمز الربط أعلاه.')}</li>
          <li>
            {tr('في Lovable افتح مشروع AlgoQuant والصق طلب الربط. عندما يطلب قيمة {secret} الصق الرمز.', {
              secret: <code className="ltr">ERP_SYNC_TOKEN</code>,
            })}
          </li>
          <li>{t('بعد أن ينشر Lovable التعديل (Publish) اضغط «اختبار الاتصال».')}</li>
          <li>{t('اضغط «تشغيل الربط». تظهر المحادثات في صفحة «محادثات الموقع» لكل الموظفين.')}</li>
        </ol>
        <p className="muted-text sc-settings-push">
          {tr('إرسال فوري (اختياري): عندما يصبح للنظام عنوان عام على الإنترنت، ضع في إعدادات الموقع {path} بعد ذلك العنوان، فتصل كل رسالة خلال ثانية بدل {n} ثوانٍ.', {
            path: <code className="ltr">{data.pushPath}</code>,
            n: data.pollSeconds,
          })}
        </p>
      </div>
    </div>
  );
}
