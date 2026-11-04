import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getUploadUrl } from '../../api/axios';
import toast from 'react-hot-toast';
import {
  FiBookOpen,
  FiCalendar,
  FiCheckSquare,
  FiClock,
  FiCopy,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSquare,
  FiZap,
} from 'react-icons/fi';

const todayInputValue = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const toDateInputValue = (date) => {
  const value = new Date(date);
  const pad = (item) => String(item).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

function nextScheduledDateForClass(cls, afterDate = new Date(), includeSameDay = false) {
  const days = (cls?.schedules || [])
    .map((schedule) => Number(schedule.dayOfWeek))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (!days.length) return null;

  const start = new Date(afterDate);
  start.setHours(0, 0, 0, 0);

  for (let offset = includeSameDay ? 0 : 1; offset <= 14; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    if (days.includes(candidate.getDay())) return candidate;
  }

  return null;
}

function classHasScheduleToday(cls) {
  const today = new Date().getDay();
  return (cls?.schedules || []).some((schedule) => Number(schedule.dayOfWeek) === today);
}

const statusOptions = [
  { value: 'planned', label: 'Dự kiến' },
  { value: 'completed', label: 'Đã dạy xong' },
  { value: 'partial', label: 'Dạy một phần' },
  { value: 'rescheduled', label: 'Dời sang buổi sau' },
  { value: 'skipped', label: 'Bỏ qua / thay thế' },
];

const statusClass = {
  planned: 'bg-blue-50 text-blue-700 border-blue-100',
  completed: 'bg-green-50 text-green-700 border-green-100',
  partial: 'bg-amber-50 text-amber-700 border-amber-100',
  rescheduled: 'bg-purple-50 text-purple-700 border-purple-100',
  skipped: 'bg-gray-50 text-gray-600 border-gray-100',
};

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('vi-VN');
}

function sortSessionsByTeachingDate(items = []) {
  return [...items].sort((a, b) => {
    const dateA = a?.date ? new Date(a.date).getTime() : 0;
    const dateB = b?.date ? new Date(b.date).getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;
    return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
  });
}

function upsertSession(items = [], nextSession) {
  if (!nextSession?._id) return sortSessionsByTeachingDate(items);
  const filtered = items.filter(session => String(session._id) !== String(nextSession._id));
  return sortSessionsByTeachingDate([nextSession, ...filtered]);
}

function getSessionLessonId(session) {
  return session?.actualLesson?._id || session?.actualLesson || session?.plannedLesson?._id || session?.plannedLesson || '';
}

