import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import EmptyState from '../components/EmptyState';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { siteChatsApi } from '../api/client';
import { useSiteChatStats } from '../hooks/useSiteChatStats';
import { canAccessPath } from '../utils/navAccess';
import { formatDate, formatDateTime, formatRelativeTime, formatTime, initials } from '../utils/formatters';
import {
  DEFAULT_LIVE_MINUTES,
  answerRows,
  channelLabel,
  channelOptions,
  isLive,
  leadFieldRows,
  visitorName,
  whatsappLink,
} from '../utils/siteChats';
import {
  AlertIcon,
  ArrowBackIcon,
  BotIcon,
  ChatIcon,
  CopyIcon,
  ExternalIcon,
  PhoneIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
  UsersIcon,
} from '../components/icons';
import './SiteChats.css';

const FILTERS = [
  { id: 'all', label: 'الكل' },
  { id: 'live', label: 'يتحدثون الآن' },
  { id: 'contact', label: 'تركوا بيانات التواصل' },
  { id: 'anonymous', label: 'بدون بيانات تواصل' },
];
const FILTER_IDS = FILTERS.map((f) => f.id);
const PAGE_SIZE = 30;

function byActivity(a, b) {
  const diff = new Date(b.lastActivityAt) - new Date(a.lastActivityAt);
  return diff || (a.id < b.id ? 1 : -1);
}

function sameDay(a, b) {
  return a && b && new Date(a).toDateString() === new Date(b).toDateString();
}

