import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import ReviewText from './ReviewText';
const box = 'community-panel';
const input = 'w-full border rounded-lg p-2';
const button = 'bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50';
const message = e => e.response?.data?.message || 'Không thể kết nối máy chủ';
const date = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const blankQuestion = () => ({ prompt: '', options: ['', '', '', ''], correctIndex: 0 });
const blankChallenge = () => ({ title: '', description: '', classes: [], startsAt: '', endsAt: '', durationMinutes: 15, monthlyPrize: '', questions: [blankQuestion()] });
export default function ChallengeManagement() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1), [loading, setLoading] = useState(false), [preview, setPreview] = useState(null);
  const version = useRef(0), pending = useRef(false);
  const [challenge, setChallenge] = useState(blankChallenge), [month, setMonth] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 7)), [monthly, setMonthly] = useState(null), [gift, setGift] = useState('');
  const load = useCallback(async () => {
    const request = ++version.current;
    setLoading(true); setError('');
    try {
      const { data: result } = await api.get('/community/admin/challenges', { params: { page }, timeout: 10000 });
      if (request !== version.current) return;
      setData(result); setPage(result.page);
    } catch (e) { if (request === version.current) setError(message(e)); }
    finally { if (request === version.current) setLoading(false); }
  }, [page]);
  const loadMonthly = useCallback(() => api.get('/community/monthly', { params: { month } }).then(r => setMonthly(r.data)).catch(e => setError(message(e))), [month]);
  useEffect(() => { load(); return () => { version.current++; }; }, [load]);
  useEffect(() => { loadMonthly(); }, [loadMonthly]);
  async function act(path, body) {
    if (pending.current) return false;
    pending.current = true; setBusy(true);
    try { await api.post(`/community/${path}`, body); toast.success('Đã lưu'); if (path === 'admin/challenges') { if (page === 1) await load(); else setPage(1); } return true; }
    catch (e) { toast.error(message(e)); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  async function inspect(id) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { const r = await api.get(`/community/admin/challenges/${id}`); setPreview(r.data); }
    catch (e) { toast.error(message(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  const field = (name, value) => setChallenge(c => ({ ...c, [name]: value }));
  if (!data) return <section className={box}>{error || 'Đang tải quản lý thử thách…'}{error && <button onClick={load}>Thử lại</button>}</section>;
  return <div className="space-y-5">
    <section className={box}><h2 className="font-bold text-xl">Quản lý đề thử thách</h2><p className="text-sm text-gray-500 mt-2">Tạo đề cho học sinh làm tại tab Thử thách, theo dõi đề đã tạo và trao quà tổng kết tháng.</p></section>
    <form className={box} onSubmit={async e => {
      e.preventDefault();
      // The time controls explicitly represent Vietnam time, independent of the admin's browser timezone.
      const ok = await act('admin/challenges', { ...challenge, startsAt: `${challenge.startsAt}:00+07:00`, endsAt: `${challenge.endsAt}:00+07:00`, durationMinutes: Number(challenge.durationMinutes) });
      if (ok) setChallenge(blankChallenge());
    }}>
      <h2 className="font-bold text-lg mb-4">Tạo thử thách tuần</h2><div className="grid md:grid-cols-2 gap-4">
        <label className="text-sm">Tên thử thách<input className={input} maxLength={150} value={challenge.title} onChange={e => field('title', e.target.value)} required /></label>
        <label className="text-sm">Thời lượng mỗi lượt (phút)<input type="number" min={1} max={180} className={input} value={challenge.durationMinutes} onChange={e => field('durationMinutes', e.target.value)} required /></label>
        <label className="text-sm">Mở từ (giờ Việt Nam)<input type="datetime-local" className={input} value={challenge.startsAt} onChange={e => field('startsAt', e.target.value)} required /></label>
        <label className="text-sm">Đóng lúc (giờ Việt Nam)<input type="datetime-local" className={input} value={challenge.endsAt} onChange={e => field('endsAt', e.target.value)} required /></label>
      </div>
      <label className="text-sm block mt-4">Mô tả<textarea className={input} rows={2} maxLength={3000} value={challenge.description} onChange={e => field('description', e.target.value)} /></label>
      <fieldset className="mt-4"><legend className="text-sm font-medium">Lớp được tham gia — bỏ trống để mở cho học sinh thuộc bất kỳ lớp đang hoạt động</legend><div className="flex flex-wrap gap-4 mt-2">{data.classes.map(c => <label className="flex gap-2 text-sm" key={c._id}><input type="checkbox" checked={challenge.classes.includes(c._id)} onChange={e => field('classes', e.target.checked ? [...challenge.classes, c._id] : challenge.classes.filter(id => id !== c._id))} />{c.name}</label>)}</div></fieldset>
      <label className="block text-sm mt-4">Quà tổng kết tháng<input className={input} maxLength={500} value={challenge.monthlyPrize} onChange={e => field('monthlyPrize', e.target.value)} placeholder="Ví dụ: Bộ dụng cụ học tập cho 3 bạn đứng đầu" /></label>
      <div className="space-y-4 my-5">{challenge.questions.map((q, i) => <fieldset className="border rounded-xl p-4" key={i}><legend className="font-semibold">Câu {i + 1}</legend><textarea aria-label={`Đề câu ${i + 1}`} className={input} placeholder="Nội dung câu hỏi" maxLength={2000} value={q.prompt} onChange={e => field('questions', challenge.questions.map((x, k) => k === i ? { ...x, prompt: e.target.value } : x))} required />
        <div className="grid md:grid-cols-2 gap-2 mt-3">{q.options.map((o, j) => <label className="flex gap-2 items-center" key={j}><input aria-label={`Đáp án đúng ${'ABCD'[j]} câu ${i + 1}`} type="radio" name={`correct-${i}`} checked={q.correctIndex === j} onChange={() => field('questions', challenge.questions.map((x, k) => k === i ? { ...x, correctIndex: j } : x))} /><input className={input} aria-label={`Lựa chọn ${'ABCD'[j]} câu ${i + 1}`} placeholder={`Lựa chọn ${'ABCD'[j]}`} value={o} maxLength={1000} onChange={e => field('questions', challenge.questions.map((x, k) => k === i ? { ...x, options: x.options.map((v, n) => n === j ? e.target.value : v) } : x))} required /></label>)}</div><p className="text-xs text-gray-400 mt-2">Chọn nút tròn bên cạnh đáp án đúng. Học sinh không nhận đáp án này khi làm bài.</p>{challenge.questions.length > 1 && <button type="button" className="text-red-600 text-xs mt-2" onClick={() => field('questions', challenge.questions.filter((_, k) => k !== i))}>Xóa câu</button>}
      </fieldset>)}</div>
      <div className="flex gap-4"><button type="button" disabled={challenge.questions.length >= 50} className="text-blue-600" onClick={() => field('questions', [...challenge.questions, blankQuestion()])}>＋ Thêm câu</button><button className={button} disabled={busy}>Tạo thử thách</button></div>
    </form>
    <section className={box}>
      <h2 className="font-bold text-lg">Đề thử thách đã tạo · {data.total} đề</h2>
      {error && <p role="alert" className="text-red-600">{error}<button className="ml-3 underline" onClick={load}>Thử lại</button></p>}
      {loading ? <p role="status">Đang tải danh sách đề…</p> : <div className="space-y-3 mt-3">{data.items.map(c => <article key={c._id} className="border-b pb-3"><b>{c.title}</b><p className="text-sm text-gray-500">{date(c.startsAt)} → {date(c.endsAt)} · {c.questionCount} câu · {c.durationMinutes} phút</p><p className="text-sm">{c.classes.length ? c.classes.map(id => data.classes.find(cls => cls._id === id)?.name || 'Lớp đã ngừng hoạt động').join(', ') : 'Tất cả lớp đang hoạt động'}</p><button type="button" className="text-blue-600 text-sm mt-2" disabled={busy} onClick={() => inspect(c._id)}>Xem đề & đáp án</button></article>)}{!data.items.length && <p className="text-sm text-gray-400">Chưa có đề thử thách.</p>}</div>}
      <nav className="arena-pagination" aria-label="Phân trang đề thử thách"><button className="arena-secondary" disabled={loading || page <= 1} onClick={() => { setPreview(null); setPage(p => p - 1); }}>Trước</button><span>Trang {data.page} / {data.pages}</span><button className="arena-secondary" disabled={loading || page >= data.pages} onClick={() => { setPreview(null); setPage(p => p + 1); }}>Sau</button></nav>
    </section>
    {preview && <section className={box}><div className="flex justify-between gap-3"><h3 className="font-bold">{preview.title}</h3><button onClick={() => setPreview(null)}>Đóng đề</button></div><p>{preview.description}</p>{preview.questions.map((q, i) => <div key={q._id || i} className="border-b py-3"><b>Câu {i + 1}</b><ReviewText>{q.prompt}</ReviewText>{q.options.map((option, j) => <p key={j}>{'ABCD'[j]}. <ReviewText>{option}</ReviewText>{q.correctIndex === j && <b> ✓ Đáp án đúng</b>}</p>)}</div>)}</section>}
    <section className={box}><div className="flex flex-wrap gap-4 items-center justify-between"><h2 className="font-bold text-lg">Tổng kết tháng & trao quà</h2><input aria-label="Tháng tổng kết" type="month" className="border rounded-lg p-2" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></div><label className="block text-sm my-4">Quà trao cho học sinh<input className={input} maxLength={500} value={gift} onChange={e => setGift(e.target.value)} placeholder="Tên quà thực tế đã trao" /></label>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b"><th className="p-2">Học sinh</th><th>Điểm</th><th>Số lượt</th><th>Quà tháng</th><th /></tr></thead><tbody>{monthly?.rows.map((r, i) => <tr className="border-b" key={r._id}><td className="p-3">{i + 1}. {r.name}</td><td>{r.score}</td><td>{r.completed}</td><td>{r.gift || '—'}</td><td><button className="text-blue-600 whitespace-nowrap" disabled={busy || !gift.trim()} onClick={async () => { if (await act('admin/awards', { month, student: r._id, gift })) loadMonthly(); }}>Ghi nhận trao quà</button></td></tr>)}</tbody></table>{!monthly?.rows.length && <p className="text-center py-6 text-gray-400">Chưa có kết quả tháng này.</p>}</div>
    </section>
  </div>;
}
