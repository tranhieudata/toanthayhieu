import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { CommunityImage } from '../../components/CommunityWidgets';
const box = 'bg-white border rounded-xl p-5 shadow-sm';
const input = 'w-full border rounded-lg p-2';
const button = 'bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50';
const message = e => e.response?.data?.message || 'Không thể kết nối máy chủ';
export default function AdminCommunity() {
  const [energy, setEnergy] = useState({});
  const [data, setData] = useState(null), [settings, setSettings] = useState(null), [words, setWords] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const r = await api.get('/community/admin'); setData(r.data); setEnergy(r.data.energySettings); setSettings(r.data.settings); setWords(r.data.settings.bannedWords.join('\n')); setError(''); }
    catch (e) { setError(message(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function act(path, body, method = 'post') {
    setBusy(true);
    try { await api[method](`/community/${path}`, body); toast.success('Đã lưu'); await load(); return true; }
    catch (e) { toast.error(message(e)); return false; }
    finally { setBusy(false); }
  }
  if (!data) return <div className={box}>{error || 'Đang tải quản lý cộng đồng…'}{error && <button onClick={load} className="ml-3 underline">Thử lại</button>}</div>;
  return <div className="space-y-6 max-w-6xl">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Cộng đồng & thử thách</h1><p className="text-gray-500 mt-1">Quản lý nội dung, thời gian sử dụng và ghi nhận nỗ lực học sinh.</p></div><Link className="text-blue-600" to="/community">Xem cộng đồng →</Link></div>
    {error && <p className="text-red-600" role="alert">{error}</p>}
    <form className={box} onSubmit={e => { e.preventDefault(); act('admin/energy', Object.fromEntries(Object.entries(energy).map(([key, value]) => [key, Number(value)])), 'put'); }}>
      <h2 className="font-bold text-lg">Điểm thưởng & chi phí năng lượng</h2>
      <p className="text-sm text-gray-500 mt-2 mb-4">Điều chỉnh theo từng hành động. Nhập 0 để không thưởng hoặc miễn phí. Các giới hạn nhận thưởng vẫn áp dụng; điểm đã nhận không thay đổi. Trận đấu giữ mức thưởng lúc tạo phòng.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{data.energyActions.map(action => <label key={action.key} className="text-sm">{action.label}<input type="number" min={0} max={100000} step={1} required className={`${input} mt-1`} value={energy[action.key] ?? ''} onChange={e => setEnergy(s => ({ ...s, [action.key]: e.target.value }))} /><span className="text-xs text-gray-500">{action.unit}</span></label>)}</div>
      <button className={`${button} mt-4`} disabled={busy}>Lưu mức năng lượng</button>
    </form>
    <section className={box}><h2 className="font-bold text-lg">Đấu trường Toán học</h2><p className="text-sm text-gray-500 mt-2">Khối lớp tự tính từ năm sinh tại Quản lý lớp học. Quản lý kho câu hỏi theo khối, thêm thủ công hoặc dùng Gemini và công bố hàng loạt.</p><Link className="inline-block text-blue-600 text-sm mt-3" to="/community?tab=arena">Mở đấu trường & quản lý kho câu hỏi →</Link></section>
    <form className={box} onSubmit={e => { e.preventDefault(); act('admin/policy', { ...settings, dailyImageLimit: Number(settings.dailyImageLimit ?? 5), bannedWords: words.split('\n').map(w => w.trim()).filter(Boolean) }, 'put'); }}>
      <h2 className="font-bold text-lg mb-3">Quy định cộng đồng</h2>
      <fieldset className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-5"><legend className="text-sm font-semibold px-2">Điều kiện truy cập mạng xã hội</legend>
        <label className="block text-sm font-medium">Yêu cầu đối với học sinh<select className={`${input} mt-2 bg-white`} value={settings.homeworkAccessMode || 'submitted'} onChange={e => setSettings(s => ({ ...s, homeworkAccessMode: e.target.value }))}>
          <option value="none">Cho phép truy cập, không yêu cầu hoàn thành bài tập</option>
          <option value="submitted">Phải nộp đầy đủ bài tập (không cần chờ chấm)</option>
          <option value="graded">Tất cả bài tập phải được giáo viên chấm</option>
        </select></label>
        <p className="text-xs text-blue-900 mt-3">Áp dụng cho bài tập đã công bố trong các lớp đang hoạt động của học sinh, gồm cả bài quá hạn. Học sinh không có bài tập vẫn vào được. Admin luôn được truy cập để quản lý. Thay đổi có hiệu lực sau khi lưu và tự cập nhật ở tài khoản học sinh.</p>
      </fieldset>
      <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-5"><legend className="text-sm font-semibold px-2">Giới hạn ảnh mỗi ngày</legend>
        <label className="flex gap-2 items-center text-sm mb-4"><input type="checkbox" checked={settings.dailyImageLimitEnabled ?? true} onChange={e => setSettings(s => ({ ...s, dailyImageLimitEnabled: e.target.checked }))} />Bật giới hạn số ảnh mỗi tài khoản được đăng trong ngày</label>
        <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm">Số ảnh tối đa / tài khoản / ngày<input type="number" min={0} max={100} step={1} className={`${input} mt-1 bg-white`} value={settings.dailyImageLimit ?? 5} onChange={e => setSettings(s => ({ ...s, dailyImageLimit: e.target.value }))} disabled={settings.dailyImageLimitEnabled === false} required /></label>
        <label className="text-sm">Áp dụng cho<select className={`${input} mt-1 bg-white`} value={settings.dailyImageLimitScope || 'all'} onChange={e => setSettings(s => ({ ...s, dailyImageLimitScope: e.target.value }))} disabled={settings.dailyImageLimitEnabled === false}><option value="all">Tất cả tài khoản, bao gồm admin</option><option value="students">Chỉ học sinh</option></select></label></div>
        <p className="text-xs text-amber-900 mt-3">Mặc định 5 ảnh/ngày. Đặt 0 để tạm khóa đăng ảnh. Tính chung ảnh bài viết, hỏi bài và Tin 24 giờ, kể cả ảnh chờ duyệt, bị từ chối hoặc đã gỡ. Làm mới lượt lúc 00:00 giờ Việt Nam. Bài viết chỉ có chữ và ảnh nộp bài tập không dùng hạn mức này.</p>
      </fieldset>
      <h3 className="font-semibold mb-3">Giờ giới nghiêm & từ khóa cấm</h3>
      <label className="flex gap-2 items-center mb-3"><input type="checkbox" checked={settings.curfewEnabled} onChange={e => setSettings(s => ({ ...s, curfewEnabled: e.target.checked }))} />Bật giờ nghỉ cho đăng bài, bình luận và chat</label>
      <div className="flex flex-wrap gap-4 mb-4"><label>Từ (giờ Việt Nam)<input type="time" className={input} value={settings.curfewStart} onChange={e => setSettings(s => ({ ...s, curfewStart: e.target.value }))} required /></label><label>Đến<input type="time" className={input} value={settings.curfewEnd} onChange={e => setSettings(s => ({ ...s, curfewEnd: e.target.value }))} required /></label></div>
      <label className="block text-sm font-medium">Từ khóa cấm — mỗi dòng một từ/cụm từ<textarea className={`${input} mt-2 font-normal`} rows={6} value={words} onChange={e => setWords(e.target.value)} /></label>
      <p className="text-xs text-gray-500 my-3">Áp dụng tại máy chủ cho bài, Tin, bình luận và chat; chuẩn hóa chữ hoa, dấu tiếng Việt và ký tự ngắt quãng. Ảnh luôn cần admin duyệt nội dung trước khi công khai.</p><button className={button} disabled={busy}>Lưu thiết lập</button>
    </form>
    <section className={box}><div className="flex justify-between"><h2 className="font-bold text-lg">Ảnh chờ duyệt ({data.pending.length})</h2><button className="text-blue-600 text-sm" onClick={load}>Tải lại</button></div><p className="text-sm text-gray-500 mt-2">Chỉ duyệt ảnh phù hợp với học tập. Ảnh học tập tích cực được cộng điểm tối đa một lần/ngày; ảnh hỏi bài không cộng điểm đăng ảnh.</p>
      {!data.pending.length && <p className="text-gray-400 py-5">Không có bài chờ duyệt.</p>}
      <div className="grid md:grid-cols-2 gap-4 mt-4">{data.pending.map(p => <article key={p._id} className="border rounded-xl p-4"><b>{p.author?.name}</b><p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleString('vi-VN')} · {p.kind}</p><p className="my-3 whitespace-pre-wrap break-words">{p.text}</p><CommunityImage post={p._id} className="max-h-64 w-full object-contain bg-gray-50 rounded-lg" /><div className="flex gap-3 mt-4"><button disabled={busy} className={button} onClick={() => act(`admin/posts/${p._id}/review`, { status: 'approved' })}>Duyệt ảnh</button><button disabled={busy} className="text-red-600 text-sm" onClick={() => act(`admin/posts/${p._id}/review`, { status: 'rejected' })}>Từ chối</button></div></article>)}</div>
    </section>
    <section className={box}><h2 className="font-bold text-lg">Quản lý đề thử thách</h2><p className="text-sm text-gray-500 mt-2">Tạo đề, xem danh sách đề và tổng kết tháng tại tab Thử thách.</p><Link className="inline-block text-blue-600 text-sm mt-3" to="/community?tab=challenges">Mở quản lý thử thách →</Link></section>
    <section className={box}><h2 className="font-bold text-lg mb-4">Quà đổi từ năng lượng</h2>{data.gifts.flatMap(p => p.redemptions.filter(r => r.status === 'pending').map(r => <div className="flex flex-wrap gap-3 justify-between border-b py-3" key={r._id}><span>{p.user?.name} · {r.label}</span><button disabled={busy} className="text-blue-600 text-sm" onClick={() => act(`admin/gifts/${p.user._id}/${r._id}`, {})}>Xác nhận đã trao</button></div>))}{!data.gifts.length && <p className="text-gray-400 text-sm">Không có yêu cầu chờ trao.</p>}</section>
  </div>;
}
