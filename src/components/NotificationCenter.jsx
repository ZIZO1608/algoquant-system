import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { useI18n } from '../i18n';
import { formatRelativeTime } from '../utils/formatters';
import { AlertIcon, BellIcon, BotIcon, CheckIcon, CoinsIcon, StarIcon, TasksIcon, UsersIcon } from './icons';
import './NotificationCenter.css';

/** Where a notification takes you. Links carry the tab so you land on the right thing. */
function getNotificationHref(type, payload) {
  switch (type) {
    case 'task_due_soon':
    case 'task_late':
      return payload?.courseId ? `/courses/${payload.courseId}` : '/tasks';
    case 'new_lead':
    case 'lead_assigned':
    case 'lead_stuck':
    case 'lead_follow_up_due':
    case 'new_lead_bot':
      return payload?.leadId ? `/crm/${payload.leadId}` : '/crm';
    case 'withdrawal_requested':
      return payload?.ownerId
        ? `/employee-wallets?tab=requests&wallet=${payload.ownerId}`
        : '/employee-wallets?tab=requests';
    case 'withdrawal_status':
      return '/employee-wallets?tab=mine';
    case 'evaluation_campaign':
      return payload?.courseId ? `/courses/${payload.courseId}?tab=evaluations` : '/courses';
    case 'site_chat_contact':
      return payload?.siteChatId ? `/site-chats?id=${payload.siteChatId}` : '/site-chats';
    default:
      return null;
  }
}

function typeMeta(type) {
  switch (type) {
    case 'task_due_soon':
      return { Icon: TasksIcon, tone: 'warning' };
    case 'task_late':
      return { Icon: AlertIcon, tone: 'danger' };
    case 'new_lead':
    case 'lead_assigned':
      return { Icon: UsersIcon, tone: 'brand' };
    case 'lead_stuck':
    case 'lead_follow_up_due':
      return { Icon: UsersIcon, tone: 'warning' };
    case 'new_lead_bot':
    case 'site_chat_contact':
      return { Icon: BotIcon, tone: 'brand' };
    case 'withdrawal_requested':
    case 'withdrawal_status':
      return { Icon: CoinsIcon, tone: 'success' };
    case 'evaluation_campaign':
      return { Icon: StarIcon, tone: 'brand' };
    default:
      return { Icon: BellIcon, tone: 'neutral' };
  }
}

const isBellNotification = (notification) => notification?.type !== 'chat_message';

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { t, td } = useI18n();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [{ count }, list] = await Promise.all([
        notificationsApi.unreadCount(),
        notificationsApi.list({ unread: true }),
      ]);
      setUnreadCount(count ?? 0);
      setItems((list ?? []).filter(isBellNotification));
    } catch {
      setUnreadCount(0);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!socket) return undefined;
    const onNotification = (notification) => {
      if (!isBellNotification(notification)) return;
      setUnreadCount((c) => c + 1);
      setItems((prev) => (prev.some((n) => n.id === notification.id) ? prev : [notification, ...prev]));
    };
    socket.on('notification', onNotification);
    return () => socket.off('notification', onNotification);
  }, [socket]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleToggle = () => {
    setOpen((v) => !v);
    if (!open) loadNotifications();
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setUnreadCount(0);
      setItems([]);
    } catch {
      // ignore
    }
  };

  const handleItemClick = async (item) => {
    const href = getNotificationHref(item.type, item.payload);
    if (!item.readAt) {
      try {
        await notificationsApi.markRead(item.id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setItems((prev) => prev.filter((n) => n.id !== item.id));
      } catch {
        // ignore
      }
    }
    setOpen(false);
    if (href) navigate(href);
  };

  return (
    <div className="notification-center" ref={panelRef}>
      <button
        type="button"
        className={`topbar-btn ${open ? 'is-active' : ''}`}
        aria-label={unreadCount > 0 ? t('الإشعارات، {count} غير مقروءة', { count: unreadCount }) : t('الإشعارات')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={handleToggle}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="topbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label={t('الإشعارات')}>
          <div className="notif-panel-header">
            <h3 className="notif-panel-title">
              {t('الإشعارات')}
              {unreadCount > 0 && <span className="tab-count">{unreadCount}</span>}
            </h3>
            {unreadCount > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleMarkAllRead}>
                <CheckIcon />
                {t('تعليم الكل كمقروء')}
              </button>
            )}
          </div>
          <ul className="notif-list">
            {loading && items.length === 0 ? (
              <li className="notif-empty">{t('جاري التحميل…')}</li>
            ) : items.length === 0 ? (
              <li className="notif-empty">
                <span className="notif-empty-icon">
                  <BellIcon size={22} />
                </span>
                {t('لا توجد إشعارات جديدة')}
              </li>
            ) : (
              items.map((item) => {
                const { Icon, tone } = typeMeta(item.type);
                return (
                  <li key={item.id}>
                    <button type="button" className="notif-item" onClick={() => handleItemClick(item)}>
                      <span className={`notif-item-icon tone-${tone}`}>
                        <Icon size={16} />
                      </span>
                      <span className="notif-item-text">
                        {/* Titles and bodies are written by the backend in Arabic. */}
                        <span className="notif-item-title">{td(item.title)}</span>
                        {item.body && <span className="notif-item-body">{td(item.body)}</span>}
                        <span className="notif-item-time">{formatRelativeTime(item.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