function PdfLinks({ files }) {
  if (!files?.length) {
    return <p className="mt-2 text-sm text-gray-400">Không có PDF đính kèm, phụ huynh vẫn xem và in trên web bằng link bên dưới.</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {files.map((file, index) => (
        <a
          key={`${file.url}-${index}`}
          href={getUploadUrl(file.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
        >
          <span className="min-w-0 truncate">
            {file.filename || `Tai lieu ${index + 1}.pdf`}
            {file.sourceType && <span className="ml-2 text-xs text-blue-500">({file.sourceType})</span>}
          </span>
          <FiDownload className="shrink-0" size={15} />
        </a>
      ))}
    </div>
  );
}

function parentShareUrl(homework) {
  const path = homework?.parentPrintUrl || (homework?.printShareToken ? `/print/homework/${homework.printShareToken}` : '');
  if (!path) return '';
  return `${window.location.origin}${path}`;
}

function examPackageToHomeworkText(paper) {
  if (!paper) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => {
    const options = ['A', 'B', 'C', 'D'].map(key => `${key}. ${q.options?.[key] || ''}`).join('\n');
    return `Câu ${q.number || index + 1}. ${q.question || ''}\n${options}`;
  });
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}. ${q.question || ''}`);
  return [
    paper.title || '',
    mc.length ? `I. Phần trắc nghiệm\n${mc.join('\n\n')}` : '',
    essay.length ? `II. Phần tự luận\n${essay.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function examPackageToAnswerKey(paper) {
  if (!paper) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => {
    const explanation = q.explanation ? ` - ${q.explanation}` : '';
    return `Câu ${q.number || index + 1}: ${q.answer || ''}${explanation}`;
  });
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}: ${q.solution || ''}`);
  return [...mc, ...essay].filter(Boolean).join('\n');
}

function examMaxScore(exam) {
  const fromPackage = exam?.examPackage?.totals?.totalPoints;
  if (fromPackage) return Number(fromPackage) || 10;
  const fromLevels = (exam?.levels || []).reduce((sum, level) => sum + (Number(level.totalPoints) || 0), 0);
  return fromLevels || 10;
}

export default function AdminTeachingSessions() {
  const [searchParams] = useSearchParams();
  const initialClassId = searchParams.get('classId') || '';
  const initialDate = searchParams.get('date') || '';
  const [sessionStartTime, setSessionStartTime] = useState(searchParams.get('startTime') || '');
  const routeKey = searchParams.toString();
  const fromSchedule = searchParams.get('fromSchedule') === '1';
  const [loadedClassId, setLoadedClassId] = useState('');
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [classLessons, setClassLessons] = useState([]);
  const [selectedLessonId, setSelectedLessonId] = useState(searchParams.get('lessonId') || '');
  const [sessionDate, setSessionDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) && Number.isFinite(new Date(initialDate).getTime()) ? initialDate : todayInputValue());
  const [planner, setPlanner] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [loadingPlanner, setLoadingPlanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [form, setForm] = useState({ status: 'planned', summary: '', teacherNote: '' });
  const plannerRequestRef = useRef(0);
  const examBank = [];
  const attachingHomework = false;
  const attachForm = { examId: '', title: '', dueDate: '' };
  const setAttachForm = () => {};
  const attachHomeworkFromExam = () => {};

  const selectedLesson = useMemo(() => {
    return classLessons.find((lesson) => lesson._id === selectedLessonId) || (planner?.lesson?._id === selectedLessonId ? planner.lesson : null);
  }, [planner?.lesson, classLessons, selectedLessonId]);

  const journalDays = useMemo(() => {
    const groups = new Map();
    sortSessionsByTeachingDate(sessions).forEach(session => {
      const date = toDateInputValue(session.date);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(session);
    });
    return [...groups].map(([date, items]) => ({ date, items }));
  }, [sessions]);

  useEffect(() => {
    ++plannerRequestRef.current;
    setLoadedClassId('');
    setSelectedClassId(initialClassId);
    setSelectedLessonId(searchParams.get('lessonId') || '');
    setSessionDate(initialDate || todayInputValue());
    setSessionStartTime(searchParams.get('startTime') || '');
  }, [routeKey]);

  useEffect(() => {
    let active = true;
    api.get('/classes').then(({ data }) => {
      if (!active) return;
      const items = data || [];
      setClasses(items);
      if (initialClassId) {
        if (!items.some(item => item._id === initialClassId)) toast.error('Không tìm thấy lớp trong lịch đã chọn');
      } else {
        setSelectedClassId(current => current || items.find(classHasScheduleToday)?._id || items[0]?._id || '');
      }
    }).catch(() => { if (active) toast.error('Không tải được danh sách lớp'); });
    return () => { active = false; };
  }, [routeKey]);

  useEffect(() => {
    let active = true;
    ++plannerRequestRef.current;
    setLoadedClassId('');
    setClassLessons([]);
    setPlanner(null);
    setCurrentSession(null);
    setSessions([]);
    setForm({ status: 'planned', summary: '', teacherNote: '' });
    if (!selectedClassId) return undefined;
    const load = async () => {
      try {
        const { data: detail } = await api.get(`/classes/${selectedClassId}`);
        if (!active) return;
        const [results, sessionResponse] = await Promise.all([
          Promise.all((detail.courses || []).map(course => api.get('/lessons', { params: { course: course._id || course } }))),
          api.get('/teaching-sessions', { params: { classId: selectedClassId } }),
        ]);
        if (!active) return;
        const byId = new Map();
        results.flatMap(res => res.data || []).forEach(lesson => { if (lesson?._id) byId.set(lesson._id, lesson); });
        setClassLessons([...byId.values()]);
        const sortedSessions = sortSessionsByTeachingDate(sessionResponse.data || []);
        setSessions(sortedSessions);
        if (!(initialDate && selectedClassId === initialClassId)) {
          const upcomingPlan = [...sortedSessions].reverse().find(session => session.status === 'planned' && toDateInputValue(session.date) >= todayInputValue());
          if (upcomingPlan) {
            setSessionDate(toDateInputValue(upcomingPlan.date));
            setSelectedLessonId(getSessionLessonId(upcomingPlan));
            setSessionStartTime(upcomingPlan.startTime || '');
          } else {
            const nextDate = nextScheduledDateForClass(detail, sortedSessions[0]?.date || new Date(), !sortedSessions.length);
            if (nextDate) setSessionDate(toDateInputValue(nextDate));
          }
        }
        setLoadedClassId(selectedClassId);
      } catch (error) {
        if (active) toast.error(error.response?.data?.message || 'Không tải được bài học của lớp');
      }
    };
    load();
    return () => { active = false; ++plannerRequestRef.current; };
  }, [selectedClassId, routeKey]);

  const loadSessions = async (expectedRequestId = plannerRequestRef.current) => {
    if (!selectedClassId) return;
    try {
      const { data } = await api.get('/teaching-sessions', { params: { classId: selectedClassId } });
      if (expectedRequestId === plannerRequestRef.current) setSessions(sortSessionsByTeachingDate(data || []));
    } catch {
      if (expectedRequestId === plannerRequestRef.current) setSessions([]);
    }
  };

  const loadPlanner = async () => {
    if (!selectedClassId || loadedClassId !== selectedClassId) return;
    const requestId = ++plannerRequestRef.current;
    setLoadingPlanner(true);
    setPlanner(null);
    setCurrentSession(null);
    setForm({ status: 'planned', summary: '', teacherNote: '' });
    try {
      const params = { classId: selectedClassId, date: sessionDate };
      if (fromSchedule && selectedClassId === initialClassId && sessionDate === initialDate) params.fromSchedule = '1';
      if (sessionStartTime) params.startTime = sessionStartTime;
      if (selectedLessonId) params.lessonId = selectedLessonId;
      const { data } = await api.get('/teaching-sessions/planner', { params });
      const classHomeworks = (data.homeworks || []).filter((homework) => {
        const homeworkClassId = homework.class?._id || homework.class;
        return !homeworkClassId || String(homeworkClassId) === String(selectedClassId);
      });
      const homeworks = await Promise.all(classHomeworks.map(async (homework) => {
        if (parentShareUrl(homework)) return homework;
        try {
          const detail = await api.get(`/homeworks/${homework._id}`);
          return { ...homework, ...detail.data };
        } catch {
          return homework;
        }
      }));
      if (requestId !== plannerRequestRef.current) return;
      setPlanner({ ...data, homeworks });
      const resolvedLessonId = data.lesson?._id || '';
      if (resolvedLessonId !== selectedLessonId) setSelectedLessonId(resolvedLessonId);
      setCurrentSession(data.currentSession || null);
      setForm({
        status: data.currentSession?.status || 'planned',
        summary: data.currentSession?.summary || '',
        teacherNote: data.currentSession?.teacherNote || '',
      });
      await loadSessions(requestId);
    } catch (err) {
      if (requestId !== plannerRequestRef.current) return;
      toast.error(err.response?.data?.message || 'Không tải được kế hoạch buổi dạy');
    } finally {
      if (requestId === plannerRequestRef.current) setLoadingPlanner(false);
    }
  };

  useEffect(() => {
    loadPlanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ++plannerRequestRef.current; };
  }, [loadedClassId, selectedClassId, selectedLessonId, sessionDate, sessionStartTime, routeKey]);

  const generateSummaryWithGemini = async () => {
    const lessonId = selectedLessonId || planner?.lesson?._id || planner?.suggestedLesson?._id;
    const summaryClassId = selectedClassId;
    const summaryLessonId = lessonId;
    if (!selectedClassId) return toast.error('Chọn lớp trước');
    if (!lessonId) return toast.error('Chọn bài học trước');

    const homeworkLinks = (planner?.homeworks || [])
      .map((homework) => ({
        title: homework.title,
        url: parentShareUrl(homework),
      }))
      .filter((item) => item.url);

    setGeneratingSummary(true);
    try {
      const { data } = await api.post('/teaching-sessions/parent-summary', {
        classId: summaryClassId,
        lessonId: summaryLessonId,
        homeworkLinks,
      });
      if (summaryClassId !== selectedClassId || summaryLessonId !== (selectedLessonId || planner?.lesson?._id || planner?.suggestedLesson?._id)) return;
      setForm((prev) => ({ ...prev, summary: data.summary || prev.summary }));
      toast.success(data.source === 'fallback' ? 'Đã tạo tóm tắt dự phòng, Gemini đang lỗi hoặc chưa cấu hình' : 'Đã tạo tóm tắt gửi phụ huynh');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Không tạo được tóm tắt bằng Gemini');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const copyParentSummary = async () => {
    const text = form.summary?.trim();
    if (!text) return toast.error('Chưa có nội dung tóm tắt để copy');
    try {
      await navigator.clipboard?.writeText(text);
      toast.success('Đã copy tóm tắt gửi phụ huynh');
    } catch {
      toast.error('Không copy được nội dung');
    }
  };

  const saveSession = async () => {
    if (loadingPlanner || loadedClassId !== selectedClassId) return;
    if (!selectedClassId) return toast.error('Chọn lớp trước');
    if (!selectedLessonId) return toast.error('Chọn bài học trước');

    setSaving(true);
    try {
      const payload = {
        class: selectedClassId,
        date: sessionDate,
        startTime: currentSession?.startTime || sessionStartTime,
        endTime: currentSession?.endTime || '',
        plannedLesson: selectedLessonId,
        actualLesson: selectedLessonId,
        status: form.status,
        summary: form.summary,
        teacherNote: form.teacherNote,
        homeworks: (planner?.homeworks || []).map((homework) => homework._id),
        printablePdfs: [],
      };
      const { data } = currentSession?._id
        ? await api.put(`/teaching-sessions/${currentSession._id}`, payload)
        : await api.post('/teaching-sessions', payload);
      setCurrentSession(data || null);
      setSessions((prev) => upsertSession(prev, data));
      toast.success('Đã lưu buổi dạy');
      await loadSessions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không lưu được buổi dạy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FiBookOpen className="text-blue-600" /> Buổi dạy
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Chọn lớp, xem buổi trước, gom bài học và bài tập về nhà vào một nơi.
          </p>
        </div>
        <button type="button" onClick={loadPlanner} disabled={loadingPlanner} className="btn-secondary flex items-center justify-center gap-2">
          <FiRefreshCw className={loadingPlanner ? 'animate-spin' : ''} /> Tải lại
        </button>
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Lớp dạy</label>
          <select className="input-field" value={selectedClassId} onChange={(event) => { ++plannerRequestRef.current; setSelectedClassId(event.target.value); setSelectedLessonId(''); setSessionStartTime(''); setLoadedClassId(''); }}>
            {classes.map((cls) => <option key={cls._id} value={cls._id}>{cls.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Ngày dạy</label>
          <input type="date" className="input-field" value={sessionDate} onChange={(event) => { setSessionDate(event.target.value); setSessionStartTime(''); }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Bài học hôm nay</label>
          <select
            className="input-field"
            value={selectedLessonId}
            onChange={(event) => {
              setSelectedLessonId(event.target.value);
              setCurrentSession(null);
              setForm({ status: 'planned', summary: '', teacherNote: '' });
            }}
          >
            <option value="">Để hệ thống gợi ý</option>
            {selectedLessonId && !classLessons.some(lesson => lesson._id === selectedLessonId) && <option value={selectedLessonId}>{planner?.lesson?.title || 'Đang tải bài học đã chọn...'}</option>}
            {classLessons.map((lesson) => (
              <option key={lesson._id} value={lesson._id}>
                {lesson.order ? `${lesson.order}. ` : ''}{lesson.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(currentSession?.planningNote || planner?.calendarEntry?.note) && <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-semibold">Chuẩn bị theo kế hoạch tuần</p><p className="mt-1 whitespace-pre-wrap">{currentSession?.planningNote || planner.calendarEntry.note}</p></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedLesson?.title || 'Chưa chọn bài học'}</h2>
                <p className="mt-1 text-sm text-gray-500">{selectedLesson?.course?.title || 'Bài học sẽ được dùng làm trung tâm nội dung.'}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass[form.status]}`}>
                {statusOptions.find((item) => item.value === form.status)?.label}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Trạng thái thực tế</label>
                <select className="input-field" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                  {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Gợi ý buổi sau</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {planner?.suggestedLesson?.title || 'Chưa có gợi ý'}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-medium text-gray-500">Tóm tắt bài hôm nay gửi phụ huynh</label>
                <button
                  type="button"
                  onClick={generateSummaryWithGemini}
                  disabled={generatingSummary || loadingPlanner}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  <FiZap size={14} /> {generatingSummary ? 'Đang tạo...' : 'Tóm tắt bằng Gemini'}
                </button>
                <button
                  type="button"
                  onClick={copyParentSummary}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  <FiCopy size={14} /> Copy nội dung
                </button>
              </div>
              <textarea
                className="input-field min-h-[120px]"
                value={form.summary}
                onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
                placeholder="Ví dụ: Hôm nay con học hằng đẳng thức đáng nhớ, cần nắm 3 công thức chính và luyện thêm dạng rút gọn biểu thức."
              />
            </div>

            <label className="mt-4 block text-sm text-gray-600">Nhận xét của giáo viên
              <textarea rows={3} className="input-field mt-1" value={form.teacherNote} onChange={event => setForm(prev => ({ ...prev, teacherNote: event.target.value }))} placeholder="Nhận xét được lưu trên web hoặc gửi qua Telegram..." />
            </label>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <a href={selectedLessonId ? `/admin/lessons/${selectedLessonId}/edit` : '/admin/content'} className="btn-secondary flex items-center justify-center gap-2">
                <FiEdit2 /> Sửa nội dung bài học
              </a>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
              <FiFileText className="text-blue-600" /> Bài tập trong bài học
            </h3>
            <div className="mb-4 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-sm font-semibold text-emerald-900">Bài tập tự động từ Tạo Đề</p>
              <p className="mt-1 text-xs text-emerald-700">
                Các đề đã chọn đúng lớp và chủ đề/bài học sẽ tự xuất hiện ở đây dưới dạng bài tập, có sẵn link phụ huynh để xem và in.
              </p>
            </div>
            {false && (
            <div className="mb-4 rounded-lg border border-dashed border-blue-200 bg-blue-50/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Gắn từ đề kiểm tra</p>
                  <p className="mt-1 text-xs text-blue-600">Chỉ hiển thị các đề đã được giao cho lớp hiện tại; chọn một đề để tạo bài tập gắn với bài học này.</p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_160px_auto]">
                <select
                  className="input-field text-sm"
                  value={attachForm.examId}
                  onChange={(event) => {
                    const exam = examBank.find((item) => item._id === event.target.value);
                    setAttachForm((prev) => ({
                      ...prev,
                      examId: event.target.value,
                      title: prev.title || exam?.title || '',
                    }));
                  }}
                >
                  <option value="">Chọn đề kiểm tra</option>
                  {examBank.map((exam) => (
                    <option key={exam._id} value={exam._id}>
                      {exam.title}
                    </option>
                  ))}
                </select>
                <input
                  className="input-field text-sm"
                  value={attachForm.title}
                  onChange={(event) => setAttachForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Tên bài tập"
                />
                <input
                  type="date"
                  className="input-field text-sm"
                  value={attachForm.dueDate}
                  onChange={(event) => setAttachForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
                <button
                  type="button"
                  onClick={attachHomeworkFromExam}
                  disabled={attachingHomework || !attachForm.examId || !selectedClassId || !selectedLessonId}
                  className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap text-sm disabled:opacity-50"
                >
                  <FiPlus /> {attachingHomework ? 'Đang gắn...' : 'Gắn đề'}
                </button>
              </div>
              {examBank.length === 0 && (
                <p className="mt-3 text-xs text-amber-600">Chưa tìm thấy đề nào. Tạo đề trong mục Tạo Đề hoặc gắn đề với bài học trước.</p>
              )}
            </div>
            )}
            {planner?.homeworks?.length ? (
              <div className="space-y-3">
                {planner.homeworks.map((homework) => (
                  <div key={homework._id} className="rounded-lg border border-gray-100 p-3">
                    <p className="font-medium text-gray-900">{homework.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {homework.class?.name || ''}{homework.dueDate ? ` - Hạn ${formatDate(homework.dueDate)}` : ''}
                    </p>
                    {homework.sourceExam?.title && (
                      <p className="mt-1 text-xs text-emerald-600">Gắn từ đề: {homework.sourceExam.title}</p>
                    )}
                    <PdfLinks files={homework.pdfAttachments || []} />
                    {parentShareUrl(homework) && (
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                        <p className="text-xs font-medium text-emerald-700">Link gửi phụ huynh</p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            readOnly
                            className="input-field text-xs"
                            value={parentShareUrl(homework)}
                            onFocus={(event) => event.target.select()}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(parentShareUrl(homework));
                              toast.success('Đã copy link phụ huynh');
                            }}
                            className="btn-secondary flex shrink-0 items-center justify-center gap-2 text-sm"
                          >
                            <FiCopy /> Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Chưa có bài tập nào gắn với bài học này.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="hidden rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
              <FiClock className="text-amber-600" /> Buổi trước
            </h3>
            {planner?.previousSession ? (
              <div className="space-y-2 text-sm text-gray-700">
                <p className="font-medium text-gray-900">
                  {planner.previousSession.actualLesson?.title || planner.previousSession.plannedLesson?.title || 'Không rõ bài'}
                </p>
                <p>{formatDate(planner.previousSession.date)}</p>
                <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-600">
                  {planner.previousSession.summary || 'Buổi trước chưa có tóm tắt.'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Chưa có buổi dạy trước cho lớp này.</p>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
              <FiCalendar className="text-blue-600" /> Nhật ký theo ngày
            </h3>
            {journalDays.length ? (
              <div className="max-h-[480px] space-y-4 overflow-y-auto pr-1">
                {journalDays.map(group => <div key={group.date}>
                  <h4 className="sticky top-0 mb-2 rounded bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">{formatDate(group.date)}</h4>
                  <div className="space-y-2">{group.items.map(session => {
                    const lesson = session.actualLesson || session.plannedLesson;
                    const lessonId = getSessionLessonId(session);
                    const isSelected = currentSession?._id === session._id;
                    return <button key={session._id} type="button" onClick={() => {
                      setSessionDate(toDateInputValue(session.date));
                      setSessionStartTime(session.startTime || '');
                      setSelectedLessonId(lessonId || '');
                    }} className={`w-full rounded-lg border p-3 text-left text-sm transition hover:border-blue-200 hover:bg-blue-50/50 ${isSelected ? 'border-blue-200 bg-blue-50/70' : 'border-gray-100 bg-white'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="font-medium text-gray-900">{lesson?.title || session.summary || 'Buổi dạy'}</p>{session.startTime && <p className="mt-1 text-xs text-gray-500">{session.startTime}–{session.endTime}</p>}</div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${statusClass[session.status] || statusClass.planned}`}>{statusOptions.find(item => item.value === session.status)?.label || session.status}</span>
                      </div>
                      {session.summary && <p className="mt-2 line-clamp-2 text-gray-600">{session.summary}</p>}
                    </button>;
                  })}</div>
                </div>)}
              </div>
            ) : <p className="text-sm text-gray-400">Chưa có nhật ký buổi dạy. Các buổi đã lưu sẽ hiện theo ngày mới nhất trước.</p>}
          </section>
        </aside>
      </div>

      <div className="flex justify-end border-t border-gray-200 pt-5">
        <button type="button" onClick={saveSession} disabled={saving || loadingPlanner || loadedClassId !== selectedClassId} className="btn-primary flex items-center justify-center gap-2">
          <FiSave /> {saving ? 'Đang lưu...' : 'Lưu buổi dạy'}
        </button>
      </div>
    </div>
  );
}
