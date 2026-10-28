import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowRight, FiAward, FiClock, FiFlag, FiPlus, FiRefreshCw, FiTarget, FiUsers, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import ReviewText from './ReviewText';
import ArenaQuestionBank from './ArenaQuestionBank';
import '../styles/math-arena.css';

const difficultyNames = { easy: 'Khởi động', medium: 'Tăng tốc', hard: 'Bứt phá' };
const errorMessage = error => error.response?.data?.message || 'Mất kết nối đấu trường. Hãy thử lại.';
const teamName = team => team === 0 ? 'Đội Cam' : 'Đội Xanh';

function MatchStage({ match, me }) {
  const totals = [0, 1].map(team => match.participants.filter(p => p.team === team).reduce((sum, p) => sum + p.score, 0));
  return <div className={`arena-stage ${match.mode === 'archery' ? 'is-archery' : ''}`} aria-label={match.mode === 'race' ? 'Đường đua trực tiếp' : 'Trường bắn trực tiếp'}>
    <div className="arena-stage-heading"><span>{match.mode === 'race' ? '🏁 ĐUA XE TỐC ĐỘ' : '🎯 AI LÀ XẠ THỦ?'}</span><span>Đích đến: {match.target} điểm</span></div>
    {[0, 1].map(team => <div className={`arena-lane team-${team}`} key={team}>
      <div className="arena-lane-label"><b>{teamName(team)}{me.team === team ? ' · Bạn' : ''}</b><strong>{totals[team]}<small> / {match.target}</small></strong></div>
      {match.mode === 'race' ? <div className="arena-road"><span className="arena-car" style={{ left: `${Math.min(100, totals[team] / match.target * 100)}%` }} aria-hidden="true">{team === 0 ? '🏎️' : '🚙'}</span><FiFlag className="arena-finish-flag" /></div> : <div className="arena-targets"><span className="arena-archer" aria-hidden="true">🏹</span>{Array.from({ length: match.target }, (_, i) => <span key={i} className={i < totals[team] ? 'is-hit' : ''} aria-label={`Mục tiêu ${i + 1}${i < totals[team] ? ' đã hạ' : ''}`}>{i < totals[team] ? '✦' : '◎'}</span>)}</div>}
      <div className="arena-lane-members">{match.participants.filter(p => p.team === team).map(p => <span key={p.user}>{p.name} <b>{p.score}</b></span>)}</div>
    </div>)}
  </div>;
}

