import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from './AuthContext';

const ThemeContext = createContext(null);
export function ThemeProvider({ children }) {
  const { user, loading, updateUser } = useAuth();
  const [savingTheme, setSavingTheme] = useState(false);
  const account = useRef(user?._id);
  account.current = user?._id;
  const theme = loading ? document.documentElement.dataset.theme || 'light' : user?.theme === 'dark' ? 'dark' : 'light';
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { if (user) sessionStorage.setItem('toanthayhieu.theme', theme); else if (!loading) sessionStorage.removeItem('toanthayhieu.theme'); } catch { /* Storage can be disabled. */ }
  }, [theme, user, loading]);
  async function setTheme(nextTheme) {
    if (!user || savingTheme || !['light', 'dark'].includes(nextTheme) || nextTheme === theme) return;
    const userId = user._id, previous = theme;
    setSavingTheme(true);
    updateUser({ _id: userId, theme: nextTheme });
    try {
      const { data } = await api.put('/auth/me', { theme: nextTheme });
      if (account.current === userId) updateUser({ _id: userId, theme: data.user.theme });
    } catch (error) {
      if (account.current === userId) {
        updateUser({ _id: userId, theme: previous });
        toast.error(error.response?.data?.message || 'Chưa lưu được chế độ giao diện. Vui lòng thử lại.');
      }
    } finally { setSavingTheme(false); }
  }
  return <ThemeContext.Provider value={{ theme, setTheme, savingTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
