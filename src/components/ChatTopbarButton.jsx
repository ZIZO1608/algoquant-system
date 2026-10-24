import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { conversationsApi } from '../api/client';
import { useApp } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';
import { useI18n } from '../i18n';
import { ChatIcon } from './icons';

export const CHAT_LOCAL_READ_EVENT = 'chat:local-read';

function isConversationUnread(conv, myId) {
  const lastMsg = conv.messages?.[0];
  if (!lastMsg || lastMsg.senderId === myId) return false;
  const myMember = conv.members?.find((m) => m.employeeId === myId);
  if (!myMember?.lastReadAt) return true;
  return new Date(lastMsg.createdAt) > new Date(myMember.lastReadAt);
}

export default function ChatTopbarButton() {
  const { user } = useApp();
  const { socket } = useSocket();
  const { t } = useI18n();
  const myId = user?.id;
  const unreadIdsRef = useRef(new Set());
  const [unreadCount, setUnreadCount] = useState(0);

  const syncCount = useCallback(() => {
    setUnreadCount(unreadIdsRef.current.size);
  }, []);

  const loadUnread = useCallback(async () => {
    if (!myId) {
      unreadIdsRef.current = new Set();
      setUnreadCount(0);
      return;
    }
    try {
      const list = await conversationsApi.list();
      unreadIdsRef.current = new Set((list ?? []).filter((c) => isConversationUnread(c, myId)).map((c) => c.id));
      syncCount();
    } catch {
      unreadIdsRef.current = new Set();
      setUnreadCount(0);
    }
  }, [myId, syncCount]);

  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  useEffect(() => {
    if (!socket || !myId) return undefined;
    const onMessage = (payload) => {
      const conversationId = payload?.conversationId ?? payload?.message?.conversationId;
      const senderId = payload?.message?.senderId ?? payload?.senderId;
      if (!conversationId || senderId === myId) return;
      unreadIdsRef.current.add(conversationId);
      syncCount();
    };
    const onRead = (payload) => {
      if (!payload?.conversationId || payload?.employeeId !== myId) return;
      unreadIdsRef.current.delete(payload.conversationId);
      syncCount();
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:read', onRead);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:read', onRead);
    };
  }, [socket, myId, syncCount]);

  useEffect(() => {
    const onLocalRead = (event) => {
      const conversationId = event?.detail?.conversationId;
      if (!conversationId) return;
      unreadIdsRef.current.delete(conversationId);
      syncCount();
    };
    window.addEventListener(CHAT_LOCAL_READ_EVENT, onLocalRead);
    return () => window.removeEventListener(CHAT_LOCAL_READ_EVENT, onLocalRead);
  }, [syncCount]);

  return (
    <NavLink
      to="/chat"
      className={({ isActive }) => `topbar-btn ${isActive ? 'is-active' : ''}`}
      aria-label={unreadCount > 0 ? t('المحادثات، {count} غير مقروءة', { count: unreadCount }) : t('المحادثات')}
      title={t('المحادثات')}
    >
      <ChatIcon />
      {unreadCount > 0 && <span className="topbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </NavLink>
  );
}
