import { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';
import { getAuthToken } from '../utils/authSession';
import { createCommunityRefresh } from '../utils/communitySync';
const CommunityContext = createContext(null);
export function CommunityProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({ items: [], unread: 0 });
  const [inbox, setInbox] = useState([]);
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(false);
  const [friendships, setFriendships] = useState({ friends: [], incoming: [], outgoing: [] });
  const [friendshipsReady, setFriendshipsReady] = useState(false);
  const [friendshipsError, setFriendshipsError] = useState('');
  const account = useRef(user?._id);
  account.current = user?._id;
  const [accessState, setAccessState] = useState(null);
  const accessRequest = useRef(0);
  const accessApplied = useRef(0);
  const access = accessState?.account === user?._id ? accessState : null;
  const allowed = access?.allowed === true;
  const permission = useRef(false);
  permission.current = allowed;
  const refreshAccess = useCallback(async () => {
    if (!user) return;
    const request = ++accessRequest.current;
    try {
      const { data } = await api.get('/community/access', { timeout: 10000 });
      if (account.current === user._id && request > accessApplied.current) { accessApplied.current = request; setAccessState({ ...data, account: user._id }); }
    } catch {
      if (account.current === user._id && request > accessApplied.current) { accessApplied.current = request; setAccessState({ account: user._id, allowed: false, error: true }); }
    }
  }, [user]);
  useEffect(() => {
    if (!user) { setAccessState(null); return; }
    refreshAccess();
    const timer = setInterval(refreshAccess, 5000);
    const focus = () => { if (document.visibilityState !== 'hidden') refreshAccess(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    // A new assignment must also close an already-open community page.
    const interceptor = api.interceptors.response.use(response => response, error => {
      if (error.response?.data?.code === 'HOMEWORK_REQUIRED' && account.current === user._id) {
        accessApplied.current = ++accessRequest.current;
        setAccessState({ ...error.response.data, account: user._id });
      }
      return Promise.reject(error);
    });
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); api.interceptors.response.eject(interceptor); };
  }, [user, refreshAccess]);
  const refresh = useMemo(() => {
    if (!user || !allowed) return async () => {};
    return createCommunityRefresh({
      get: (path, options) => api.get(path, options), isCurrent: () => account.current === user._id && permission.current,
      resources: [
        { path: '/community/notifications', apply: setNotifications },
        { path: '/community/inbox', apply: setInbox },
        { path: '/community/friends', apply: data => { setFriendships(data); setFriendshipsReady(true); setFriendshipsError(''); }, onError: error => setFriendshipsError(error.response?.data?.message || 'Chưa tải được lời mời kết bạn. Vui lòng thử lại.') },
      ],
    });
  }, [user, allowed]);
  useEffect(() => {
    setFriendships({ friends: [], incoming: [], outgoing: [] }); setFriendshipsReady(false); setFriendshipsError('');
    setNotifications({ items: [], unread: 0 }); setInbox([]);
    if (!user || !allowed) return;
    let stopped = false, retry, streamConnected = false, ticks = 0;
    const controller = new AbortController();
    refresh();
    async function connect() {
      try {
        const response = await fetch(`${api.defaults.baseURL}/community/events`, {
          headers: { Authorization: `Bearer ${getAuthToken()}`, Accept: 'text/event-stream' }, signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok || !response.body) throw new Error('Kết nối tạm gián đoạn');
        if (stopped) return;
        streamConnected = true; setConnected(true); refresh(); setRevision(n => n + 1);
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, '\n');
          let end;
          let changed = false;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
            if (data) {
              const event = JSON.parse(data);
              if (event.type === 'access-revoked') { accessApplied.current = ++accessRequest.current; setAccessState(null); refreshAccess(); return; }
              if (event.type !== 'connected') changed = true;
            }
          }
          if (changed) { setRevision(n => n + 1); refresh(); }
        }
      } catch (error) { if (!stopped && error.name !== 'AbortError') setConnected(false); }
      if (!stopped) { streamConnected = false; setConnected(false); retry = setTimeout(connect, 3000); }
    }
    connect();
    const fallback = setInterval(() => { refresh(); if (!streamConnected || ++ticks % 3 === 0) setRevision(n => n + 1); }, 5000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') { refresh(); setRevision(n => n + 1); } };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    return () => { stopped = true; controller.abort(); clearTimeout(retry); clearInterval(fallback); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); setConnected(false); };
  }, [user, refresh, allowed, refreshAccess]);
  return <CommunityContext.Provider value={{ access, refreshAccess, notifications, inbox, revision, connected, refresh, friendships, friendshipsReady, friendshipsError }}>{children}</CommunityContext.Provider>;
}
export const useCommunity = () => useContext(CommunityContext);
