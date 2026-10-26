import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axios';
import { getAuthToken, setAuthToken, clearAuthToken, subscribeAuthChanges } from '../utils/authSession';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionVersion = useRef(0);
  const currentToken = useRef(null);

  useEffect(() => {
    let active = true;
    const syncSession = () => {
      const token = getAuthToken();
      currentToken.current = token;
      const version = ++sessionVersion.current;
      const isCurrent = () => active && version === sessionVersion.current && getAuthToken() === token;
      setUser(null);
      setLoading(Boolean(token));
      if (!token) return;
      api.get('/auth/me')
        .then((res) => { if (isCurrent()) setUser(res.data.user); })
        .catch(error => { if (isCurrent() && error.response?.status === 401) clearAuthToken(); })
        .finally(() => { if (active && version === sessionVersion.current) setLoading(false); });
    };
    const unsubscribe = subscribeAuthChanges(() => {
      if (getAuthToken() !== currentToken.current) syncSession();
    });
    syncSession();
    return () => { active = false; unsubscribe(); };
  }, []);

  const login = (token, userData) => {
    ++sessionVersion.current;
    setAuthToken(token);
    currentToken.current = token;
    setUser(userData);
    setLoading(false);
  };

  const logout = () => {
    ++sessionVersion.current;
    clearAuthToken();
    currentToken.current = null;
    setUser(null);
    setLoading(false);
  };
  const updateUser = useCallback(updated => {
    setUser(current => current && current._id === updated._id ? { ...current, ...updated } : current);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
