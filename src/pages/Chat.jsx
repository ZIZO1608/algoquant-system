import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';
import { useI18n } from '../i18n';
import { conversationsApi, employeesApi, filesApi } from '../api/client';
import { CHAT_LOCAL_READ_EVENT } from '../components/ChatTopbarButton';
import { formatDate, formatRelativeTime, formatTime, initials } from '../utils/formatters';
import { privilegeLabel } from '../utils/statusMaps';
import {
  ArrowBackIcon,
  BookIcon,
  ChatIcon,
  ImageIcon,
  PaperclipIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  UsersIcon,
  XIcon,
} from '../components/icons';
import './Chat.css';

function notifyLocalChatRead(conversationId) {
  if (!conversationId) return;
  window.dispatchEvent(new CustomEvent(CHAT_LOCAL_READ_EVENT, { detail: { conversationId } }));
}

function getConversationTitle(conv, myId, t, td) {
  if (conv.type === 'dm') {
    const other = conv.members?.find((m) => m.employeeId !== myId)?.employee;
    return other?.fullName ?? t('محادثة');
  }
  // The team conversation's title is seeded by the backend; course channels are titled with the course name as entered.
  const title = conv.type === 'team' ? td(conv.title) : conv.title;
  return title || conv.course?.name || t('محادثة');
}

function getConversationTypeLabel(conv, t) {
  if (conv.type === 'dm') return t('خاص');
  if (conv.type === 'team') return t('الفريق');
  if (conv.type === 'course_channel') return t('دورة');
  return t('محادثة');
}

function isConversationUnread(conv, myId) {
  const lastMsg = conv.messages?.[0];
  if (!lastMsg || lastMsg.senderId === myId) return false;
  const myMember = conv.members?.find((m) => m.employeeId === myId);
  if (!myMember?.lastReadAt) return true;
  return new Date(lastMsg.createdAt) > new Date(myMember.lastReadAt);
}

function normalizeChatMessage(payload) {
  if (payload?.conversationId && payload?.message) {
    return { conversationId: payload.conversationId, message: payload.message };
  }
  if (payload?.id && payload?.conversationId) {
    return { conversationId: payload.conversationId, message: payload };
  }
  return null;
}

function sortConversations(conversations) {
  return [...conversations].sort((a, b) => {
    const aTime = a.messages?.[0]?.createdAt ?? a.createdAt;
    const bTime = b.messages?.[0]?.createdAt ?? b.createdAt;
    return new Date(bTime) - new Date(aTime);
  });
}

/** "Name (role، role)". Arabic keeps the stored privilege label; English uses the label for the privilege code. */
function formatReaderLabel(member, { t, td, lang }) {
  const name = member.employee?.fullName ?? '—';
  const roles = (member.employee?.privileges ?? [])
    .map((p) =>
      lang === 'ar'
        ? p.privilege?.labelAr || privilegeLabel(p.privilege?.code)
        : privilegeLabel(p.privilege?.code) || td(p.privilege?.labelAr)
    )
    .filter(Boolean);
  if (!roles.length) return name;
  return `${name} (${roles.join(t('، '))})`;
}

function getMessageReaders(message, members, myId) {
  if (!members?.length || message.senderId !== myId) return [];
  const msgTime = new Date(message.createdAt).getTime();
  return members.filter((m) => {
    if (m.employeeId === myId) return false;
    if (!m.lastReadAt) return false;
    return new Date(m.lastReadAt).getTime() >= msgTime;
  });
}

function formatReadReceipt(readers, i18n) {
  const { t } = i18n;
  if (!readers.length) return t('لم يُشاهد بعد');
  if (readers.length === 1) return t('شوهد من {name}', { name: formatReaderLabel(readers[0], i18n) });
  return t('شوهد من: {names}', { names: readers.map((member) => formatReaderLabel(member, i18n)).join(' · ') });
}

function sameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function ConvAvatar({ conv, title, size = 'md' }) {
  if (conv?.type === 'team') {
    return (
      <span className={`chat-avatar chat-avatar-${size} chat-avatar-team`} aria-hidden="true">
        <UsersIcon size={size === 'sm' ? 14 : 18} />
      </span>
    );
  }
  if (conv?.type === 'course_channel') {
    return (
      <span className={`chat-avatar chat-avatar-${size} chat-avatar-course`} aria-hidden="true">
        <BookIcon size={size === 'sm' ? 14 : 18} />
      </span>
    );
  }
  return (
    <span className={`chat-avatar chat-avatar-${size} chat-avatar-dm`} aria-hidden="true">
      {initials(title)}
    </span>
  );
}

