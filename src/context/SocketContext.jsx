import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useApp } from './AppContext';
import { getAccessToken } from '../api/client';

const SocketContext = createContext(null);

/**
 * Where the realtime socket connects.
 * - VITE_API_URL set to an absolute URL → that origin (split deployments).
 * - Otherwise the page's own origin: in development Vite proxies /socket.io to the API,
 *   which is what makes the app work from other devices on the same network.
 */
function getSocketUrl() {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      return new URL(apiUrl).origin;
    } catch {
      // fall through
    }
  }
  return window.location.origin;
}

export function SocketProvider({ children }) {
  const { isAuthenticated } = useApp();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setSocket(null);
      setConnected(false);
      return undefined;
    }

    const instance = io(getSocketUrl(), {
      auth: (cb) => cb({ token: getAccessToken() }),
      autoConnect: true,
    });

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    instance.on('connect_error', () => setConnected(false));

    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [isAuthenticated]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
