import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';

export function gradeNumber(level) {
  if (Number.isInteger(level?.grade) && level.grade >= 1 && level.grade <= 12) return level.grade;
  const match = String(level?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().match(/^(?:(?:lop|khoi)\s*)?(\d{1,2})(?:\s|$)/i);
  const grade = match ? Number(match[1]) : null;
  return grade >= 1 && grade <= 12 ? grade : null;
}
export function gradeOptions(levels) {
  const seen = new Set();
  return levels.filter(level => level.isActive !== false).map(level => ({ ...level, grade: gradeNumber(level) })).filter(level => level.grade && !seen.has(level.grade) && seen.add(level.grade));
}
export default function useGradeOptions() {
  const [grades, setGrades] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const reload = useCallback(async () => {
    try { const { data } = await api.get('/levels', { timeout: 10000 }); setGrades(gradeOptions(data)); setError(''); }
    catch (e) { setError(e.response?.data?.message || 'Không tải được danh mục khối'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    reload();
    const refresh = () => { if (document.visibilityState !== 'hidden') reload(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [reload]);
  return { grades, loading, error, reload };
}
