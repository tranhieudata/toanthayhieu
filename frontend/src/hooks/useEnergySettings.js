import { useEffect, useState } from 'react';
import api from '../api/axios';

export default function useEnergySettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    let stopped = false;
    const load = () => api.get('/community/energy', { timeout: 10000 }).then(({ data }) => { if (!stopped) setSettings(data); }).catch(() => {});
    load();
    window.addEventListener('focus', load);
    const timer = setInterval(load, 30000);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', load); };
  }, []);
  return settings;
}