function AttachmentImage({ att }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!att.fileObjectId) {
      setFailed(true);
      return undefined;
    }
    filesApi
      .getUrl(att.fileObjectId)
      .then((r) => {
        if (!cancelled) setUrl(r?.url || null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [att.fileObjectId]);

  const name = att.storageKey?.split('/').pop() || t('صورة');
  if (failed || !url) {
    return (
      <span className="chat-attachment-file">
        <ImageIcon size={14} />
        {failed ? name : t('جاري تحميل الصورة…')}
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="chat-attachment-image" title={name}>
      <img src={url} alt={name} loading="lazy" />
    </a>
  );
}

export default function Chat() {
  const { user } = useApp();
  const { socket } = useSocket();
  const toast = useToast();
  const i18n = useI18n();
  const { t, td } = i18n;
  const [searchParams, setSearchParams] = useSearchParams();
  const myId = user?.id;

  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [dmModalOpen, setDmModalOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [listQuery, setListQuery] = useState('');
  // Holds an API message or Arabic source text; translated when shown.
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const pendingOpenRef = useRef(null);
  const selectedIdRef = useRef(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const [list, team] = await Promise.all([conversationsApi.list(), conversationsApi.team()]);
      const ids = new Set(list.map((c) => c.id));
      const merged = ids.has(team.id) ? list : [team, ...list];
      setConversations(sortConversations(merged));
    } catch (err) {
      setConversations([]);
      setError(err.message || 'تعذّر تحميل المحادثات');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const markConversationReadLocal = useCallback(
    (conversationId, lastReadAt = new Date().toISOString()) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          return { ...c, members: c.members.map((m) => (m.employeeId === myId ? { ...m, lastReadAt } : m)) };
        })
      );
    },
    [myId]
  );

  const updateMemberReadAt = useCallback((conversationId, employeeId, lastReadAt) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== conversationId) return c;
        return { ...c, members: c.members.map((m) => (m.employeeId === employeeId ? { ...m, lastReadAt } : m)) };
      })
    );
  }, []);

  const openConversation = useCallback(
    async (conversationId) => {
      pendingOpenRef.current = conversationId;
      setSelectedId(conversationId);
      setMobileShowThread(true);
      setSearchParams({ c: conversationId }, { replace: true });
      setDraft('');
      setPendingAttachments([]);
      setLoadingMessages(true);
      setMessages([]);

      if (socket) socket.emit('join:conversation', conversationId);

      try {
        const readResult = await conversationsApi.markRead(conversationId);
        if (pendingOpenRef.current === conversationId) {
          const readAt = readResult?.lastReadAt ?? new Date().toISOString();
          markConversationReadLocal(conversationId, readAt);
          notifyLocalChatRead(conversationId);
          socket?.emit('chat:read', conversationId);
        }
      } catch {
        // soft-fail
      }

      try {
        const msgs = await conversationsApi.getMessages(conversationId);
        if (pendingOpenRef.current !== conversationId) return;
        setMessages(msgs ?? []);
        setError('');
      } catch (err) {
        if (pendingOpenRef.current === conversationId) {
          setMessages([]);
          setError(err.message || 'تعذّر تحميل الرسائل');
        }
      } finally {
        if (pendingOpenRef.current === conversationId) {
          setLoadingMessages(false);
          pendingOpenRef.current = null;
        }
      }
    },
    [socket, markConversationReadLocal, setSearchParams]
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const paramId = searchParams.get('c');
    if (!paramId) return;
    if (paramId === selectedIdRef.current) return;
    if (pendingOpenRef.current && pendingOpenRef.current !== paramId) return;
    if (!conversations.some((c) => c.id === paramId)) return;
    openConversation(paramId);
  }, [searchParams, conversations, openConversation]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = (payload) => {
      const normalized = normalizeChatMessage(payload);
      if (!normalized) return;
      const { conversationId, message } = normalized;
      setConversations((prev) => sortConversations(prev.map((c) => (c.id !== conversationId ? c : { ...c, messages: [message] }))));
      setSelectedId((currentId) => {
        if (currentId === conversationId) {
          setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
          if (message.senderId !== myId) {
            conversationsApi
              .markRead(conversationId)
              .then((res) => {
                const readAt = res?.lastReadAt ?? new Date().toISOString();
                markConversationReadLocal(conversationId, readAt);
                notifyLocalChatRead(conversationId);
                socket?.emit('chat:read', conversationId);
              })
              .catch(() => {});
          }
        }
        return currentId;
      });
    };
    const onRead = ({ conversationId, employeeId, lastReadAt }) => {
      if (!conversationId || !employeeId || !lastReadAt) return;
      updateMemberReadAt(conversationId, employeeId, lastReadAt);
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:read', onRead);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:read', onRead);
    };
  }, [socket, updateMemberReadAt, markConversationReadLocal, myId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const filteredConversations = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      const title = getConversationTitle(conv, myId, t, td).toLowerCase();
      const preview = (conv.messages?.[0]?.body || '').toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [conversations, listQuery, myId, t, td]);

  const unreadTotal = useMemo(() => conversations.filter((c) => isConversationUnread(c, myId)).length, [conversations, myId]);

  const selectedConv = conversations.find((c) => c.id === selectedId);
  const selectedTitle = selectedConv ? getConversationTitle(selectedConv, myId, t, td) : '';
  const isGroup = selectedConv && selectedConv.type !== 'dm';

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.fullName?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q));
  }, [employees, employeeQuery]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedId || sending) return;
    const text = draft.trim();
    if (!text && pendingAttachments.length === 0) return;
    setSending(true);
    setError('');
    try {
      const sent = await conversationsApi.sendMessage(selectedId, text || ' ', pendingAttachments.length ? pendingAttachments : undefined);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setConversations((prev) => sortConversations(prev.map((c) => (c.id === selectedId ? { ...c, messages: [sent] } : c))));
      setDraft('');
      setPendingAttachments([]);
      composerRef.current?.focus();
    } catch (err) {
      toast.error(err.message || t('تعذّر إرسال الرسالة'));
    } finally {
      setSending(false);
    }
  };

  const handleOpenDmModal = async () => {
    setDmModalOpen(true);
    setEmployeeQuery('');
    setLoadingEmployees(true);
    try {
      const list = await employeesApi.list();
      setEmployees(list.filter((e) => e.id !== myId && e.isActive !== false));
    } catch (err) {
      setEmployees([]);
      toast.error(err.message || t('تعذّر تحميل الموظفين'));
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleStartDm = async (employeeId) => {
    try {
      const conv = await conversationsApi.createDm(employeeId);
      setDmModalOpen(false);
      await loadConversations();
      openConversation(conv.id);
    } catch (err) {
      toast.error(err.message || t('تعذّر بدء المحادثة'));
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('image/')) {
      toast.warning(t('يمكن إرفاق الصور فقط في المحادثات حالياً'));
      return;
    }
    setUploading(true);
    try {
      const uploaded = await filesApi.upload(file, 'chat', { entityType: 'conversation', entityId: selectedId });
      setPendingAttachments((prev) => [
        ...prev,
        { storageKey: uploaded.storageKey, mime: uploaded.mime, fileObjectId: uploaded.id, name: file.name },
      ]);
    } catch (err) {
      toast.error(err.message || t('تعذّر رفع الصورة'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell contentClassName="page-content-chat">
      <div className="chat-page">
        <div className={`chat-shell ${mobileShowThread ? 'show-thread' : ''}`}>
          <aside className="chat-sidebar">
            <div className="chat-sidebar-head">
              <div>
                <h1 className="chat-sidebar-title">{t('المحادثات')}</h1>
                <p className="chat-sidebar-sub">
                  {unreadTotal > 0 ? t('{n} غير مقروءة', { n: unreadTotal }) : t('رسائل الفريق والمحادثات الخاصة')}
                </p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenDmModal}>
                <PlusIcon />
                {t('جديدة')}
              </button>
            </div>

            <div className="chat-search-wrap">
              <SearchIcon size={16} />
              <input
                type="search"
                className="chat-search"
                placeholder={t('بحث في المحادثات…')}
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                aria-label={t('بحث في المحادثات')}
              />
            </div>

            <div className="chat-conv-scroll">
              {loadingList ? (
                <ul className="chat-conv-list" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i} className="chat-conv-skeleton">
                      <span className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                      <span className="chat-conv-skeleton-lines">
                        <span className="skeleton" style={{ width: '60%' }} />
                        <span className="skeleton" style={{ width: '85%', height: 10 }} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : filteredConversations.length === 0 ? (
                <div className="chat-empty-state">
                  <EmptyState
                    icon={<ChatIcon />}
                    title={listQuery ? t('لا نتائج للبحث') : t('لا توجد محادثات بعد')}
                    hint={listQuery ? t('جرّب كلمة أخرى.') : t('ابدأ محادثة خاصة مع أحد الزملاء.')}
                    action={
                      !listQuery && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleOpenDmModal}>
                          {t('ابدأ محادثة')}
                        </button>
                      )
                    }
                  />
                </div>
              ) : (
                <ul className="chat-conv-list">
                  {filteredConversations.map((conv) => {
                    const unread = isConversationUnread(conv, myId);
                    const title = getConversationTitle(conv, myId, t, td);
                    const last = conv.messages?.[0];
                    const preview = last?.body?.trim() || (last?.attachments?.length ? t('صورة') : '');
                    const active = selectedId === conv.id;
                    return (
                      <li key={conv.id}>
                        <button
                          type="button"
                          className={`chat-conv-item ${active ? 'active' : ''} ${unread ? 'unread' : ''}`}
                          onClick={() => openConversation(conv.id)}
                          aria-current={active ? 'true' : undefined}
                        >
                          <ConvAvatar conv={conv} title={title} />
                          <span className="chat-conv-body">
                            <span className="chat-conv-row">
                              <span className="chat-conv-name">{title}</span>
                              {last?.createdAt && <span className="chat-conv-time">{formatRelativeTime(last.createdAt)}</span>}
                            </span>
                            <span className="chat-conv-row">
                              <span className="chat-conv-preview">{preview || t('لا توجد رسائل بعد')}</span>
                              <span className="chat-conv-type">{getConversationTypeLabel(conv, t)}</span>
                            </span>
                          </span>
                          {unread && <span className="chat-unread-dot" aria-label={t('غير مقروء')} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <section className="chat-thread" aria-live="polite">
            {!selectedId ? (
              <div className="chat-thread-empty">
                <EmptyState
                  icon={<ChatIcon />}
                  title={t('اختر محادثة للبدء')}
                  hint={t('اختر محادثة من القائمة أو ابدأ محادثة خاصة جديدة مع زميل.')}
                  action={
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenDmModal}>
                      <PlusIcon />
                      {t('محادثة جديدة')}
                    </button>
                  }
                />
              </div>
            ) : (
              <>
                <div className="chat-thread-header">
                  <button type="button" className="btn btn-icon chat-back-btn" onClick={() => setMobileShowThread(false)} aria-label={t('رجوع للقائمة')}>
                    <ArrowBackIcon />
                  </button>
                  <ConvAvatar conv={selectedConv} title={selectedTitle} />
                  <div className="chat-thread-heading">
                    <h2>{selectedTitle || '…'}</h2>
                    <span className="chat-thread-sub">
                      {selectedConv ? getConversationTypeLabel(selectedConv, t) : ''}
                      {selectedConv?.members?.length ? ` · ${t('{n} مشاركون', { n: selectedConv.members.length })}` : ''}
                    </span>
                  </div>
                </div>

                {error && <p className="form-error chat-error">{td(error)}</p>}

                <div className="chat-messages">
                  {loadingMessages ? (
                    <div className="chat-messages-loading">
                      <span className="spinner" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="chat-empty-state soft">
                      <p>{t('لا توجد رسائل بعد، اكتب أول رسالة.')}</p>
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      const isMine = msg.senderId === myId;
                      const senderName = msg.sender?.fullName ?? '—';
                      const readers = isMine ? getMessageReaders(msg, selectedConv?.members, myId) : [];
                      const receipt = isMine ? formatReadReceipt(readers, i18n) : '';
                      const prev = messages[index - 1];
                      const showDate = !prev || !sameDay(prev.createdAt, msg.createdAt);
                      const showSender = !isMine && isGroup && (!prev || prev.senderId !== msg.senderId || showDate);
                      const images = (msg.attachments || []).filter((a) => a.mime?.startsWith('image/'));
                      const files = (msg.attachments || []).filter((a) => !a.mime?.startsWith('image/'));
                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div className="chat-date-sep">
                              <span>{formatDate(msg.createdAt)}</span>
                            </div>
                          )}
                          <div className={`chat-bubble-wrap ${isMine ? 'mine' : 'theirs'}`}>
                            {!isMine && (
                              <span className="chat-bubble-avatar" title={senderName}>
                                <span className="avatar avatar-sm">{initials(senderName)}</span>
                              </span>
                            )}
                            <div className="chat-bubble-stack">
                              {showSender && <span className="chat-bubble-sender">{senderName}</span>}
                              <div className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
                                {msg.body?.trim() && <p className="chat-bubble-body">{msg.body}</p>}
                                {images.length > 0 && (
                                  <div className="chat-attachments-grid">
                                    {images.map((att) => (
                                      <AttachmentImage key={att.id} att={att} />
                                    ))}
                                  </div>
                                )}
                                {files.length > 0 && (
                                  <ul className="chat-attachments">
                                    {files.map((att) => (
                                      <li key={att.id}>
                                        <button
                                          type="button"
                                          className="chat-attachment-file"
                                          disabled={!att.fileObjectId}
                                          onClick={async () => {
                                            try {
                                              const { url } = await filesApi.getUrl(att.fileObjectId);
                                              window.open(url, '_blank', 'noopener,noreferrer');
                                            } catch {
                                              toast.error(t('تعذّر فتح الملف'));
                                            }
                                          }}
                                        >
                                          <PaperclipIcon size={14} />
                                          {att.storageKey?.split('/').pop()}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <span className="chat-bubble-time">{formatTime(msg.createdAt)}</span>
                              </div>
                              {isMine && (
                                <span className={`chat-read-receipt ${readers.length ? 'seen' : 'pending'}`} title={receipt}>
                                  {receipt}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form className="chat-composer" onSubmit={handleSend}>
                  {pendingAttachments.length > 0 && (
                    <div className="chat-pending-attachments">
                      {pendingAttachments.map((att) => (
                        <span key={att.storageKey} className="chat-pending-tag">
                          <ImageIcon size={14} />
                          {att.name}
                          <button
                            type="button"
                            aria-label={t('إزالة')}
                            onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.storageKey !== att.storageKey))}
                          >
                            <XIcon size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="chat-composer-row">
                    <input ref={fileInputRef} type="file" accept="image/*" className="chat-file-input" onChange={handleFileSelect} />
                    <button
                      type="button"
                      className="btn btn-icon chat-attach-btn"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      title={t('إرفاق صورة')}
                      aria-label={t('إرفاق صورة')}
                    >
                      {uploading ? <span className="spinner" /> : <PaperclipIcon />}
                    </button>
                    <input
                      ref={composerRef}
                      type="text"
                      className="chat-input"
                      placeholder={t('اكتب رسالة…')}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={sending}
                      aria-label={t('نص الرسالة')}
                    />
                    <button
                      type="submit"
                      className="chat-send-btn"
                      disabled={sending || (!draft.trim() && pendingAttachments.length === 0)}
                      aria-label={t('إرسال')}
                      title={t('إرسال')}
                    >
                      <SendIcon size={18} />
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      </div>

      <Modal open={dmModalOpen} onClose={() => setDmModalOpen(false)} title={t('محادثة جديدة')} description={t('اختر زميلاً لبدء محادثة خاصة.')}>
        <div className="chat-dm-search">
          <SearchIcon size={16} />
          <input
            type="search"
            className="input"
            placeholder={t('بحث بالاسم أو البريد…')}
            value={employeeQuery}
            onChange={(e) => setEmployeeQuery(e.target.value)}
            aria-label={t('بحث عن موظف')}
          />
        </div>
        {loadingEmployees ? (
          <p className="chat-empty">{t('جاري التحميل…')}</p>
        ) : filteredEmployees.length === 0 ? (
          <p className="chat-empty">{t('لا يوجد موظفون مطابقون')}</p>
        ) : (
          <ul className="chat-dm-list">
            {filteredEmployees.map((emp) => (
              <li key={emp.id}>
                <button type="button" className="chat-dm-item" onClick={() => handleStartDm(emp.id)}>
                  <span className="avatar">{initials(emp.fullName)}</span>
                  <span className="chat-dm-text">
                    <span className="chat-dm-name">{emp.fullName}</span>
                    {emp.privileges?.length > 0 && (
                      <span className="chat-dm-role">{emp.privileges.map((p) => privilegeLabel(p.privilege?.code)).join(' · ')}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </AppShell>
  );
}
