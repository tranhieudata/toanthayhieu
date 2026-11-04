import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiEdit2, FiPlus, FiSave, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { DAYS, addDays, classLessonGroups, entryKey, shortDate, teachingSessionLink, todayKey, weekEntries, weekStartFor } from '../utils/weeklyTeachingPlan';

export default function WeeklyTeachingSchedule({ classes }) {
  const [weekStart, setWeekStart] = useState(weekStartFor);
  const [savedEntries, setSavedEntries] = useState([]);
  const [draft, setDraft] = useState([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [lessonsByCourse, setLessonsByCourse] = useState({});
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [lessonError, setLessonError] = useState('');
  const [lessonReload, setLessonReload] = useState(0);
  const today = todayKey();
  const entries = useMemo(() => weekEntries(classes, weekStart, savedEntries), [classes, weekStart, savedEntries]);
  const classMap = useMemo(() => Object.fromEntries(classes.map(cls => [cls._id, cls])), [classes]);
  const courseIdsKey = [...new Set(classes.flatMap(cls => (cls.courses || []).map(course => String(course._id || course))))].sort().join(',');

  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    const courseIds = courseIdsKey ? courseIdsKey.split(',') : [];
    setLoadingLessons(true);
    setLessonError('');
    Promise.all(courseIds.map(async courseId => {
      const { data } = await api.get('/lessons', { params: { course: courseId } });
      return [courseId, data || []];
    }))
      .then(items => { if (active) setLessonsByCourse(Object.fromEntries(items)); })
      .catch(() => { if (active) setLessonError('Không tải được danh sách bài học.'); })
      .finally(() => { if (active) setLoadingLessons(false); });
    return () => { active = false; };
  }, [editing, courseIdsKey, lessonReload]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSavedEntries([]);
    api.get('/teaching-sessions/week-plan', { params: { weekStart } })
      .then(({ data }) => { if (active) setSavedEntries(data.entries || []); })
      .catch(() => { if (active) setError('Không tải được kế hoạch tuần.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [weekStart, reload]);

  useEffect(() => { if (editing && !loading && !error) setDraft(entries.map(entry => ({ ...entry }))); }, [editing, loading, error, entries]);

  const closeEditor = () => {
    if (saving) return;
    const hasChanges = draft.some(entry => {
      const original = entries.find(item => entryKey(item) === entryKey(entry));
      return entry.topic !== original?.topic || entry.note !== original?.note || (entry.lesson || '') !== (original?.lesson || '');
    });
    if (hasChanges && !window.confirm('Đóng và bỏ các thay đổi chưa lưu?')) return;
    setEditing(false);
  };

  const savePlan = async () => {
    setSaving(true);
    try {
      const payload = draft.map(({ class: classId, date, startTime, endTime, lesson, topic, note }) => ({ class: classId, date, startTime, endTime, lesson: lesson || null, topic, note }));
      const { data } = await api.put('/teaching-sessions/week-plan', { weekStart, entries: payload });
      setSavedEntries(data.entries || []);
      setEditing(false);
      toast.success('Đã lưu kế hoạch và đồng bộ Buổi dạy');
    } catch (err) { toast.error(err.response?.data?.message || 'Không lưu được kế hoạch tuần'); }
    finally { setSaving(false); }
  };

  const updateEntry = (index, field, value) => setDraft(prev => prev.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
  const selectLesson = (index, lessonId) => setDraft(prev => prev.map((entry, i) => {
    if (i !== index) return entry;
    const lesson = classLessonGroups(classMap[entry.class], lessonsByCourse).flatMap(group => group.lessons).find(item => item._id === lessonId);
    return { ...entry, lesson: lessonId || null, topic: lesson?.title || '' };
  }));

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-gray-900"><FiCalendar className="text-blue-500" /> Lịch dạy theo tuần</h2>
          <p className="mt-1 text-xs text-gray-500">{shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}/{weekStart.slice(0, 4)} · {entries.length} buổi</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} title="Tuần trước" className="rounded-lg border p-2 text-gray-500"><FiChevronLeft /></button>
          <button type="button" onClick={() => setWeekStart(weekStartFor())} className="rounded-lg border px-3 py-2 text-xs text-gray-600">Tuần này</button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} title="Tuần sau" className="rounded-lg border p-2 text-gray-500"><FiChevronRight /></button>
          <button type="button" disabled={loading || !!error} onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 disabled:opacity-50"><FiEdit2 /> Kế hoạch tuần</button>
          <button type="button" disabled={loading || !!error} onClick={() => { setWeekStart(addDays(weekStart, 7)); setEditing(true); }} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"><FiPlus /> Lập kế hoạch tuần sau</button>
        </div>
      </div>
      {loading ? <p className="p-5 text-sm text-gray-400">Đang tải kế hoạch...</p> : error ? <div className="p-5 text-sm text-red-600">{error} <button onClick={() => setReload(value => value + 1)} className="underline">Thử lại</button></div> :
        <div className="max-h-80 overflow-auto p-3">
          <div className="grid min-w-[760px] grid-cols-7 gap-2">
            {DAYS.map((label, index) => {
              const date = addDays(weekStart, index);
              const dayEntries = entries.filter(entry => entry.date === date);
              return <div key={date} className={`rounded-lg border ${date === today ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100 bg-gray-50/50'}`}>
                <div className={`border-b px-2 py-2 text-xs font-semibold ${date === today ? 'text-blue-700' : 'text-gray-600'}`}>{label} <span className="font-normal">{shortDate(date)}</span>{date === today && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />}</div>
                <div className="space-y-2 p-1.5">
                  {dayEntries.map(entry => <Link key={entryKey(entry)} to={teachingSessionLink(entry)} className="block rounded-md border border-blue-100 bg-white p-2 text-xs hover:border-blue-300">
                    <p className="font-semibold text-blue-700">{entry.startTime}–{entry.endTime}</p>
                    <p className="mt-1 font-medium text-gray-800">{classMap[entry.class]?.name || 'Lớp học'}</p>
                    {entry.room && <p className="mt-0.5 truncate text-gray-400">{entry.room}</p>}
                    <p className={`mt-1 line-clamp-2 ${entry.topic ? 'text-gray-600' : 'italic text-gray-400'}`}>{entry.topic || 'Chưa lên bài'}</p>
                    {entry.note && <p className="mt-1 line-clamp-2 text-amber-700">{entry.note}</p>}
                  </Link>)}
                  {!dayEntries.length && <p className="py-4 text-center text-xs text-gray-300">—</p>}
                </div>
              </div>;
            })}
          </div>
        </div>}
      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="weekly-plan-title">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b p-4"><div><h2 id="weekly-plan-title" className="font-semibold text-gray-900">Kế hoạch tuần {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}</h2><p className="mt-1 text-xs text-gray-500">Lưu kế hoạch sẽ tạo buổi dạy dự kiến với ngày, bài học và lớp tương ứng.</p></div><button type="button" onClick={closeEditor} disabled={saving} title="Đóng" className="p-2 text-gray-400"><FiX /></button></div>
          <div className="space-y-3 overflow-y-auto p-4">
            {loading ? <p className="text-sm text-gray-500">Đang tải...</p> : error ? <p className="text-sm text-red-600">{error}</p> : !draft.length ? <p className="text-sm text-gray-500">Tuần này chưa có lịch dạy. Thêm lịch học trong mục Lớp học trước khi lập kế hoạch.</p> : draft.map((entry, index) => <div key={entryKey(entry)} className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 text-sm font-semibold text-gray-800">{DAYS[(new Date(`${entry.date}T00:00:00Z`).getUTCDay() + 6) % 7]} {shortDate(entry.date)} · {entry.startTime}–{entry.endTime} · {classMap[entry.class]?.name || 'Lớp học'}</p>
              <label className="block text-xs text-gray-500">Bài dự kiến
                <select value={entry.lesson || (entry.topic ? '__legacy__' : '')} disabled={saving || loadingLessons || !!lessonError} onChange={e => selectLesson(index, e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 disabled:bg-gray-50">
                  <option value="">{loadingLessons ? 'Đang tải bài học...' : 'Chọn bài từ khóa học của lớp'}</option>
                  {!entry.lesson && entry.topic && <option value="__legacy__" disabled>Đã lưu trước đây: {entry.topic}</option>}
                  {entry.lesson && !classLessonGroups(classMap[entry.class], lessonsByCourse).some(group => group.lessons.some(lesson => lesson._id === entry.lesson)) && <option value={entry.lesson} disabled>{entry.topic || 'Bài đã lưu'} (không có trong danh sách hiện tại)</option>}
                  {classLessonGroups(classMap[entry.class], lessonsByCourse).map(group => <optgroup key={group.id} label={group.title}>{group.lessons.map(lesson => <option key={lesson._id} value={lesson._id}>{lesson.order ? `${lesson.order}. ` : ''}{lesson.title}</option>)}</optgroup>)}
                </select>
              </label>
              {!loadingLessons && !lessonError && !classLessonGroups(classMap[entry.class], lessonsByCourse).some(group => group.lessons.length) && <p className="mt-1 text-xs text-amber-700">Lớp chưa có bài học để chọn. Thêm khóa học hoặc bài học cho lớp trước.</p>}
              <label className="mt-2 block text-xs text-gray-500">Chuẩn bị / ghi chú<textarea value={entry.note} maxLength={2000} disabled={saving} onChange={e => updateEntry(index, 'note', e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800" /></label>
            </div>)}
          </div>
          {lessonError && <p className="px-4 pb-3 text-sm text-red-600">{lessonError} <button type="button" onClick={() => setLessonReload(value => value + 1)} className="underline">Thử lại</button></p>}
          <div className="flex justify-end gap-2 border-t p-4"><button type="button" onClick={closeEditor} disabled={saving} className="rounded-lg border px-4 py-2 text-sm text-gray-600">Đóng</button><button type="button" onClick={savePlan} disabled={saving || loading || loadingLessons || !!lessonError || !!error || !draft.length} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"><FiSave />{saving ? 'Đang lưu...' : 'Lưu kế hoạch tuần'}</button></div>
        </div>
      </div>}
    </section>
  );
}
