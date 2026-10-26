import { useEffect, useId, useRef, useState } from 'react';
import { FiCheckCircle, FiDroplet, FiArrowLeft, FiArrowRight, FiLock, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ReviewText from './ReviewText';
import '../styles/garden-review.css';

const message = e => e.response?.data?.message || 'Chưa tải được bài ôn tập. Vui lòng thử lại.';
const TOPICS_PER_PAGE = 6;
export default function GardenReview({ onComplete }) {
  const { user } = useAuth();
  const dialog = useRef(null), headingId = useId(), trigger = useRef(null);
  const [open, setOpen] = useState(false), [quizzes, setQuizzes] = useState(null), [error, setError] = useState('');
  const [active, setActive] = useState(null), [answers, setAnswers] = useState([]), [index, setIndex] = useState(0), [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil((quizzes?.length || 0) / TOPICS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visibleQuizzes = quizzes?.slice((currentPage - 1) * TOPICS_PER_PAGE, currentPage * TOPICS_PER_PAGE);
  async function load() {
    setError('');
    try { const { data } = await api.get('/community/garden/quizzes', { timeout: 10000 }); setQuizzes(data); }
    catch (e) { setError(message(e)); }
  }
  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => {
    const element = dialog.current;
    if (!open) { if (element?.open) element.close(); return; }
    if (element && !element.open) element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => {
    if (open && dialog.current) dialog.current.scrollTop = 0;
  }, [open, active?.attemptId, active?.completed, index, currentPage]);
  function openTopics() {
    setActive(null); setQuizzes(null); setError(''); setIndex(0); setPage(1); setOpen(true);
  }
  async function start(quiz) {
    if (quiz.completed || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post('/community/garden/task', { quiz: quiz._id }, { timeout: 15000 });
      if (data.completed) { await load(); toast.error('Chủ đề này đã hoàn thành, bạn không thể làm lại.'); return; }
      setActive(data); setIndex(0);
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(`review:${user._id}:${data.attemptId}`)); } catch { /* Optional draft. */ }
      setAnswers(Array.isArray(saved) && saved.length === data.questions.length ? saved.map(value => Number.isInteger(value) && value >= 0 && value < 4 ? value : null) : Array(data.questions.length).fill(null));
    } catch (e) { toast.error(message(e)); if (e.response?.status === 409) await load(); } finally { setBusy(false); }
  }
  function choose(value) {
    const next = answers.map((answer, i) => i === index ? value : answer);
    setAnswers(next);
    try { sessionStorage.setItem(`review:${user._id}:${active.attemptId}`, JSON.stringify(next)); } catch { /* In-memory answers remain usable. */ }
  }
  async function submit(event) {
    event.preventDefault(); if (busy || answers.some(a => !Number.isInteger(a))) return;
    setBusy(true);
    try {
      const { data } = await api.post('/community/garden/water', { attemptId: active.attemptId, answers }, { timeout: 20000 });
      setActive(data);
      try { sessionStorage.removeItem(`review:${user._id}:${active.attemptId}`); } catch { /* Optional storage. */ }
      await onComplete(); await load();
      toast.success(`Đã hoàn thành! ${data.correctCount}/${data.totalQuestions} câu đúng · ${data.energyPoints} điểm năng lượng.`);
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }
  return <div className="garden-review">
    <button ref={trigger} type="button" className="community-button mt-4" onClick={openTopics} aria-haspopup="dialog" aria-expanded={open}><FiDroplet /> Ôn tập để tưới cây</button>
    <dialog ref={dialog} className="garden-review-dialog" aria-labelledby={headingId} onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
    {open && <div className="garden-review-popup">
      <header className="garden-review-popup-header"><span className="locket-icon-tile"><FiDroplet /></span><div><h2 id={headingId}>Ôn tập để tưới cây</h2><p>{active ? 'Hoàn thành bài để nuôi cây và nhận điểm.' : 'Chọn một chủ đề và cùng tiến bộ nhé.'}</p></div><button type="button" aria-label="Đóng ôn tập" disabled={busy} onClick={() => setOpen(false)}><FiX /></button></header>
      <section className="garden-review-body">
      <h3>{active ? 'Ôn một chút, cây thêm xanh.' : 'Chủ đề ôn tập'}</h3><p className="garden-review-note">Mỗi câu đúng = 1 ⚡. Hoàn thành đủ 10–20 câu để tưới cây. Chủ đề đã hoàn thành sẽ được khóa, không thể làm lại.</p>
      {error && <p role="alert" className="text-red-500 text-sm mt-3">{error}<button className="ml-2 underline" onClick={load}>Thử lại</button></p>}
      {!active ? <div className="garden-review-list">
        {!quizzes && !error && <p>Đang tải bài ôn tập…</p>}
        {quizzes?.length === 0 && <p>Chưa có bài ôn tập được công bố cho lớp của bạn. Hãy quay lại khi thầy cô thêm bài nhé.</p>}
        {visibleQuizzes?.map(quiz => <button type="button" key={quiz._id} className={`garden-review-choice ${quiz.completed ? 'is-completed' : ''}`} disabled={busy || quiz.completed} onClick={() => start(quiz)}><span><b>{quiz.title}</b><small>{quiz.lessonTitle} · {quiz.count} câu</small></span><span className="garden-review-choice-status">{quiz.completed ? <><FiLock /> Đã hoàn thành · {quiz.score}/10</> : quiz.started ? 'Tiếp tục →' : 'Làm bài →'}</span></button>)}
        {quizzes?.length > 0 && <nav className="garden-review-pagination" aria-label="Phân trang chủ đề ôn tập"><button type="button" disabled={busy || currentPage === 1} onClick={() => setPage(currentPage - 1)}><FiArrowLeft /> Trước</button><span aria-live="polite">Trang {currentPage}/{pageCount} · {quizzes.length} chủ đề</span><button type="button" disabled={busy || currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Sau <FiArrowRight /></button></nav>}
      </div> : active.completed ? <div className="garden-review-result">
        <FiCheckCircle /><h4>Kết quả đã lưu</h4><b>{active.score}/10</b><p>{active.correctCount}/{active.totalQuestions} câu đúng · {active.energyPoints} ⚡ tích lũy từ bài này.</p>
        <p className="garden-review-note">Xem lại kết quả không cộng thêm điểm hoặc tưới cây vào ngày khác.</p>
        <details className="garden-review-solutions"><summary>Xem đáp án và giải thích</summary>{active.questions.map((q, i) => <div key={i}><b>Câu {i + 1}. <ReviewText>{q.prompt}</ReviewText></b><p>Bạn chọn: {'ABCD'[active.answers[i]]} · Đáp án đúng: {'ABCD'[q.correctIndex]}</p><p><ReviewText>{q.options[q.correctIndex]}</ReviewText></p>{q.explanation && <p><ReviewText>{q.explanation}</ReviewText></p>}</div>)}</details>
        <button type="button" className="community-button mt-3" onClick={() => setActive(null)}>Chọn chủ đề khác</button>
      </div> : <form onSubmit={submit}>
        <div className="garden-review-progress"><b>{active.title}</b><span>{answers.filter(Number.isInteger).length}/{answers.length} đã trả lời</span></div>
        <nav className="garden-review-numbers" aria-label="Chọn câu hỏi">{answers.map((answer, i) => <button type="button" key={i} aria-label={`Câu ${i + 1}${Number.isInteger(answer) ? ', đã trả lời' : ''}`} aria-current={index === i ? 'step' : undefined} className={Number.isInteger(answer) ? 'is-answered' : ''} onClick={() => setIndex(i)}>{i + 1}</button>)}</nav>
        <fieldset className="garden-review-question" disabled={busy}><legend>Câu {index + 1} / {answers.length}</legend><p><ReviewText>{active.questions[index].prompt}</ReviewText></p>
          <div className="garden-review-options">{active.questions[index].options.map((option, choice) => <label key={choice} className={answers[index] === choice ? 'is-selected' : ''}><input type="radio" name={`garden-${active.attemptId}-${index}`} checked={answers[index] === choice} onChange={() => choose(choice)} /><b>{'ABCD'[choice]}.</b><ReviewText>{option}</ReviewText></label>)}</div>
        </fieldset>
        <div className="garden-review-controls"><button type="button" disabled={busy || index === 0} onClick={() => setIndex(i => i - 1)}><FiArrowLeft /> Trước</button><button type="button" disabled={busy || index === answers.length - 1} onClick={() => setIndex(i => i + 1)}>Tiếp <FiArrowRight /></button></div>
        <button className="community-button w-full mt-4" disabled={busy || answers.some(a => !Number.isInteger(a))}>{busy ? 'Đang chấm bài…' : 'Nộp bài & tưới cây'}</button>
        <button type="button" disabled={busy} className="garden-review-back" onClick={() => setActive(null)}>Quay lại danh sách · giữ câu trả lời</button>
      </form>}
    </section></div>}
    </dialog>
  </div>;
}
