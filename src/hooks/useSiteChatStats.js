import { useCallback, useEffect, useRef, useState } from 'react';
import { siteChatsApi } from '../api/client';
import { useSocket } from '../context/SocketContext';

const REFRESH_MS = 60_000;
const DEBOUNCE_MS = 800;

/**
 * Live counts for website bot conversations (sidebar badge, page header).
 * Refetches when the server announces a change and once a minute, because "talking now"
 * expires with time even when nothing new arrives. `onUpdate(payload)` receives each
 * `site_chat:update` event ({ conversation, isNew }).
 */
export function useSiteChatStats({ onUpdate } = {}) {
  const { socket } = useSocket();
  const [stats, setStats] = useState(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const debounceRef = useRef(null);

  const load = useCallback(() => {
    siteChatsApi
      .stats()
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(debounceRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    const handler = (payload) => {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(load, DEBOUNCE_MS);
      onUpdateRef.current?.(payload);
    };
    socket.on('site_chat:update', handler);
    return () => socket.off('site_chat:update', handler);
  }, [socket, load]);

  return { stats, reload: load };
}
