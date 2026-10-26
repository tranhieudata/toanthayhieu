import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { CommunityImage } from '../../components/CommunityWidgets';
const box = 'bg-white border rounded-xl p-5 shadow-sm';
const input = 'w-full border rounded-lg p-2';
const button = 'bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50';
const blankQuestion = () => ({ prompt: '', options: ['', '', '', ''], correctIndex: 0 });
const blankChallenge = () => ({ title: '', description: '', classes: [], startsAt: '', endsAt: '', durationMinutes: 15, monthlyPrize: '', questions: [blankQuestion()] });
const message = e => e.response?.data?.message || 'Không thể kết nối máy chủ';
export default function AdminCommunity() {
  const [data, setData] = useState(null), [settings, setSettings] = useState(null), [words, setWords] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(blankChallenge), [month, setMonth] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 7)), [monthly, setMonthly] = useState(null), [gift, setGift] = useState('');
  const load = useCallback(async () => {
    try { const r = await api.get('/community/admin'); setData(r.data); setSettings(r.data.settings); setWords(r.data.settings.bannedWords.join('\n')); setError(''); }
    catch (e) { setError(message(e)); }
  }, []);
  const loadMonthly = useCallback(() => api.get('/community/monthly', { params: { month } }).then(r => setMonthly(r.data)).catch(e => setError(message(e))), [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMonthly(); }, [loadMonthly]);
  async function act(path, body, method = 'post') {
    setBusy(true);
    try { await api[method](`/community/${path}`, body); toast.success('Đã lưu'); await load(); return true; }
    catch (e) { toast.error(message(e)); return false; }
    finally { setBusy(false); }
  }
  const field = (name, value) => setChallenge(c => ({ ...c, [name]: value }));
  if (!data) return <div className={box}>{error || 'Đang tải quản lý cộng đồng…'}{error && <button onClick={load} className="ml-3 underline">Thử lại</button>}</div>;
  return <div className="space-y-6 max-w-6xl">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Cộng đồng & thử thách</h1><p className="text-gray-500 mt-1">Quản lý nội dung, thời gian sử dụng và ghi nhận nỗ lực học sinh.</p></div><Link className="text-blue-600" to="/community">Xem cộng đồng →</Link></div>
    {error && <p className="text-red-600" role="alert">{error}</p>}
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
    <section className={box}><h2 className="font-bold text-lg">Thử thách đã tạo</h2><div className="space-y-3 mt-3">{data.challenges.map(c => <div key={c._id} className="border-b pb-3"><b>{c.title}</b><p className="text-sm text-gray-500">{new Date(c.startsAt).toLocaleString('vi-VN')} → {new Date(c.endsAt).toLocaleString('vi-VN')} · {c.questions.length} câu · {c.durationMinutes} phút</p></div>)}{!data.challenges.length && <p className="text-sm text-gray-400">Chưa có thử thách.</p>}</div></section>
    <section className={box}><div className="flex flex-wrap gap-4 items-center justify-between"><h2 className="font-bold text-lg">Tổng kết tháng & trao quà</h2><input aria-label="Tháng tổng kết" type="month" className="border rounded-lg p-2" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></div><label className="block text-sm my-4">Quà trao cho học sinh<input className={input} maxLength={500} value={gift} onChange={e => setGift(e.target.value)} placeholder="Tên quà thực tế đã trao" /></label>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b"><th className="p-2">Học sinh</th><th>Điểm</th><th>Số lượt</th><th>Quà tháng</th><th /></tr></thead><tbody>{monthly?.rows.map((r, i) => <tr className="border-b" key={r._id}><td className="p-3">{i + 1}. {r.name}</td><td>{r.score}</td><td>{r.completed}</td><td>{r.gift || '—'}</td><td><button className="text-blue-600 whitespace-nowrap" disabled={busy || !gift.trim()} onClick={async () => { if (await act('admin/awards', { month, student: r._id, gift })) loadMonthly(); }}>Ghi nhận trao quà</button></td></tr>)}</tbody></table>{!monthly?.rows.length && <p className="text-center py-6 text-gray-400">Chưa có kết quả tháng này.</p>}</div>
    </section>
    <section className={box}><h2 className="font-bold text-lg mb-4">Quà đổi từ năng lượng</h2>{data.gifts.flatMap(p => p.redemptions.filter(r => r.status === 'pending').map(r => <div className="flex flex-wrap gap-3 justify-between border-b py-3" key={r._id}><span>{p.user?.name} · {r.label}</span><button disabled={busy} className="text-blue-600 text-sm" onClick={() => act(`admin/gifts/${p.user._id}/${r._id}`, {})}>Xác nhận đã trao</button></div>))}{!data.gifts.length && <p className="text-gray-400 text-sm">Không có yêu cầu chờ trao.</p>}</section>
  </div>;
}