export default function MathArena() {
  const { user, isAdmin } = useAuth();
  const { revision, refresh } = useCommunity();
  const [lobby, setLobby] = useState(null), [error, setError] = useState(''), [bank, setBank] = useState(false);
  const [classId, setClassId] = useState(''), [mode, setMode] = useState('race'), [format, setFormat] = useState('1v1'), [difficulty, setDifficulty] = useState('easy');
  const [opponent, setOpponent] = useState(''), [opponent2, setOpponent2] = useState(''), [teammate, setTeammate] = useState('');
  const [match, setMatch] = useState(null), [busy, setBusy] = useState(false), [answer, setAnswer] = useState(''), [now, setNow] = useState(Date.now());
  const [chapters, setChapters] = useState([]);
  useEffect(() => { setChapters([]); }, [classId]);
  const [syncError, setSyncError] = useState('');
  const matchId = useRef(null), clockOffset = useRef(0), syncTime = useRef(0);
  const questionHeading = useRef(null);
  const loadLobby = useCallback(async () => {
    try { const { data } = await api.get('/community/arena/lobby', { timeout: 10000 }); setLobby(data); setError(''); }
    catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { loadLobby(); }, [loadLobby, revision]);
  useEffect(() => { const timer = setInterval(loadLobby, 5000); return () => clearInterval(timer); }, [loadLobby]);
  const applyMatch = useCallback(data => {
    if (matchId.current !== data._id) return;
    clockOffset.current = new Date(data.serverNow).getTime() - Date.now(); syncTime.current = Date.now();
    setSyncError('');
    setMatch(previous => previous?._id === data._id && previous.revision > data.revision ? previous : data);
  }, []);
  function openMatch(data) { matchId.current = data._id; setMatch(null); setAnswer(''); applyMatch(data); }
  const selectedId = match?._id;
  const selectedStatus = match?.status;
  useEffect(() => {
    if (!selectedId || !['waiting', 'active'].includes(selectedStatus)) return;
    let stopped = false;
    async function poll() {
      try { const { data } = await api.get(`/community/arena/matches/${selectedId}`, { timeout: 5000 }); if (!stopped) applyMatch(data); }
      catch (e) { if (!stopped && matchId.current === selectedId) setSyncError(errorMessage(e)); }
    }
    let timer;
    async function loop() { await poll(); if (!stopped) timer = setTimeout(loop, selectedStatus === 'active' ? 900 : 1800); }
    loop();
    return () => { stopped = true; clearTimeout(timer); };
  }, [selectedId, selectedStatus, applyMatch]);
  useEffect(() => { if (!selectedId || !['waiting', 'active'].includes(selectedStatus)) return; const timer = setInterval(() => setNow(Date.now()), 150); return () => clearInterval(timer); }, [selectedId, selectedStatus]);
  useEffect(() => { setAnswer(''); if (match?.status === 'active') questionHeading.current?.focus({ preventScroll: true }); }, [match?.question?.index, match?.status]);
  useEffect(() => { if (selectedStatus === 'finished' || selectedStatus === 'cancelled') { loadLobby(); refresh(); } }, [selectedStatus, loadLobby, refresh]);
  const cls = lobby?.classes.find(c => c._id === classId) || lobby?.classes[0];
  const students = cls?.students.filter(p => p._id !== user._id) || [];
  const count = lobby?.counts.filter(c => c._id.grade === cls?.grade && c._id.difficulty === difficulty && (!chapters.length || chapters.includes(c._id.chapter))).reduce((sum, c) => sum + c.count, 0) || 0;
  const gradeConfigured = lobby?.grades?.some(level => level.grade === cls?.grade) === true;
  const me = match?.participants.find(p => p.user === user._id);
  const serverNow = now + clockOffset.current;
  const countdown = match?.startsAt ? Math.max(0, Math.ceil((new Date(match.startsAt).getTime() - serverNow) / 1000)) : 0;
  const seconds = match?.deadline ? Math.max(0, Math.min(60, Math.ceil((new Date(match.deadline).getTime() - serverNow) / 1000))) : 60;
  const connected = now - syncTime.current < 6500;
  async function action(path, payload = {}) {
    if (busy) return;
    setBusy(true);
    try { const { data } = await api.post(`/community/arena/${path}`, payload, { timeout: 12000 }); if (path === 'matches') openMatch(data); else applyMatch(data); await loadLobby(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function submit(value) {
    if (busy || !connected || !match?.question || countdown || !seconds) return;
    setBusy(true);
    try { const { data } = await api.post(`/community/arena/matches/${match._id}/answer`, { index: match.question.index, answer: value }, { timeout: 8000 }); applyMatch(data); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const liveRooms = lobby?.matches.filter(m => ['waiting', 'active'].includes(m.status)) || [];
  return <div className={`math-arena ${match ? 'has-match' : ''}`}>
    <section className="arena-hero"><div><span className="arena-kicker"><FiZap /> 60 GIÂY · HẾT MÌNH VỚI TOÁN</span><h2>Đấu trường Toán học<span>Chớp đáp án. Bứt tốc về đích.</span></h2><p>Thách đấu bạn cùng lớp, phối hợp cùng đồng đội và biến kiến thức thành năng lượng.</p><div className="arena-hero-tags"><span><FiClock /> 60 giây</span><span><FiUsers /> 1v1 / 2v2</span><span><FiZap /> Thắng +{lobby?.reward ?? '…'} ⚡/người</span></div></div><div className="arena-hero-art" aria-hidden="true"><span>×</span><span>÷</span><span>🏎️</span><span>π</span><span>🎯</span></div></section>
    {isAdmin && <div className="arena-admin-switch"><button className={!bank ? 'is-selected' : ''} onClick={() => setBank(false)}><FiTarget /> Tổng quan</button><button className={bank ? 'is-selected' : ''} onClick={() => setBank(true)}><FiPlus /> Kho câu hỏi</button></div>}
    {bank && isAdmin ? <ArenaQuestionBank onChange={loadLobby} /> : <>
      {error && <p className="arena-error" role="alert">{error}<button onClick={loadLobby}>Thử lại</button></p>}
      {!lobby && !error && <p className="community-panel" role="status">Đang mở đấu trường…</p>}
      {match && me ? <section className="community-panel arena-match">
        <div className="arena-match-top"><div><span className="arena-kicker">PHÒNG {match._id.slice(-6).toUpperCase()}</span><h3>{match.mode === 'race' ? 'Đua Xe Tốc Độ' : 'Ai là Xạ Thủ?'}</h3><p>Khối {match.grade} · {difficultyNames[match.difficulty]} · {match.format} / {match.chapters?.length ? match.chapters.join(', ') : 'Tất cả các chương'}</p></div><span className={`arena-clock ${match.status === 'active' && seconds <= 10 ? 'is-urgent' : ''}`}><FiClock /> {match.status === 'waiting' ? 'Chờ sẵn sàng' : match.status === 'active' ? `${seconds}s` : match.status === 'finished' ? 'Kết thúc' : 'Đã đóng'}</span></div>
        {syncError && <p className="arena-error" role="alert">{syncError} Đang kết nối lại…</p>}
        <MatchStage match={match} me={me} />
        {match.status === 'waiting' && <div className="arena-waiting"><h4>Sẵn sàng so tài?</h4><p>Chủ phòng bắt đầu khi tất cả người chơi đồng ý. Lời mời còn {Math.max(0, Math.ceil((new Date(match.expiresAt).getTime() - serverNow) / 1000))} giây.</p><div className="arena-ready-list">{match.participants.map(p => <span key={p.user}><i className={p.accepted ? 'is-ready' : ''} />{p.name}<small>{p.accepted ? 'Sẵn sàng' : 'Đang chờ'}</small></span>)}</div><div className="arena-actions">{!me.accepted && <button className="arena-primary" disabled={busy} onClick={() => action(`matches/${match._id}/accept`)}>Chấp nhận thách đấu <FiArrowRight /></button>}{match.host === user._id && <button className="arena-primary" disabled={busy || match.participants.some(p => !p.accepted)} onClick={() => action(`matches/${match._id}/start`)}>Bắt đầu trận đấu <FiFlag /></button>}<button className="arena-secondary" disabled={busy} onClick={() => action(`matches/${match._id}/cancel`)}>{match.host === user._id ? 'Hủy phòng' : 'Từ chối / rời phòng'}</button></div></div>}
        {match.status === 'active' && <div className="arena-question-area">
          {countdown > 0 ? <div className="arena-countdown" role="status"><strong>{countdown}</strong><p>Sẵn sàng… xuất phát!</p></div> : seconds === 0 ? <p className="arena-waiting" role="status">Hết giờ! Đang xác nhận kết quả từ máy chủ…</p> : match.question ? <>
            <div className="arena-question-meta"><b>Câu {match.question.index + 1}/{match.questionCount}</b><span>{match.question.kind === 'choice' ? 'Chọn một đáp án' : 'Điền đáp án ngắn'} · Đúng +1 điểm</span></div>
            <h4 ref={questionHeading} tabIndex={-1}><ReviewText>{match.question.prompt}</ReviewText></h4>
            {match.question.kind === 'choice' ? <div className="arena-options">{match.question.options.map((option, i) => <button key={`${match.question.index}-${i}`} disabled={busy || !connected} onClick={() => submit(i)}><b>{'ABCD'[i]}</b><ReviewText>{option}</ReviewText></button>)}</div> : <form className="arena-short-answer" onSubmit={e => { e.preventDefault(); if (answer.trim()) submit(answer); }}><label htmlFor="arena-answer">Đáp án của bạn</label><div><input id="arena-answer" value={answer} maxLength={100} autoComplete="off" onChange={e => setAnswer(e.target.value)} placeholder="Ví dụ: 12 hoặc 1/2" disabled={busy || !connected} required /><button className="arena-primary" disabled={busy || !connected || !answer.trim()} type="submit">Trả lời <FiArrowRight /></button></div><small>Có thể nhập số thập phân với dấu phẩy hoặc dấu chấm.</small></form>}
          </> : <p className="arena-waiting" role="status">{me.answered >= match.questionCount ? 'Bạn đã trả lời hết bộ câu hỏi! Theo dõi đồng đội và chờ kết quả nhé.' : 'Đang đồng bộ câu hỏi…'}</p>}
          <div className="arena-answer-feedback" aria-live="polite">{busy ? 'Đang gửi đáp án…' : match.lastAnswer?.index !== undefined ? match.lastAnswer.correct ? '✦ Chính xác! Đội của bạn tiến thêm 1 điểm.' : 'Chưa chính xác. Tập trung cho câu tiếp theo nhé!' : 'Bình tĩnh đọc đề, tự tin trả lời.'}</div>
          {!connected && <p className="arena-error" role="status">Đang đồng bộ trận đấu. Đáp án sẽ mở lại khi có kết nối.</p>}
        </div>}
        {match.status === 'finished' && <div className="arena-result" role="status"><span>{match.winner === null ? '🤝' : match.winner === me.team ? '🏆' : '🌟'}</span><h4>{match.winner === null ? 'Một trận hòa thật cân sức!' : match.winner === me.team ? 'Tuyệt vời! Đội bạn chiến thắng!' : `${teamName(match.winner)} chiến thắng!`}</h4><p>{match.reason} · Bạn trả lời đúng {me.score}/{me.answered} câu.</p><strong>{match.winner === me.team ? `+${match.reward} ⚡ năng lượng đã được cộng` : match.winner === null ? 'Hòa: không cộng năng lượng' : 'Mỗi trận đấu là một lần tiến bộ. Hẹn trận tiếp theo!'}</strong><button className="arena-primary" onClick={() => { matchId.current = null; setMatch(null); loadLobby(); }}>Về sảnh đấu <FiArrowRight /></button></div>}
        {match.status === 'cancelled' && <div className="arena-waiting"><h4>Phòng đã đóng</h4><p>{match.reason}</p><button className="arena-secondary" onClick={() => { matchId.current = null; setMatch(null); loadLobby(); }}>Về sảnh đấu</button></div>}
      </section> : lobby && <div className="arena-lobby-grid"><section className="community-panel arena-create"><div className="arena-section-heading"><span><FiTarget /></span><div><h3>Tạo kèo đấu mới</h3><p>Chọn đấu trường, rủ bạn cùng chơi.</p></div></div>
        <div className="arena-mode-picker"><button className={mode === 'race' ? 'is-selected' : ''} onClick={() => setMode('race')}><span>🏎️</span><b>Đua Xe Tốc Độ</b><small>Đúng một câu, tiến một bước</small></button><button className={mode === 'archery' ? 'is-selected' : ''} onClick={() => setMode('archery')}><span>🏹</span><b>Ai là Xạ Thủ?</b><small>Chính xác để hạ mục tiêu</small></button></div>
        {isAdmin ? <p className="arena-empty">Thầy quản lý câu hỏi theo khối trong mục “Kho câu hỏi”. Khối của từng lớp tự tính từ năm sinh tại Quản lý lớp học. Trận đấu dành cho tài khoản học sinh.</p> : <form onSubmit={e => { e.preventDefault(); action('matches', { classId: cls?._id, mode, format, difficulty, chapters, opponents: format === '1v1' ? [opponent] : [opponent, opponent2], ...(format === '2v2' ? { teammate } : {}) }); }}>
          <div className="arena-form-grid"><label>Lớp của bạn<select value={cls?._id || ''} onChange={e => { setClassId(e.target.value); setOpponent(''); setOpponent2(''); setTeammate(''); }} required><option value="" disabled>Chọn lớp</option>{lobby.classes.map(c => <option key={c._id} value={c._id}>{c.name}{c.grade ? ` · Khối ${c.grade}` : ' · Chưa nhận diện khối'}</option>)}</select></label><label>Hình thức<select value={format} onChange={e => { setFormat(e.target.value); setOpponent2(''); setTeammate(''); }}><option value="1v1">1 vs 1 · Đối kháng</option><option value="2v2">2 vs 2 · Đồng đội</option></select></label></div>
          <fieldset className="arena-chapter-picker"><legend>Chương thi đấu</legend><label><input type="checkbox" checked={!chapters.length} onChange={() => setChapters([])} /> Tất cả các chương</label>{(lobby.curriculum?.[cls?.grade] || []).map(c => <label key={c.name}><input type="checkbox" checked={chapters.includes(c.name)} onChange={e => setChapters(previous => e.target.checked ? [...previous, c.name] : previous.filter(name => name !== c.name))} /> {c.name}</label>)}</fieldset><label>Độ khó<select value={difficulty} onChange={e => setDifficulty(e.target.value)}>{Object.entries(difficultyNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          {format === '2v2' && <label>Đồng đội của bạn<select value={teammate} onChange={e => setTeammate(e.target.value)} required><option value="">Chọn đồng đội · Đội Cam</option>{students.filter(p => ![opponent, opponent2].includes(p._id)).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>}
          <div className={format === '2v2' ? 'arena-form-grid' : ''}><label>Đối thủ<select value={opponent} onChange={e => setOpponent(e.target.value)} required><option value="">Chọn bạn thách đấu</option>{students.filter(p => ![teammate, opponent2].includes(p._id)).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>{format === '2v2' && <label>Đối thủ thứ hai<select value={opponent2} onChange={e => setOpponent2(e.target.value)} required><option value="">Chọn thành viên Đội Xanh</option>{students.filter(p => ![teammate, opponent].includes(p._id)).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>}</div>
          <p className={`arena-bank-status ${!gradeConfigured || count < 10 ? 'is-missing' : ''}`}>{!cls ? 'Bạn cần tham gia một lớp học để thi đấu.' : !cls.birthYear ? 'Lớp chưa có năm sinh. Nhờ thầy cập nhật tại Quản lý lớp học nhé.' : !gradeConfigured ? 'Khối của lớp chưa được mở trong Cài đặt → Khối. Nhờ thầy kiểm tra nhé.' : `${count} câu đã sẵn sàng · Khối ${cls.grade} · ${difficultyNames[difficulty]}${count < 10 ? ' (cần ít nhất 10 câu)' : ''}`}</p>
          <button className="arena-primary arena-full" disabled={busy || !gradeConfigured || count < 10 || liveRooms.length > 0}>{busy ? 'Đang gửi lời mời…' : 'Gửi lời thách đấu'}<FiArrowRight /></button>
          {liveRooms.length > 0 && <small className="arena-form-note">Bạn có phòng đang chờ hoặc đang đấu. Mở phòng để tiếp tục.</small>}
        </form>}
      </section><aside className="arena-sidebar"><section className="community-panel"><div className="arena-section-heading"><span><FiUsers /></span><div><h3>Phòng của bạn</h3><p>Lời mời mới và trận đang diễn ra.</p></div><button className="arena-icon-button" aria-label="Tải lại phòng đấu" onClick={loadLobby}><FiRefreshCw /></button></div>{!liveRooms.length ? <div className="arena-empty"><span>🎮</span><p>Chưa có kèo đấu nào.<br />Rủ một người bạn thử sức nhé!</p></div> : liveRooms.map(room => <button className="arena-room" key={room._id} onClick={() => openMatch(room)}><span>{room.mode === 'race' ? '🏎️' : '🏹'}</span><div><b>{room.participants.find(p => p.user === room.host)?.name} mở phòng</b><small>{room.format} · {room.status === 'active' ? 'Đang thi đấu' : 'Chờ xác nhận'} · Khối {room.grade}</small></div><FiArrowRight /></button>)}</section><section className="arena-rules"><span className="arena-kicker"><FiAward /> LUẬT CHƠI CỰC GỌN</span><ol><li>Cùng lớp, cùng khối, cùng độ khó.</li><li>Đúng một câu: đội được 1 điểm. Sai: sang câu tiếp theo, không trừ điểm.</li><li>Chạm 10 điểm trước hoặc dẫn điểm sau 60 giây để chiến thắng.</li><li>Mỗi thành viên đội thắng nhận {lobby?.reward ?? '…'} ⚡. Hòa không cộng thưởng.</li></ol><p>Câu hỏi được chọn ngẫu nhiên, tối đa 30 câu/người. Cùng một bộ đề cho cả hai đội. Tải lại trang không đặt lại thời gian.</p></section></aside></div>}
      {!match && lobby?.matches.some(m => m.status === 'finished') && <section className="community-panel arena-history"><h3><FiAward /> Những trận vừa qua</h3>{lobby.matches.filter(m => m.status === 'finished').slice(0, 5).map(room => <button key={room._id} onClick={() => openMatch(room)}><span>{room.mode === 'race' ? '🏎️' : '🎯'} {room.format} · Khối {room.grade}</span><b>{room.winner === null ? 'Hòa' : room.participants.some(p => p.user === user._id && p.team === room.winner) ? `Chiến thắng · +${room.reward} ⚡` : 'Đã hoàn thành'}</b><FiArrowRight /></button>)}</section>}
    </>}
  </div>;
}