export default function SiteChats() {
  const { t, tr, td } = useI18n();
  const toast = useToast();
  const { hasPrivilege } = useApp();
  const isAdmin = hasPrivilege('admin');
  const canOpenCrm = canAccessPath('/crm', hasPrivilege);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  const filter = FILTER_IDS.includes(searchParams.get('filter')) ? searchParams.get('filter') : 'all';
  const channel = searchParams.get('channel') || '';

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [flashIds, setFlashIds] = useState(() => new Set());

  const listRequest = useRef(0);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const filtersRef = useRef({ filter, channel, query });
  filtersRef.current = { filter, channel, query };
  const transcriptRef = useRef(null);
  const detailTimer = useRef(null);

  const setParam = useCallback(
    (key, value) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // "Talking now" expires with time even when nothing new arrives.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const loadList = useCallback(
    async ({ append = false, before = null } = {}) => {
      const request = ++listRequest.current;
      if (append) setLoadingMore(true);
      else setListLoading(true);
      try {
        const res = await siteChatsApi.list({
          filter: filter === 'all' ? undefined : filter,
          channel: channel || undefined,
          q: query || undefined,
          before: append ? before : undefined,
          limit: PAGE_SIZE,
        });
        if (request !== listRequest.current) return;
        setItems((prev) => (append ? [...prev, ...res.items.filter((i) => !prev.some((p) => p.id === i.id))] : res.items));
        setNextBefore(res.nextBefore);
      } catch (err) {
        if (request === listRequest.current) toast.error(td(err.message));
      } finally {
        if (request === listRequest.current) {
          setListLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filter, channel, query, toast, td]
  );

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    async (id, { quiet = false } = {}) => {
      if (!id) {
        setDetail(null);
        return;
      }
      if (!quiet) setDetailLoading(true);
      try {
        const data = await siteChatsApi.get(id);
        if (selectedRef.current === id) setDetail(data);
      } catch (err) {
        if (selectedRef.current !== id) return;
        toast.error(td(err.message));
        setDetail(null);
        setParam('id', null);
      } finally {
        if (!quiet) setDetailLoading(false);
      }
    },
    [toast, td, setParam]
  );

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => () => window.clearTimeout(detailTimer.current), []);

  const { stats } = useSiteChatStats({
    onUpdate: (payload) => {
      const conv = payload?.conversation;
      if (!conv) return;
      const f = filtersRef.current;
      const matches =
        (!f.channel || conv.channel === f.channel) &&
        (f.filter !== 'contact' || Boolean(conv.visitorContact)) &&
        (f.filter !== 'anonymous' || !conv.visitorContact);
      setItems((prev) => {
        const exists = prev.some((i) => i.id === conv.id);
        // A search result list is only refreshed in place: the server decides what matches a search.
        if (!matches || (!exists && f.query)) return exists ? prev.filter((i) => i.id !== conv.id) : prev;
        const next = exists ? prev.map((i) => (i.id === conv.id ? conv : i)) : [conv, ...prev];
        return next.sort(byActivity);
      });
      if (payload.isNew) {
        setFlashIds((prev) => new Set(prev).add(conv.id));
        window.setTimeout(() => {
          setFlashIds((prev) => {
            const next = new Set(prev);
            next.delete(conv.id);
            return next;
          });
        }, 4000);
      }
      if (conv.id === selectedRef.current) {
        window.clearTimeout(detailTimer.current);
        detailTimer.current = window.setTimeout(() => loadDetail(conv.id, { quiet: true }), 400);
      }
    },
  });
  const liveMinutes = stats?.liveWindowMinutes ?? DEFAULT_LIVE_MINUTES;

  // Keep the newest message in view while the visitor is talking, unless staff scrolled up to read.
  const messageCount = detail?.messages?.length ?? 0;
  const lastDetailId = useRef(null);
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el || !detail) return;
    const switched = lastDetailId.current !== detail.id;
    lastDetailId.current = detail.id;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (switched || nearBottom) el.scrollTop = el.scrollHeight;
  }, [detail, messageCount]);

  const visibleItems = useMemo(
    () => (filter === 'live' ? items.filter((i) => isLive(i.lastActivityAt, liveMinutes, now)) : items),
    [items, filter, now, liveMinutes]
  );

  const selectConversation = (id) => setParam('id', id);

  const copyContact = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('تم النسخ'));
    } catch {
      toast.error(t('تعذّر النسخ'));
    }
  };

  const connection = stats?.connection;
  const detailLive = detail ? isLive(detail.lastActivityAt, liveMinutes, now) : false;
  const answers = answerRows(detail?.answers);
  const leadFields = leadFieldRows(detail?.leadSnapshot);
  const agentSummary = detail?.leadSnapshot?.fields?.agent_summary;
  const recommendation = detail?.recommendation;
  const waLink = whatsappLink(detail?.visitorContact);

  const renderConnectionNotice = () => {
    if (!stats || !connection) return null;
    if (!connection.enabled) {
      return (
        <div className="callout sc-callout">
          <BotIcon />
          <div className="sc-callout-text">
            <strong>{t('الربط مع الموقع غير مفعّل بعد')}</strong>
            <span>
              {isAdmin
                ? t('فعّله من الإعدادات لتصل محادثات زوار algoquant.vip إلى هنا مباشرة.')
                : t('ستظهر هنا محادثات زوار algoquant.vip بعد أن يفعّل المدير الربط.')}
            </span>
          </div>
          {isAdmin && (
            <Link to="/settings?section=siteChat" className="btn btn-secondary btn-sm">
              <SettingsIcon size={16} />
              {t('إعدادات الربط')}
            </Link>
          )}
        </div>
      );
    }
    if (connection.failing) {
      return (
        <div className="callout warning sc-callout">
          <AlertIcon />
          <div className="sc-callout-text">
            <strong>{t('تعذّر الوصول إلى الموقع في آخر محاولة')}</strong>
            <span>
              {connection.lastContactAt
                ? t('آخر اتصال ناجح {when}. قد تتأخر المحادثات الجديدة.', { when: formatRelativeTime(connection.lastContactAt) })
                : t('لم ينجح أي اتصال بعد. قد تتأخر المحادثات الجديدة.')}
            </span>
          </div>
          {isAdmin && (
            <Link to="/settings?section=siteChat" className="btn btn-secondary btn-sm">
              <SettingsIcon size={16} />
              {t('إعدادات الربط')}
            </Link>
          )}
        </div>
      );
    }
    return null;
  };

  const renderList = () => {
    if (listLoading && !items.length) {
      return (
        <ul className="sc-list-items" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="sc-item-skeleton">
              <span className="skeleton sc-skeleton-avatar" />
              <span className="sc-skeleton-lines">
                <span className="skeleton sc-skeleton-line-lg" />
                <span className="skeleton sc-skeleton-line-sm" />
              </span>
            </li>
          ))}
        </ul>
      );
    }
    if (!visibleItems.length) {
      const nothingYet = filter === 'all' && !channel && !query;
      return (
        <EmptyState
          className="sc-list-empty"
          icon={<BotIcon />}
          title={nothingYet ? t('لا توجد محادثات من الموقع بعد') : t('لا توجد محادثات مطابقة')}
          hint={
            nothingYet
              ? t('عندما يبدأ زائر الحديث مع البوت على algoquant.vip يظهر هنا فوراً.')
              : filter === 'live'
                ? t('لا أحد يتحدث مع البوت الآن.')
                : t('جرّب فلتراً آخر أو امسح البحث.')
          }
        />
      );
    }
    return (
      <>
        <ul className="sc-list-items">
          {visibleItems.map((item) => {
            const live = isLive(item.lastActivityAt, liveMinutes, now);
            const active = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`sc-item ${active ? 'active' : ''} ${flashIds.has(item.id) ? 'is-new' : ''}`}
                  onClick={() => selectConversation(item.id)}
                  aria-current={active ? 'true' : undefined}
                >
                  <span className={`sc-avatar ${item.visitorName ? '' : 'is-anon'}`} aria-hidden="true">
                    {item.visitorName ? initials(item.visitorName) : <UsersIcon size={18} />}
                    {live && <span className="sc-avatar-live" />}
                  </span>
                  <span className="sc-item-body">
                    <span className="sc-item-row">
                      <span className="sc-item-name">{visitorName(item)}</span>
                      <span className={`sc-item-time ${live ? 'is-live' : ''}`}>
                        {live ? t('نشط الآن') : formatRelativeTime(item.lastActivityAt)}
                      </span>
                    </span>
                    <span className="sc-item-preview">
                      {item.preview ||
                        (item.answeredCount
                          ? t('أجاب عن {n} من 6 أسئلة', { n: item.answeredCount })
                          : t('بدأ المحادثة'))}
                    </span>
                    <span className="sc-item-tags">
                      <span className="sc-tag">{channelLabel(item.channel)}</span>
                      {item.visitorContact && (
                        <span className="sc-tag tone-success">
                          <PhoneIcon size={12} />
                          {t('ترك رقمه')}
                        </span>
                      )}
                      {item.userMessageCount > 0 && (
                        <span className="sc-tag tone-muted tnum">
                          {t('{n} رسائل من الزائر', { n: item.userMessageCount })}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {nextBefore && filter !== 'live' && (
          <div className="sc-more">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loadingMore}
              onClick={() => loadList({ append: true, before: nextBefore })}
            >
              {loadingMore ? <span className="spinner" /> : null}
              {t('عرض محادثات أقدم')}
            </button>
          </div>
        )}
      </>
    );
  };

  const renderTranscript = () => {
    const messages = detail?.messages ?? [];
    if (!messages.length) {
      return (
        <p className="sc-transcript-empty">
          {answers.length
            ? t('هذا الزائر استخدم أسئلة المصعد فقط ولم يكتب رسائل.')
            : t('لا توجد رسائل في هذه المحادثة بعد.')}
        </p>
      );
    }
    return messages.map((msg, index) => {
      const prev = messages[index - 1];
      const showDay = msg.at && (!prev?.at || !sameDay(prev.at, msg.at));
      const fromVisitor = msg.role === 'user';
      return (
        <div key={index} className="sc-msg-group">
          {showDay && <div className="sc-day">{formatDate(msg.at)}</div>}
          <div className={`sc-msg ${fromVisitor ? 'from-visitor' : 'from-bot'}`}>
            <span className="sc-msg-who">
              {fromVisitor ? visitorName(detail) : t('البوت')}
              {msg.at && <span className="sc-msg-time">{formatTime(msg.at)}</span>}
            </span>
            <p className="sc-msg-body">{msg.content}</p>
          </div>
        </div>
      );
    });
  };

  const renderDetail = () => {
    if (!selectedId) {
      return (
        <div className="sc-detail-empty">
          <EmptyState
            icon={<ChatIcon />}
            title={t('اختر محادثة لعرضها')}
            hint={t('ترى هنا كل ما كتبه الزائر وما أجابه البوت، وبيانات التواصل إن تركها.')}
          />
        </div>
      );
    }
    if (detailLoading && !detail) {
      return (
        <div className="sc-detail-empty">
          <span className="spinner" />
        </div>
      );
    }
    if (!detail) return null;

    return (
      <>
        <header className="sc-detail-head">
          <button
            type="button"
            className="btn btn-icon sc-back"
            onClick={() => selectConversation(null)}
            aria-label={t('رجوع إلى القائمة')}
          >
            <ArrowBackIcon />
          </button>
          <span className={`sc-avatar sc-avatar-lg ${detail.visitorName ? '' : 'is-anon'}`} aria-hidden="true">
            {detail.visitorName ? initials(detail.visitorName) : <UsersIcon size={20} />}
            {detailLive && <span className="sc-avatar-live" />}
          </span>
          <div className="sc-detail-heading">
            <h2>{visitorName(detail)}</h2>
            <div className="sc-detail-meta">
              {detailLive ? (
                <span className="badge tone-success">{t('يتحدث الآن')}</span>
              ) : (
                <span className="sc-meta-text">
                  {t('آخر نشاط {when}', { when: formatRelativeTime(detail.lastActivityAt) })}
                </span>
              )}
              <span className="badge plain tone-brand">{channelLabel(detail.channel)}</span>
              {detail.siteStatus === 'completed' && (
                <span className="badge plain tone-neutral">{t('أكمل أسئلة البوت')}</span>
              )}
              <span className="sc-meta-text">{detail.lang === 'en' ? t('بالإنجليزية') : t('بالعربية')}</span>
            </div>
          </div>
        </header>

        <div className="sc-detail-scroll" ref={transcriptRef}>
          <div className="sc-cards">
            <section className="sc-card">
              <h3 className="sc-card-title">{t('التواصل')}</h3>
              {detail.visitorContact ? (
                <>
                  <div className="sc-contact">
                    <PhoneIcon size={16} />
                    <span className="ltr sc-contact-value">{detail.visitorContact}</span>
                    <button
                      type="button"
                      className="btn btn-icon btn-sm"
                      onClick={() => copyContact(detail.visitorContact)}
                      aria-label={t('نسخ')}
                      title={t('نسخ')}
                    >
                      <CopyIcon size={16} />
                    </button>
                  </div>
                  {detail.contactMethod && (
                    <p className="sc-card-line">
                      {t('يفضّل التواصل عبر: {method}', { method: detail.contactMethod })}
                    </p>
                  )}
                  {waLink && (
                    <a className="btn btn-soft btn-sm sc-wa" href={waLink} target="_blank" rel="noopener noreferrer">
                      <ExternalIcon size={16} />
                      {t('مراسلة على واتساب')}
                    </a>
                  )}
                </>
              ) : (
                <p className="sc-card-line muted-text">{t('لم يترك بيانات تواصل بعد.')}</p>
              )}
              {detail.visitorNote && <p className="sc-card-note">{detail.visitorNote}</p>}
              {detail.lead && (
                <div className="sc-lead">
                  {canOpenCrm ? (
                    <Link to={`/crm/${detail.lead.id}`} className="sc-lead-link">
                      <UsersIcon size={16} />
                      {t('بطاقة العميل المحتمل')}
                    </Link>
                  ) : (
                    <span className="sc-lead-link is-static">
                      <UsersIcon size={16} />
                      {t('مسجّل في العملاء المحتملين')}
                    </span>
                  )}
                  <StatusBadge kind="lead" value={detail.lead.status} />
                  {detail.lead.assignedEmployee && (
                    <span className="sc-meta-text">
                      {t('يتابعه {name}', { name: detail.lead.assignedEmployee.fullName })}
                    </span>
                  )}
                </div>
              )}
            </section>

            <section className="sc-card">
              <h3 className="sc-card-title">{t('عن الجلسة')}</h3>
              <dl className="sc-defs">
                <div>
                  <dt>{t('بدأت')}</dt>
                  <dd>{formatDateTime(detail.startedAt)}</dd>
                </div>
                <div>
                  <dt>{t('آخر نشاط')}</dt>
                  <dd>{formatDateTime(detail.lastActivityAt)}</dd>
                </div>
                {detail.page && (
                  <div>
                    <dt>{t('الصفحة')}</dt>
                    <dd className="ltr">{detail.page}</dd>
                  </div>
                )}
              </dl>
            </section>

            {(recommendation || answers.length > 0) && (
              <section className="sc-card">
                <h3 className="sc-card-title">{t('أسئلة المصعد والتوصية')}</h3>
                {recommendation && (
                  <p className="sc-reco">
                    <SparkIcon size={16} />
                    <span>
                      {recommendation.title ||
                        (recommendation.floor !== undefined
                          ? t('الطابق {n}', { n: recommendation.floor })
                          : '')}
                      {recommendation.secondary_floor !== undefined && (
                        <span className="sc-meta-text">
                          {' · '}
                          {t('بديل: الطابق {n}', { n: recommendation.secondary_floor })}
                        </span>
                      )}
                    </span>
                  </p>
                )}
                {recommendation?.reason && <p className="sc-card-line">{recommendation.reason}</p>}
                {answers.length > 0 && (
                  <dl className="sc-defs">
                    {answers.map((row) => (
                      <div key={row.key}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            )}

            {(agentSummary || leadFields.length > 0) && (
              <section className="sc-card sc-card-wide">
                <h3 className="sc-card-title">{t('ما جمعه البوت')}</h3>
                {agentSummary && <p className="sc-summary">{agentSummary}</p>}
                {leadFields.length > 0 && (
                  <dl className="sc-defs sc-defs-grid">
                    {leadFields.map((row) => (
                      <div key={row.key}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            )}
          </div>

          <h3 className="sc-transcript-title">
            {tr('المحادثة ({n})', { n: <span className="tnum">{detail.messages.length}</span> })}
          </h3>
          <div className="sc-transcript" aria-live="polite">
            {renderTranscript()}
            {detailLive && (
              <p className="sc-live-note">
                <span className="sc-live-dot" aria-hidden="true" />
                {t('الزائر ما زال في المحادثة — الرسائل الجديدة تظهر تلقائياً.')}
              </p>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <AppShell contentClassName="page-content-site-chats">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('محادثات الموقع')}</h1>
          <p className="page-subtitle">
            {t('كل زائر يتحدث مع بوت algoquant.vip يظهر هنا مباشرة، مع ما كتبه وبيانات تواصله إن تركها.')}
          </p>
        </div>
        {connection?.enabled && !connection.failing && connection.lastContactAt && (
          <div className="page-header-actions">
            <span className="sc-connection" title={formatDateTime(connection.lastContactAt)}>
              <span className="sc-live-dot" aria-hidden="true" />
              {t('متصل بالموقع · آخر مزامنة {when}', { when: formatRelativeTime(connection.lastContactAt) })}
            </span>
          </div>
        )}
      </div>

      {renderConnectionNotice()}

      <div className="sc-stats">
        <StatCard
          value={stats?.live ?? '—'}
          label={t('يتحدثون الآن')}
          icon={<span className={`sc-live-dot ${stats?.live ? '' : 'is-idle'}`} aria-hidden="true" />}
          variant={stats?.live ? 'success' : undefined}
          hint={t('خلال آخر {n} دقائق', { n: stats?.liveWindowMinutes ?? DEFAULT_LIVE_MINUTES })}
          onClick={() => setParam('filter', 'live')}
        />
        <StatCard value={stats?.today ?? '—'} label={t('محادثات اليوم')} icon={<ChatIcon />} />
        <StatCard
          value={stats?.contactToday ?? '—'}
          label={t('تركوا بيانات التواصل اليوم')}
          icon={<PhoneIcon />}
          onClick={() => setParam('filter', 'contact')}
        />
        <StatCard
          value={stats?.total ?? '—'}
          label={t('كل المحادثات')}
          icon={<BotIcon />}
          onClick={() => setParam('filter', null)}
        />
      </div>

      <div className={`sc-shell ${selectedId ? 'show-detail' : ''}`}>
        <aside className="sc-list" aria-label={t('قائمة المحادثات')}>
          <div className="sc-list-head">
            <div className="sc-search">
              <SearchIcon size={18} />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('ابحث بالاسم أو الرقم أو نص الرسالة…')}
                aria-label={t('بحث في المحادثات')}
              />
            </div>
            <div className="filter-chips sc-filters" role="group" aria-label={t('تصفية المحادثات')}>
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`chip ${filter === f.id ? 'active' : ''}`}
                  aria-pressed={filter === f.id}
                  onClick={() => setParam('filter', f.id === 'all' ? null : f.id)}
                >
                  {t(f.label)}
                  {f.id === 'live' && stats?.live > 0 && <span className="sc-chip-count tnum">{stats.live}</span>}
                </button>
              ))}
            </div>
            <select
              className="select sc-channel"
              value={channel}
              onChange={(e) => setParam('channel', e.target.value || null)}
              aria-label={t('البوت')}
            >
              <option value="">{t('كل البوتات')}</option>
              {channelOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sc-list-scroll">{renderList()}</div>
        </aside>

        <section className="sc-detail" aria-label={t('تفاصيل المحادثة')}>
          {renderDetail()}
        </section>
      </div>
    </AppShell>
  );
}
