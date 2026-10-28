import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCheck, FiEdit2, FiPlus, FiSave, FiTrash2, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';
import ReviewText from './ReviewText';
import { Link } from 'react-router-dom';
import useGradeOptions from '../hooks/useGradeOptions';

const levels = { easy: 'Khởi động', medium: 'Tăng tốc', hard: 'Bứt phá' };
const blank = (grade, difficulty) => ({ grade, difficulty, kind: 'choice', prompt: '', options: ['', '', '', ''], correctIndex: 0, answer: '', explanation: '', published: false });
const message = e => e.response?.data?.message || 'Chưa lưu được thay đổi. Vui lòng thử lại.';

export default function ArenaQuestionBank({ onChange }) {
  const { grades, loading: loadingGrades, error: gradeError, reload: reloadGrades } = useGradeOptions();
  const [grade, setGrade] = useState(null), [difficulty, setDifficulty] = useState('easy'), [page, setPage] = useState(1);
  const [chapterFilter, setChapterFilter] = useState('');
  useEffect(() => { setChapterFilter(''); }, [grade]);
  useEffect(() => {
    if (!grades.some(level => level.grade === grade)) { setGrade(grades[0]?.grade ?? null); setPage(1); setEdit(null); }
  }, [grades, grade]);
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [generating, setGenerating] = useState(false);
  const [edit, setEdit] = useState(null), [topic, setTopic] = useState(''), [count, setCount] = useState(10), [drafts, setDrafts] = useState([]);
  const [chapterData, setChapterData] = useState({ grade: null, chapters: [] }), [loadingChapters, setLoadingChapters] = useState(false), [chapterError, setChapterError] = useState('');
  const chapterVersion = useRef(0);
  const chapters = chapterData.grade === grade ? chapterData.chapters : [];
  const selectedChapter = chapters.find(chapter => chapter.name === topic);
  const loadChapters = useCallback(async () => {
    const version = ++chapterVersion.current;
    if (!grade) return;
    setLoadingChapters(true); setChapterError('');
    try {
      const { data: result } = await api.get('/community/arena/chapters', { params: { grade }, timeout: 10000 });
      if (version !== chapterVersion.current) return;
      setChapterData(result);
      setTopic(previous => result.chapters.some(chapter => chapter.name === previous) ? previous : result.chapters[0]?.name || '');
    } catch (e) { if (version === chapterVersion.current) { setChapterError(message(e)); setChapterData({ grade, chapters: [] }); setTopic(''); } }
    finally { if (version === chapterVersion.current) setLoadingChapters(false); }
  }, [grade]);
  useEffect(() => {
    setTopic(''); loadChapters();
    const refresh = () => { if (document.visibilityState !== 'hidden') loadChapters(); };
    window.addEventListener('focus', refresh);
    return () => { chapterVersion.current++; window.removeEventListener('focus', refresh); };
  }, [loadChapters]);
  const [deleting, setDeleting] = useState('');
  const [allSelected, setAllSelected] = useState(false), [selectionIds, setSelectionIds] = useState([]);
  const selectAllBox = useRef(null), loadVersion = useRef(0);
  const draftCount = Number.isFinite(data?.draftCount) ? data.draftCount : (data?.questions || []).filter(q => !q.published).length;
  const selectedCount = Math.max(0, Math.min(draftCount, allSelected ? draftCount - selectionIds.length : selectionIds.length));
  const isSelected = id => allSelected ? !selectionIds.includes(id) : selectionIds.includes(id);
  function toggleQuestion(id) { setSelectionIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); }
  useEffect(() => { setAllSelected(false); setSelectionIds([]); }, [grade, difficulty, chapterFilter]);
  useEffect(() => { if (selectAllBox.current) selectAllBox.current.indeterminate = selectedCount > 0 && selectedCount < draftCount; }, [selectedCount, draftCount]);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    if (!grade) return;
    try {
      const { data: result } = await api.get('/community/arena/questions', { params: { grade, difficulty, page, chapter: chapterFilter || undefined }, timeout: 10000 });
      if (version !== loadVersion.current) return;
      setData(result); setError('');
      const published = new Set((result.questions || []).filter(q => q.published).map(q => q._id));
      setSelectionIds(previous => previous.filter(id => !published.has(id)));
    } catch (e) { if (version === loadVersion.current) setError(message(e)); }
  }, [grade, difficulty, page, chapterFilter]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { setEdit(null); }, [grade, difficulty, page, chapterFilter]);
  const change = (key, value) => setEdit(previous => ({ ...previous, [key]: value, ...(key === 'kind' && value === 'choice' ? { correctIndex: previous.correctIndex ?? 0 } : {}) }));
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true);
    try {
      await api[edit._id ? 'put' : 'post'](`/community/arena/questions${edit._id ? `/${edit._id}` : ''}`, edit);
      setEdit(null); await load(); await onChange(); toast.success('Đã lưu câu hỏi');
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }
  async function generate(event) {
    event.preventDefault(); if (generating || drafts.length || loadingChapters || !selectedChapter) return;
    setGenerating(true);
    try { const { data: result } = await api.post('/community/arena/generate', { grade, difficulty, topic, count }, { timeout: 180000 }); setDrafts(result.questions); toast.success('Đã tạo bản nháp. Kiểm tra đáp án trước khi công bố nhé.'); }
    catch (e) { toast.error(message(e)); if (e.response?.status === 400) loadChapters(); } finally { setGenerating(false); }
  }
  async function saveDrafts(publish = false) {
    if (busy) return;
    setBusy(true);
    let saved = 0;
    try {
      for (const draft of drafts) { await api.post('/community/arena/questions', { ...draft, published: publish }); saved++; }
      toast.success(publish ? `Đã lưu và công bố ${saved} câu hỏi.` : `Đã lưu ${saved} câu nháp. Có thể công bố tất cả bằng một lần bấm.`);
    } catch (e) { toast.error(`${message(e)} Đã lưu ${saved}/${drafts.length} câu; các câu còn lại được giữ trong bản nháp.`); }
    finally { setDrafts(previous => previous.slice(saved)); await load(); await onChange(); setBusy(false); }
  }
  async function publishSelected() {
    if (busy || !selectedCount) return;
    setBusy(true);
    try {
      const { data: result } = await api.post('/community/arena/questions/publish', { grade, difficulty, chapter: chapterFilter || undefined, ...(allSelected ? { all: true, excludedIds: selectionIds } : { questionIds: selectionIds }) });
      setEdit(previous => previous?._id && previous.grade === grade && previous.difficulty === difficulty && isSelected(previous._id) ? { ...previous, published: true } : previous);
      setAllSelected(false); setSelectionIds([]);
      await load(); await onChange();
      toast.success(result.publishedCount ? `Đã công bố ${result.publishedCount} câu đã chọn · Khối ${grade} · ${levels[difficulty]}` : 'Các câu đã chọn không còn là bản nháp.');
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }
  async function remove(question) {
    setBusy(true);
    try { await api.delete(`/community/arena/questions/${question._id}`); setSelectionIds(previous => previous.filter(id => id !== question._id)); setDeleting(''); await load(); await onChange(); }
    catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }
  const questionEditor = edit ? (<form className="arena-question-editor" onSubmit={save}><h4>{edit._id ? 'Chỉnh sửa câu hỏi' : 'Câu hỏi mới'} · Khối {edit.grade} · {levels[edit.difficulty]}</h4><label>Chương / chủ đề<select value={edit.chapter || ''} onChange={e => change('chapter', e.target.value)} required><option value="">Chọn chương</option>{chapters.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}{edit.chapter && !chapters.some(c => c.name === edit.chapter) && <option value={edit.chapter}>{edit.chapter} (đã đổi trong cài đặt)</option>}</select></label><label>Dạng câu hỏi<select value={edit.kind} onChange={e => change('kind', e.target.value)}><option value="choice">Trắc nghiệm 4 đáp án</option><option value="short">Điền đáp án ngắn</option></select></label><label>Nội dung câu hỏi<textarea value={edit.prompt} onChange={e => change('prompt', e.target.value)} maxLength={1000} rows="3" required placeholder="Công thức có thể viết bằng $LaTeX$" /></label>{edit.kind === 'choice' ? <><div className="arena-form-grid">{edit.options.map((value, i) => <label key={i}>Đáp án {'ABCD'[i]}<input value={value} maxLength={300} required onChange={e => change('options', edit.options.map((v, j) => j === i ? e.target.value : v))} /></label>)}</div><label>Đáp án đúng<select value={edit.correctIndex ?? 0} onChange={e => change('correctIndex', Number(e.target.value))}>{['A', 'B', 'C', 'D'].map((value, i) => <option key={value} value={i}>{value}</option>)}</select></label></> : <label>Đáp án đúng<input value={edit.answer || ''} onChange={e => change('answer', e.target.value)} maxLength={100} required /><small>Nên dùng số hoặc phân số. 0,5 / 0.5 / 1/2 được coi là cùng giá trị.</small></label>}<label>Giải thích<textarea value={edit.explanation} onChange={e => change('explanation', e.target.value)} maxLength={1500} rows="2" /></label><label className="arena-publish-check"><input type="checkbox" checked={edit.published} onChange={e => change('published', e.target.checked)} />Đã kiểm tra đáp án · Công bố cho học sinh</label><div className="arena-actions"><button className="arena-primary" disabled={busy}><FiSave />{busy ? 'Đang lưu…' : 'Lưu câu hỏi'}</button><button className="arena-secondary" type="button" disabled={busy} onClick={() => setEdit(null)}>Đóng</button></div></form>) : null;
  if (loadingGrades) return <p className="community-panel" role="status">Đang tải danh mục khối…</p>;
  if (gradeError) return <p className="arena-error" role="alert">{gradeError}<button onClick={reloadGrades}>Thử lại</button></p>;
  if (!grades.length) return <section className="community-panel arena-empty">Chưa có khối được cấu hình. <Link className="underline" to="/admin/settings">Thêm khối tại Cài đặt → Khối</Link> để sử dụng kho câu hỏi.</section>;
  return <div className="arena-bank">
    <p className="arena-form-note">Kho câu hỏi dùng chung theo khối, không cần chọn lớp. Đấu trường tự nhận khối từ năm sinh của lớp tại <Link className="underline" to="/admin/classes">Quản lý lớp học</Link>.</p>
    <section className="community-panel"><div className="arena-section-heading"><span><FiZap /></span><div><h3>Kho câu hỏi Toán nhanh</h3><p>Thêm thủ công hoặc tạo bằng Gemini. Mỗi khối và độ khó cần ít nhất 10 câu đã công bố để mở trận.</p></div></div><div className="arena-bank-toolbar"><label>Khối<select value={grade} disabled={busy || generating} onChange={e => { setGrade(Number(e.target.value)); setPage(1); setEdit(null); }}>{grades.map(level => <option key={level._id} value={level.grade}>{level.name}</option>)}</select></label><label>Độ khó<select value={difficulty} disabled={busy || generating} onChange={e => { setDifficulty(e.target.value); setPage(1); setEdit(null); }}>{Object.entries(levels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Chương / chủ đề<select value={chapterFilter} disabled={busy} onChange={e => { setChapterFilter(e.target.value); setPage(1); }}><option value="">Tất cả các chương</option>{chapters.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label><button className="arena-primary" disabled={busy} onClick={() => setEdit({ ...blank(grade, difficulty), chapter: chapterFilter || topic })}><FiPlus /> Thêm thủ công</button></div>
      <div className="arena-bulk-publish"><div><b>{data ? `${draftCount} câu nháp chưa công bố` : 'Đang tải trạng thái câu hỏi…'}</b><p>Chọn từng câu hoặc chọn tất cả câu nháp của Khối {grade} · {levels[difficulty]} trên mọi trang{chapterFilter ? ` · ${chapterFilter}` : ''}.</p>{draftCount > 0 && <label className="arena-select-all"><input ref={selectAllBox} type="checkbox" checked={selectedCount > 0 && selectedCount === draftCount} disabled={busy} onChange={e => { setAllSelected(e.target.checked); setSelectionIds([]); }} />Chọn tất cả câu nháp <span>({selectedCount}/{draftCount})</span></label>}</div><button type="button" className="arena-primary" disabled={busy || selectedCount === 0} onClick={publishSelected}><FiCheck />{busy ? 'Đang xử lý…' : `Công bố đã chọn (${selectedCount})`}</button></div>
      <form className="arena-ai-form" onSubmit={generate}>
        <label htmlFor="arena-ai-chapter">Chủ đề để Gemini tạo nháp<select id="arena-ai-chapter" value={selectedChapter?.name || ''} onChange={e => setTopic(e.target.value)} disabled={generating || busy || loadingChapters || !chapters.length} required>
          {(!chapters.length || loadingChapters) && <option value="">{loadingChapters ? 'Đang tải chương…' : 'Chưa có chương cho khối này'}</option>}
          {!loadingChapters && chapters.map(chapter => <option key={chapter.name} value={chapter.name}>{chapter.name}</option>)}
        </select></label>
        <label>Số câu<input type="number" min="10" max="30" value={count} onChange={e => setCount(Number(e.target.value))} required /></label>
        <button className="arena-secondary" disabled={generating || busy || loadingChapters || !selectedChapter || drafts.length > 0}><FiZap />{generating ? 'Gemini đang tạo…' : 'Tạo bằng Gemini'}</button>
        <small>Danh sách chương lấy từ <Link className="underline" to="/admin/settings">Cài đặt → Chủ đề kiểm tra</Link> theo khối đang chọn. Câu Gemini tạo chỉ là bản nháp, không tự công bố.{selectedChapter?.topics.length > 0 && <span className="block mt-1">Nội dung chương: {selectedChapter.topics.join(' · ')}</span>}</small>
        {!loadingChapters && !chapterError && chapters.length === 0 && <small>Thêm chương và lưu trong Chủ đề kiểm tra để tạo câu bằng Gemini. Bạn vẫn có thể thêm câu hỏi thủ công.</small>}
        {chapterError && <small role="alert">{chapterError} <button type="button" className="underline" onClick={loadChapters}>Thử lại</button></small>}
      </form>
      {drafts.length > 0 && <div className="arena-ai-drafts"><h4>{drafts.length} câu Gemini chưa lưu</h4><p>Kiểm tra nội dung bên dưới rồi lưu nháp hoặc lưu và công bố tất cả bằng một lần bấm.</p><div>{drafts.map((q, i) => <details key={i}><summary>Câu {i + 1} · Khối {q.grade} · {levels[q.difficulty]} · {q.kind === 'choice' ? 'Trắc nghiệm' : 'Điền đáp án'}</summary><ReviewText>{q.prompt}</ReviewText>{q.options?.map((option, j) => <p key={j}>{'ABCD'[j]}. <ReviewText>{option}</ReviewText></p>)}<b>Đáp án: <ReviewText>{q.kind === 'choice' ? `${'ABCD'[q.correctIndex]}. ${q.options[q.correctIndex]}` : q.answer}</ReviewText></b><p><ReviewText>{q.explanation}</ReviewText></p></details>)}</div><div className="arena-actions"><button type="button" className="arena-primary" disabled={busy} onClick={() => saveDrafts(true)}><FiCheck />{busy ? 'Đang lưu…' : 'Lưu và công bố tất cả'}</button><button type="button" className="arena-secondary" disabled={busy} onClick={() => saveDrafts()}><FiSave />Lưu tất cả vào kho nháp</button></div><p className="arena-form-note">Bản nháp chưa lưu sẽ mất khi rời trang.</p></div>}
      {edit && !edit._id && questionEditor}
      {error && <p className="arena-error" role="alert">{error}<button onClick={load}>Thử lại</button></p>}
      {!data && !error && <p role="status">Đang tải câu hỏi…</p>}
      {data && <>
        <p className="arena-bank-total">{data.total} câu trong kho · Khối {grade} · {levels[difficulty]}</p>
        {!data.questions.length && <p className="arena-empty">Chưa có câu hỏi. Thêm thủ công hoặc tạo bản nháp với Gemini.</p>}
        <div className="arena-bank-list">{data.questions.map(q => <article key={q._id} data-question-id={q._id} className={!q.published && isSelected(q._id) ? 'is-selected' : ''}>
          <div className="arena-bank-question-top">
            {!q.published && <label className="arena-select-question"><input type="checkbox" aria-label={`Chọn câu nháp: ${q.prompt}`} checked={isSelected(q._id)} disabled={busy} onChange={() => toggleQuestion(q._id)} />Chọn</label>}
            <span className={q.published ? 'is-published' : ''}>{q.published ? <><FiCheck />Đã công bố</> : 'Bản nháp'}</span><small>{q.kind === 'choice' ? 'Trắc nghiệm' : 'Điền đáp án'}</small>
          </div>
          <small>{q.chapter || 'Chưa gắn chương'}</small><p><ReviewText>{q.prompt}</ReviewText></p>
          <details><summary>Xem đáp án & giải thích</summary>{(q.options || []).map((option, i) => <p key={i}>{'ABCD'[i]}. <ReviewText>{option}</ReviewText></p>)}<b>Đáp án: <ReviewText>{q.kind === 'choice' ? `${'ABCD'[q.correctIndex]}. ${q.options[q.correctIndex]}` : q.answer}</ReviewText></b><p><ReviewText>{q.explanation}</ReviewText></p></details>
          <div className="arena-actions"><button className="arena-secondary" disabled={busy || edit?._id === q._id} onClick={() => { setEdit({ ...q, options: q.kind === 'choice' ? q.options : ['', '', '', ''] }); setDeleting(''); }}><FiEdit2 />Chỉnh sửa / công bố</button>{deleting === q._id ? <><span>Xóa câu này?</span><button className="arena-delete-confirm" disabled={busy} onClick={() => remove(q)}>Xác nhận xóa</button><button disabled={busy} onClick={() => setDeleting('')}>Giữ lại</button></> : <button className="arena-icon-button" disabled={busy} aria-label="Xóa câu hỏi" onClick={() => setDeleting(q._id)}><FiTrash2 /></button>}</div>
          {edit?._id === q._id && questionEditor}
        </article>)}</div>
        <nav className="arena-pagination" aria-label="Phân trang kho câu hỏi"><button className="arena-secondary" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page} / {Math.max(1, Math.ceil(data.total / 20))}</span><button className="arena-secondary" disabled={page * 20 >= data.total || busy} onClick={() => setPage(page + 1)}>Sau</button></nav>
      </>}
    </section>
  </div>;
}
