import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import ReviewText from './ReviewText';
import '../styles/math-arena.css';

const difficulties = { easy: 'Khởi động', medium: 'Tăng tốc', hard: 'Bứt phá' };
const message = e => e.response?.data?.message || 'Chưa kết nối được. Hãy thử lại.';
const formatTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : 'Chưa ghi nhận';
export default function ArenaPractice() {
  const { isAdmin } = useAuth();
  const [lobby, setLobby] = useState(null), [data, setData] = useState(null), [error, setError] = useState('');
  const [classId, setClassId] = useState(''), [chapter, setChapter] = useState(''), [difficulty, setDifficulty] = useState('easy');
  const [busy, setBusy] = useState(false), [answer, setAnswer] = useState('');
  const [page, setPage] = useState(1), [history, setHistory] = useState(null), [historyError, setHistoryError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false), [historyReload, setHistoryReload] = useState(0);
  const pending = useRef(false);
  const load = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([api.get('/community/arena/lobby'), api.get('/community/arena/practice')]);
      setLobby(l.data); setData(p.data); setError('');
    } catch (e) { setError(message(e)); }
  }, []);
  useEffect(() => { if (!isAdmin) load(); }, [isAdmin, load]);
  useEffect(() => {
    if (isAdmin || !data) return;
    let stopped = false;
    setLoadingHistory(true); setHistoryError('');
    api.get('/community/arena/practice/history', { params: { page }, timeout: 10000 }).then(result => {
      if (!stopped) { setHistory(result.data); setPage(result.data.page); }
    }).catch(e => { if (!stopped) setHistoryError(message(e)); })
      .finally(() => { if (!stopped) setLoadingHistory(false); });
    return () => { stopped = true; };
  }, [isAdmin, data, page, historyReload]);
  const cls = lobby?.classes.find(c => c._id === classId) || lobby?.classes[0];
  const chapters = lobby?.curriculum?.[cls?.grade] || [];
  const selected = chapters.find(c => c.name === chapter)?.name || chapters[0]?.name || '';
  const count = lobby?.counts.filter(c => c._id.grade === cls?.grade && c._id.difficulty === difficulty && c._id.chapter === selected).reduce((sum, c) => sum + c.count, 0) || 0;
  const session = data?.session, q = session?.question;
  const cost = data?.practiceCost;
  async function act(path, body) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { const result = await api.post(`/community/arena/practice${path}`, body); setData(result.data); setAnswer(''); if (!path) setPage(1); }
    catch (e) { setError(message(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  if (isAdmin) return <section className="community-panel"><h2>Tự luyện Toán</h2><p>Học sinh tự luyện theo chủ đề, mỗi lượt 10 câu và lưu lại lịch sử luyện tập. Thầy quản lý câu hỏi tự luyện tại Đấu trường → Kho câu hỏi, điều chỉnh phí năng lượng tại trang quản trị.</p></section>;
  return <div className="math-arena"><section className="community-panel arena-create">
    <h2>Tự luyện Toán</h2><p>Mỗi lượt gồm 10 câu trong một chủ đề, mất {cost ?? '…'} ⚡ khi bắt đầu. Tiến độ được lưu để tiếp tục khi tải lại trang.</p>
    {data && <p className="arena-bank-status">Năng lượng còn lại: <b>{data.energy} ⚡</b></p>}
    {session && <p>Lần tự luyện #{session.number} · Bắt đầu: {formatTime(session.startedAt)}{session.completedAt && <> · Hoàn thành: {formatTime(session.completedAt)}</>}</p>}
    {error && <p className="arena-error" role="alert">{error}<button disabled={busy} onClick={load}>Tải lại</button></p>}
    {!data && !error && <p role="status">Đang tải tự luyện…</p>}
    {q ? <div className="arena-question-area">
      <p>Khối {session.grade} · {session.chapter} · {difficulties[session.difficulty]}</p>
      <h3>Câu {session.index + 1}/10 · Đúng {session.score} câu</h3><ReviewText>{q.prompt}</ReviewText>
      {q.kind === 'choice' ? <div className="arena-options">{q.options.map((option, i) => <button key={`${session.index}-${i}`} disabled={busy} onClick={() => act('/answer', { sessionId: session._id, index: session.index, answer: i })}><b>{'ABCD'[i]}</b><ReviewText>{option}</ReviewText></button>)}</div> : <form className="arena-short-answer" onSubmit={e => { e.preventDefault(); act('/answer', { sessionId: session._id, index: session.index, answer }); }}><label htmlFor="practice-answer">Đáp án của bạn</label><div><input id="practice-answer" value={answer} onChange={e => setAnswer(e.target.value)} maxLength={100} required disabled={busy} autoComplete="off" /><button className="arena-primary" disabled={busy || !answer.trim()}>Trả lời</button></div></form>}
    </div> : data && lobby && <>
      {session?.completed && <div className="arena-result" role="status"><h3>Hoàn thành: {session.score}/10 câu đúng</h3><p>Bạn đã luyện xong {session.chapter}.</p></div>}
      <form onSubmit={e => { e.preventDefault(); act('', { classId: cls?._id, chapter: selected, difficulty, previousId: session?._id }); }}>
        <label>Lớp của bạn<select value={cls?._id || ''} onChange={e => { setClassId(e.target.value); setChapter(''); }} required><option value="" disabled>Chọn lớp</option>{lobby.classes.map(c => <option key={c._id} value={c._id}>{c.name} · {c.grade ? `Khối ${c.grade}` : 'Chưa nhận diện khối'}</option>)}</select></label>
        <label>Chủ đề / chương<select value={selected} onChange={e => setChapter(e.target.value)} required><option value="" disabled>Chọn chủ đề</option>{chapters.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
        <label>Độ khó<select value={difficulty} onChange={e => setDifficulty(e.target.value)}>{Object.entries(difficulties).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        <p>{count} câu đã công bố{count < 10 ? ' · Cần ít nhất 10 câu trong chủ đề và độ khó này.' : ''}</p>
        <button className="arena-primary" disabled={busy || data.energy < cost || count < 10 || !lobby.grades?.some(g => g.grade === cls?.grade)}>{busy ? 'Đang mở lượt luyện…' : `Bắt đầu 10 câu · Mất ${cost} ⚡`}</button>
        {data.energy < cost && <p>Bạn cần đủ {cost} năng lượng để mở lượt luyện mới.</p>}
      </form>
    </>}
    {session?.review?.length > 0 && <div className="arena-ai-drafts" aria-live="polite"><h3>Đáp án và giải thích</h3>{session.review.map((r, i) => <details key={`${session._id}-${i}`} open={i === session.index - 1}><summary>Câu {i + 1} · {r.correct ? 'Chính xác' : 'Chưa chính xác'}</summary><ReviewText>{r.prompt}</ReviewText><p>Bạn trả lời: <ReviewText>{r.kind === 'choice' ? `${'ABCD'[r.submittedAnswer]}. ${r.options[r.submittedAnswer]}` : r.submittedAnswer}</ReviewText></p><p>Đáp án: <ReviewText>{r.kind === 'choice' ? `${'ABCD'[r.correctIndex]}. ${r.options[r.correctIndex]}` : r.answer}</ReviewText></p><ReviewText>{r.explanation}</ReviewText></details>)}</div>}
  </section><section className="community-panel arena-practice-history">
    <h3>Lịch sử tự luyện{history ? ` · ${history.total} lượt` : ''}</h3>
    {historyError ? <p className="arena-error" role="alert">{historyError}<button onClick={() => setHistoryReload(n => n + 1)}>Thử lại</button></p> : loadingHistory ? <p role="status">Đang tải lịch sử…</p> : history && <>
      {!history.items.length ? <p>Bạn chưa có lượt tự luyện nào.</p> : <ol className="arena-practice-history-list">{history.items.map(item => <li key={item._id}>
        <div><b>Lần tự luyện #{item.number}</b><span>{item.index === 10 ? `Hoàn thành · ${item.score}/10 câu đúng` : `Đang luyện · ${item.index}/10 câu đã làm`}</span></div>
        <p>Khối {item.grade} · {item.chapter} · {difficulties[item.difficulty]}</p>
        <p>Bắt đầu: <time dateTime={item.startedAt}>{formatTime(item.startedAt)}</time></p>
        {item.completedAt && <p>Hoàn thành: <time dateTime={item.completedAt}>{formatTime(item.completedAt)}</time></p>}
      </li>)}</ol>}
      <nav className="arena-pagination" aria-label="Phân trang lịch sử tự luyện"><button className="arena-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button><span>Trang {history.page} / {history.pages}</span><button className="arena-secondary" disabled={page >= history.pages} onClick={() => setPage(p => p + 1)}>Sau</button></nav>
    </>}
  </section></div>;
}
