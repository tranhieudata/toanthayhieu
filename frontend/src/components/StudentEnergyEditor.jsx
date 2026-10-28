import { useEffect, useRef, useState } from 'react';
import { FiX, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function StudentEnergyEditor({ student, onSaved, onClose }) {
  const dialog = useRef(null), pending = useRef(false);
  const [balance, setBalance] = useState(student.energy ?? 0), [value, setValue] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get(`/users/${student._id}/energy`, { signal: controller.signal, timeout: 10000 }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setBalance(data.energy); setValue(String(data.energy));
    }).catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || 'Chưa tải được số dư năng lượng.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [student._id, reload]);
  const next = value.trim() === '' ? NaN : Number(value);
  const valid = Number.isSafeInteger(next) && next >= 0;
  const delta = next - balance;
  async function save(event) {
    event.preventDefault();
    if (pending.current || loading || !valid) return;
    pending.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.put(`/users/${student._id}/energy`, { energy: next, expectedEnergy: balance }, { timeout: 12000 });
      onSaved(data); toast.success(`Đã cập nhật năng lượng của ${student.name}`); onClose();
    } catch (e) {
      if (e.response?.status === 409 && Number.isSafeInteger(e.response.data.energy)) {
        setBalance(e.response.data.energy);
        onSaved({ userId: student._id, energy: e.response.data.energy });
      }
      setError(e.response?.data?.message || 'Chưa lưu được năng lượng. Vui lòng thử lại.');
    } finally { pending.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} aria-labelledby="student-energy-title" aria-describedby="student-energy-note" className="m-auto w-full max-w-md rounded-xl bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/60" style={{ maxWidth: 'min(28rem, calc(100vw - 2rem))' }} onCancel={e => { e.preventDefault(); if (!pending.current) onClose(); }} onClick={e => { if (e.target === dialog.current && !pending.current) onClose(); }}>
    <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><h2 id="student-energy-title" className="flex items-center gap-2 font-semibold"><FiZap className="text-amber-600" /> Điều chỉnh năng lượng</h2><button type="button" disabled={saving} onClick={onClose} aria-label="Đóng điều chỉnh năng lượng" className="rounded p-2 text-gray-500 hover:bg-gray-100"><FiX /></button></div>
    <form className="space-y-4 p-5" onSubmit={save}>
      <div><p className="font-semibold">{student.name}</p><p className="break-all text-sm text-gray-500">{student.email}</p></div>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Năng lượng hiện tại: <b>{loading ? 'Đang tải…' : `${balance.toLocaleString('vi-VN')} ⚡`}</b></p>
      <label className="block text-sm font-medium" htmlFor="student-energy-balance">Số dư năng lượng mới<input id="student-energy-balance" className="input-field mt-2" type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} required value={value} disabled={loading || saving} onChange={e => setValue(e.target.value)} /></label>
      {valid && !loading && <p className="text-sm text-gray-600">{delta === 0 ? 'Số dư không thay đổi.' : `${delta > 0 ? 'Tăng' : 'Giảm'} ${Math.abs(delta).toLocaleString('vi-VN')} năng lượng · Số dư sau lưu: ${next.toLocaleString('vi-VN')} ⚡`}</p>}
      <p id="student-energy-note" className="text-xs leading-relaxed text-gray-500">Điều chỉnh số dư dùng cho tự luyện và đổi quà. Tổng điểm học tập, điểm cộng đồng và thứ hạng được giữ nguyên.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}{value === '' && <button type="button" className="ml-2 underline" onClick={() => setReload(n => n + 1)}>Tải lại</button>}</p>}
      <div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Hủy</button><button type="submit" className="btn-primary" disabled={loading || saving || !valid || delta === 0}>{saving ? 'Đang lưu…' : 'Lưu năng lượng'}</button></div>
    </form>
  </dialog>;
}
