import { useEffect, useState } from 'react';
import { FiDroplet, FiPlus, FiSave, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';

const question = () => ({ prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });
const message = error => error.response?.data?.message || 'Chưa lưu được bài ôn tập';
export default function LessonReviewEditor({ lesson, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const [title, setTitle] = useState(`Ôn tập: ${lesson.title}`.slice(0, 150));
  const [questions, setQuestions] = useState(() => Array.from({ length: 10 }, question));
  const [published, setPublished] = useState(true), [count, setCount] = useState(10), [busy, setBusy] = useState('');
  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    api.get(`/lessons/${lesson._id}/review`).then(({ data }) => {
      if (!active) return;
      if (data) { setTitle(data.title); setQuestions(data.questions); setPublished(data.isPublished); setCount(data.questions.length); }
      setLoaded(true); setError('');
    }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [open, loaded, lesson._id]);
  const update = (index, patch) => setQuestions(current => current.map((q, i) => i === index ? { ...q, ...patch } : q));
  async function generate() {
    if (busy) return;
    setBusy('generate');
    try {
      const { data } = await api.post(`/lessons/${lesson._id}/review/generate`, { count: Number(count) }, { timeout: 120000 });
      setTitle(data.title); setQuestions(data.questions);
      toast.success('Đã tạo bản nháp. Hãy kiểm tra đáp án rồi lưu bài.');
    } catch (e) { toast.error(message(e)); } finally { setBusy(''); }
  }
  async function save() {
    setBusy('save');
    try {
      const { data } = await api.put(`/lessons/${lesson._id}/review`, { title, questions, isPublished: published });
      setQuestions(data.questions); toast.success('Đã lưu bài ôn tập tưới cây');
    } catch (e) { toast.error(message(e)); } finally { setBusy(''); }
  }
  return <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-5">
    <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="flex items-center gap-2 font-semibold text-emerald-800"><FiDroplet /> Ôn tập để tưới cây</span><span className="text-sm text-emerald-700">{open ? 'Thu gọn' : 'Tạo / chỉnh sửa →'}</span></button>
    <p className="text-xs text-gray-600 mt-2">10–20 câu trắc nghiệm trong Vườn của tôi. Mỗi câu đúng = 1 điểm năng lượng; mỗi bài nhận điểm một lần. Chỉ học sinh thuộc lớp có khóa học này được làm bài đã công bố.</p>
    {open && <div className="mt-4">
      {error && <p role="alert" className="text-red-600 mb-3">{error}<button type="button" className="ml-3 underline" onClick={() => { setOpen(false); setError(''); }}>Đóng và mở lại để tải lại</button></p>}
      {!loaded && !error && <p className="text-sm text-gray-500">Đang tải bài ôn tập…</p>}
      {loaded && <fieldset disabled={Boolean(busy)} className="space-y-4 min-w-0">
        <div className="flex flex-wrap gap-3 items-end"><label className="text-sm">Số câu Gemini tạo<input type="number" min={10} max={20} step={1} className="input-field mt-1 w-24" value={count} onChange={e => setCount(e.target.value)} /></label><button type="button" disabled={!Number.isInteger(Number(count)) || Number(count) < 10 || Number(count) > 20} className="btn-primary flex items-center gap-2" onClick={generate}><FiZap /> {busy === 'generate' ? 'Gemini đang tạo câu hỏi…' : 'Tạo tự động bằng Gemini'}</button></div>
        <p className="text-xs text-gray-500">Gemini dựa vào tiêu đề và nội dung bài học. Tạo tự động sẽ thay thế bản nháp đang mở; chưa tự lưu hoặc công bố.</p>
        <label className="block text-sm font-medium">Tên bài ôn tập<input className="input-field mt-1" maxLength={150} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <div className="max-h-[580px] overflow-y-auto space-y-4 pr-1">{questions.map((q, index) => <fieldset key={index} className="rounded-xl border border-gray-200 bg-white p-4 min-w-0">
          <legend className="px-2 text-sm font-bold">Câu {index + 1}</legend>
          <textarea aria-label={`Nội dung câu ${index + 1}`} className="input-field" rows={2} maxLength={2000} value={q.prompt} onChange={e => update(index, { prompt: e.target.value })} placeholder="Nội dung câu hỏi; công thức dùng $...$" />
          <div className="grid sm:grid-cols-2 gap-3 mt-3">{q.options.map((option, choice) => <label key={choice} className="flex items-center gap-2 text-sm"><input type="radio" name={`review-correct-${index}`} checked={q.correctIndex === choice} onChange={() => update(index, { correctIndex: choice })} aria-label={`Đáp án đúng câu ${index + 1}: ${'ABCD'[choice]}`} /><span>{'ABCD'[choice]}</span><input aria-label={`Lựa chọn ${'ABCD'[choice]} câu ${index + 1}`} className="input-field" maxLength={1000} value={option} onChange={e => update(index, { options: q.options.map((v, i) => i === choice ? e.target.value : v) })} /></label>)}</div>
          <label className="block text-xs text-gray-500 mt-3">Giải thích đáp án<textarea rows={2} className="input-field mt-1" maxLength={2000} value={q.explanation || ''} onChange={e => update(index, { explanation: e.target.value })} /></label>
          <button type="button" className="text-xs text-red-600 mt-2 disabled:opacity-40" disabled={questions.length <= 10} onClick={() => setQuestions(current => current.filter((_, i) => i !== index))}>Xóa câu</button>
        </fieldset>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className="text-sm text-blue-600 flex items-center gap-1 disabled:opacity-40" disabled={questions.length >= 20} onClick={() => setQuestions(current => [...current, question()])}><FiPlus /> Thêm câu ({questions.length}/20)</button><label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} />Công bố trong Vườn của tôi</label><button type="button" className="btn-primary flex items-center gap-2" onClick={save}><FiSave /> {busy === 'save' ? 'Đang lưu…' : 'Lưu bài ôn tập'}</button></div>
        <p className="text-xs text-gray-500">Bài học cũng cần được bật hiển thị. Chọn nút tròn cạnh phương án đúng. Bài đang làm giữ nguyên bộ câu hỏi lúc bắt đầu; sửa bài không cấp lại điểm cho lượt đã nộp.</p>
      </fieldset>}
    </div>}
  </section>;
}
