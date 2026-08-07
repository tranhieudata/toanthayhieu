import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiUsers, FiArrowLeft, FiToggleLeft, FiToggleRight, FiBook, FiChevronDown, FiChevronRight, FiSearch, FiUserPlus, FiBarChart2, FiAlertCircle, FiCalendar } from 'react-icons/fi';

const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function toLocalDatetimeInput(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isLessonOpen(setting) {
  if (!setting) return false;
  if (setting.isVisible) return true;
  return !!setting.autoOpenAt && new Date(setting.autoOpenAt) <= new Date();
}

function combineDateAndTime(date, time) {
  const [hours = 0, minutes = 0] = (time || '00:00').split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function addMinutes(date, minutes) {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

function parseValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLatestDate(dates) {
  return dates.reduce((latest, date) => {
    if (!date) return latest;
    return !latest || date > latest ? date : latest;
  }, null);
}

function isSameMinute(a, b) {
  return a && b && Math.abs(a.getTime() - b.getTime()) < 60 * 1000;
}

function getNextClassSessions(cls, count, afterDate = new Date(), includeStart = false) {
  const schedules = (cls?.schedules || [])
    .filter((schedule) => schedule.startTime && Number.isInteger(Number(schedule.dayOfWeek)))
    .map((schedule) => ({ ...schedule, dayOfWeek: Number(schedule.dayOfWeek) }));
  if (!schedules.length || count <= 0) return [];

  const sessions = [];
  const cursor = new Date(afterDate);
  cursor.setHours(0, 0, 0, 0);

  for (let offset = 0; offset <= 365 && sessions.length < count; offset += 1) {
    const day = new Date(cursor);
    day.setDate(cursor.getDate() + offset);

    schedules
      .filter((schedule) => schedule.dayOfWeek === day.getDay())
      .forEach((schedule) => {
        const startAt = combineDateAndTime(day, schedule.startTime);
        if (startAt > afterDate || (includeStart && startAt.getTime() === afterDate.getTime())) {
          sessions.push({ ...schedule, startAt });
        }
      });

    sessions.sort((a, b) => a.startAt - b.startAt);
  }

  return sessions.slice(0, count);
}

function getUpcomingClassSessions(cls, daysAhead = 3) {
  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + daysAhead);
  windowEnd.setHours(23, 59, 59, 999);

  return (cls?.schedules || []).flatMap((schedule) => {
    const sessions = [];
    for (let offset = 0; offset <= daysAhead; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      if (date.getDay() !== Number(schedule.dayOfWeek)) continue;

      const startAt = combineDateAndTime(date, schedule.startTime);
      const endAt = combineDateAndTime(date, schedule.endTime || schedule.startTime);
      if (startAt < now || startAt > windowEnd) continue;

      sessions.push({ ...schedule, startAt, endAt });
    }
    return sessions;
  }).sort((a, b) => a.startAt - b.startAt);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatSessionDate(date) {
  return date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

function buildLessonReminders(cls, lessonsByCourse, lessonSettings, allCourses) {
  const sessions = getUpcomingClassSessions(cls);
  if (!sessions.length || !(cls?.courses || []).length) return [];

  return sessions.map((session) => {
    const courseOptions = (cls?.courses || []).map((course) => {
      const courseId = (course._id || course).toString();
      const lessons = lessonsByCourse[courseId] || [];
      const nextLesson = lessons.find((lesson) => !isLessonOpen(lessonSettings[lesson._id]));
      return {
        courseId,
        courseTitle: course.title || allCourses.find((item) => item._id === courseId)?.title || courseId,
        lessons,
        nextLesson,
      };
    });

    const hasLessonScheduledForDay = courseOptions.some(({ lessons }) =>
      lessons.some((lesson) => {
        const autoOpenAt = lessonSettings[lesson._id]?.autoOpenAt;
        return autoOpenAt && isSameDay(new Date(autoOpenAt), session.startAt);
      })
    );

    if (hasLessonScheduledForDay) return null;

    const suggested = courseOptions.find((option) => option.nextLesson) || courseOptions[0];
    return {
      session,
      courseId: suggested?.courseId || '',
      courseTitle: suggested?.courseTitle || 'Khóa học',
      nextLesson: suggested?.nextLesson || null,
    };
  }).filter(Boolean);
}

function formatScore(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function StudentScoreChart({ scores, color = 'blue' }) {
  const barColor = color === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500';
  const softColor = color === 'emerald' ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100';

  if (!scores.length) {
    return <div className="text-xs text-gray-400">Chưa có dữ liệu</div>;
  }

  return (
    <div className={`h-24 rounded-lg border ${softColor} px-3 py-2 overflow-x-auto`}>
      <div className="flex h-full min-w-max items-end gap-2">
        {scores.map((item) => {
          const maxScore = Number(item.maxScore) || 10;
          const hasScore = item.score != null;
          const percent = hasScore ? Math.max(4, Math.min(100, (Number(item.score) / maxScore) * 100)) : 4;
          return (
            <div key={item.homework || item.exam} className="flex w-8 flex-col items-center justify-end gap-1">
              <div
                title={`${item.title}: ${hasScore ? `${formatScore(item.score)}/${formatScore(maxScore)}` : 'Chưa chấm'}`}
                className={`w-5 rounded-t ${hasScore ? barColor : 'bg-gray-300'}`}
                style={{ height: `${percent}%` }}
              />
              <span className="w-8 truncate text-center text-[10px] font-medium text-gray-500">
                {hasScore ? formatScore(item.score) : '-'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const emptyForm = {
  name: '', description: '', courses: [], schedules: [],
  startDate: '', endDate: '', maxStudents: 30, isActive: true, feePerSession: 0
};

export default function AdminClasses() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addSchedule, setAddSchedule] = useState({ dayOfWeek: 1, startTime: '', endTime: '', room: '' });

  // Detail view
  const [selectedClass, setSelectedClass] = useState(null);
  const [activeTab, setActiveTab] = useState('lessons');
  const [classDetail, setClassDetail] = useState(null);
  const [classLessonSettings, setClassLessonSettings] = useState({}); // lessonId -> { isVisible, autoOpenAt }
  const [classLessonsMap, setClassLessonsMap] = useState({}); // courseId -> lessons[]
  const [classEnrollments, setClassEnrollments] = useState([]);
  const [expandedCourses, setExpandedCourses] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [lessonScheduleDrafts, setLessonScheduleDrafts] = useState({});
  const [lastAutoScheduleSnapshot, setLastAutoScheduleSnapshot] = useState(null);
  const [classStats, setClassStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Add student to class modal
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [autoOpenedClassId, setAutoOpenedClassId] = useState('');

  const load = () => api.get('/classes').then(res => setClasses(res.data));

  useEffect(() => {
    load();
    api.get('/courses/admin/all').then(res => setCourses(res.data));
  }, []);

  useEffect(() => {
    if (selectedClass && activeTab === 'stats' && !classStats && !statsLoading) {
      loadClassStats(selectedClass._id);
    }
  }, [selectedClass, activeTab, classStats, statsLoading]);

  useEffect(() => {
    const classId = searchParams.get('classId');
    const tab = searchParams.get('tab') || 'lessons';
    if (!classId || autoOpenedClassId === classId || classes.length === 0) return;

    const cls = classes.find((item) => item._id === classId);
    if (!cls) return;
    setAutoOpenedClassId(classId);
    setActiveTab(tab);
    openClassDetail(cls, tab);
  }, [classes, searchParams, autoOpenedClassId]);

  const openCreate = () => { setForm(emptyForm); setEditId(null); setModal(true); };
  const openEdit = (c) => {
    setForm({
      name: c.name, description: c.description,
      courses: c.courses.map(x => x._id || x),
      schedules: c.schedules || [],
      startDate: c.startDate ? c.startDate.substring(0, 10) : '',
      endDate: c.endDate ? c.endDate.substring(0, 10) : '',
      maxStudents: c.maxStudents, isActive: c.isActive,
      feePerSession: c.feePerSession || 0
    });
    setEditId(c._id); setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editId) { await api.put(`/classes/${editId}`, form); toast.success('Cập nhật lớp học thành công'); }
      else { await api.post('/classes', form); toast.success('Tạo lớp học thành công'); }
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Có lỗi xảy ra'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa lớp học này?')) return;
    try { await api.delete(`/classes/${id}`); toast.success('Xóa thành công'); load(); }
    catch { toast.error('Xóa thất bại'); }
  };

  const toggleCourse = (id) => {
    setForm(f => ({ ...f, courses: f.courses.includes(id) ? f.courses.filter(c => c !== id) : [...f.courses, id] }));
  };

  const addSch = () => {
    if (!addSchedule.startTime || !addSchedule.endTime) return toast.error('Vui lòng nhập thời gian');
    setForm(f => ({ ...f, schedules: [...f.schedules, { ...addSchedule }] }));
    setAddSchedule({ dayOfWeek: 1, startTime: '', endTime: '', room: '' });
  };

  const removeSch = (i) => setForm(f => ({ ...f, schedules: f.schedules.filter((_, idx) => idx !== i) }));

  // --- Detail view ---
  const openClassDetail = async (cls, tab = 'lessons') => {
    setSelectedClass(cls);
    setActiveTab(tab);
    setDetailLoading(true);
    setClassLessonSettings({});
    setLessonScheduleDrafts({});
    setClassLessonsMap({});
    setClassEnrollments([]);
    setExpandedCourses({});
    setLastAutoScheduleSnapshot(null);
    setClassStats(null);
    try {
      const [detailRes, enrollRes] = await Promise.all([
        api.get(`/classes/${cls._id}`),
        api.get(`/class-enrollments?classId=${cls._id}&status=approved`),
      ]);
      const detail = detailRes.data;
      setClassDetail(detail);

      const lessonSettings = {};
      const scheduleDrafts = {};
      (detail.lessonVisibility || []).forEach(lv => {
        const lessonId = (lv.lesson?._id || lv.lesson).toString();
        const autoOpenAt = toLocalDatetimeInput(lv.autoOpenAt);
        lessonSettings[lessonId] = { isVisible: !!lv.isVisible, autoOpenAt };
        scheduleDrafts[lessonId] = autoOpenAt;
      });
      setClassLessonSettings(lessonSettings);
      setLessonScheduleDrafts(scheduleDrafts);
      setClassEnrollments(enrollRes.data.enrollments || []);

      const lessonsMap = {};
      const expanded = {};
      await Promise.all((detail.courses || []).map(async (c) => {
        const courseId = (c._id || c).toString();
        const res = await api.get(`/lessons?course=${courseId}`);
        lessonsMap[courseId] = res.data;
        expanded[courseId] = true;
      }));
      setClassLessonsMap(lessonsMap);
      setExpandedCourses(expanded);
    } catch {
      toast.error('Không thể tải dữ liệu lớp học');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadClassStats = async (classId = selectedClass?._id) => {
    if (!classId) return;
    setStatsLoading(true);
    try {
      const { data } = await api.get(`/classes/${classId}/stats`);
      setClassStats(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể tải thống kê lớp');
    } finally {
      setStatsLoading(false);
    }
  };

  const handleToggleClassLesson = async (lessonId) => {
    try {
      const currentSetting = classLessonSettings[lessonId] || { isVisible: false, autoOpenAt: '' };
      const currentlyOpen = isLessonOpen(currentSetting);
      const payload = currentlyOpen
        ? { isVisible: false, ...(currentSetting.autoOpenAt ? { autoOpenAt: null } : {}) }
        : { isVisible: true };
      const res = await api.patch(`/classes/${selectedClass._id}/lessons/${lessonId}/toggle`, payload);
      const autoOpenAt = toLocalDatetimeInput(res.data.autoOpenAt);
      setClassLessonSettings(prev => ({
        ...prev,
        [lessonId]: { isVisible: !!res.data.isVisible, autoOpenAt },
      }));
      setLessonScheduleDrafts(prev => ({ ...prev, [lessonId]: autoOpenAt }));
      toast.success(isLessonOpen({ isVisible: !!res.data.isVisible, autoOpenAt }) ? 'Đã mở bài học cho lớp' : 'Đã tắt bài học cho lớp');
    } catch {
      toast.error('Không thể thay đổi trạng thái');
    }
  };

  const handleSaveLessonSchedule = async (lessonId, draftValue) => {
    try {
      const scheduleValue = (typeof draftValue === 'string' ? draftValue : lessonScheduleDrafts[lessonId] || '').trim();
      
      if (!scheduleValue) {
        toast.error('Vui lòng chọn giờ tự mở trước khi lưu');
        return;
      }
      
      if (Number.isNaN(new Date(scheduleValue).getTime())) {
        toast.error('Giờ tự mở không hợp lệ');
        return;
      }
      
      const payload = {
        autoOpenAt: new Date(scheduleValue).toISOString(),
        isVisible: false,
      };
      console.log('[handleSaveLessonSchedule] payload:', payload);
      const res = await api.patch(`/classes/${selectedClass._id}/lessons/${lessonId}/toggle`, payload);
      console.log('[handleSaveLessonSchedule] response:', res.data);
      const autoOpenAt = toLocalDatetimeInput(res.data.autoOpenAt);
      setClassLessonSettings(prev => ({
        ...prev,
        [lessonId]: { isVisible: !!res.data.isVisible, autoOpenAt },
      }));
      setLessonScheduleDrafts(prev => ({ ...prev, [lessonId]: autoOpenAt }));
      
      if (!res.data.autoOpenAt) {
        toast.error('Lưu giờ tự mở thất bại - server không lưu được dữ liệu');
        console.error('[handleSaveLessonSchedule] autoOpenAt is null/undefined after save:', res.data);
        return;
      }
      toast.success('Đã hẹn giờ tự mở bài học');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể lưu lịch tự mở');
    }
  };

  const toggleExpandCourse = (courseId) => {
    setExpandedCourses(prev => ({ ...prev, [courseId]: !prev[courseId] }));
  };

  const handleStudentSearch = async (q) => {
    setStudentSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const { data } = await api.get(`/users?role=student&search=${encodeURIComponent(q)}&limit=10`);
      setSearchResults(data.users || []);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  };

  const handleAdminAddStudent = async (studentId) => {
    try {
      await api.post('/class-enrollments/admin-add', { classId: selectedClass._id, studentId });
      toast.success('Đã thêm học sinh vào lớp');
      const { data } = await api.get(`/class-enrollments?classId=${selectedClass._id}&status=approved`);
      setClassEnrollments(data.enrollments || []);
      setClassStats(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi thêm học sinh');
    }
  };

  const handleAdminRemoveStudent = async (studentId, studentName) => {
    if (!confirm(`Xóa ${studentName} khỏi lớp?`)) return;
    try {
      await api.post('/class-enrollments/admin-remove', { classId: selectedClass._id, studentId });
      toast.success('Đã xóa học sinh khỏi lớp');
      const { data } = await api.get(`/class-enrollments?classId=${selectedClass._id}&status=approved`);
      setClassEnrollments(data.enrollments || []);
      setClassStats(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa học sinh');
    }
  };

  const handleAutoScheduleCourseLessons = async (lessons) => {
    if (!selectedClass?._id || !classDetail) return;
    if (!classDetail.schedules?.length) {
      toast.error('Lớp chưa có lịch học để cài tự động');
      return;
    }

    const sortedLessons = [...(lessons || [])];
    if (!sortedLessons.length) {
      toast.error('Khóa học này chưa có bài học nào');
      return;
    }

    const getLessonScheduleValue = (lessonId) =>
      lessonScheduleDrafts[lessonId] || classLessonSettings[lessonId]?.autoOpenAt || '';

    const lessonAutoOpenDates = sortedLessons.map((lesson) => parseValidDate(getLessonScheduleValue(lesson._id)));
    const firstUnscheduledIndex = lessonAutoOpenDates.findIndex((date) => !date);
    let firstOutOfSequenceIndex = -1;
    let latestScheduledAutoOpenAt = null;

    for (let index = 0; index < lessonAutoOpenDates.length; index += 1) {
      const currentAutoOpenAt = lessonAutoOpenDates[index];
      if (!currentAutoOpenAt) break;

      if (latestScheduledAutoOpenAt) {
        const previousClassStartAt = addMinutes(latestScheduledAutoOpenAt, 60);
        const [nextSession] = getNextClassSessions(classDetail, 1, previousClassStartAt);
        const expectedAutoOpenAt = nextSession ? addMinutes(nextSession.startAt, -60) : null;

        if (expectedAutoOpenAt && !isSameMinute(currentAutoOpenAt, expectedAutoOpenAt)) {
          firstOutOfSequenceIndex = index;
          break;
        }
      }

      latestScheduledAutoOpenAt = getLatestDate([latestScheduledAutoOpenAt, currentAutoOpenAt]);
    }

    const firstAutoScheduleIndex = firstOutOfSequenceIndex !== -1
      ? firstOutOfSequenceIndex
      : firstUnscheduledIndex;
    const lessonsToSchedule = firstAutoScheduleIndex === -1
      ? []
      : sortedLessons.slice(firstAutoScheduleIndex);

    if (!lessonsToSchedule.length) {
      toast.success('Tất cả bài học đã có lịch tự mở');
      return;
    }

    const snapshotLessonIds = lessonsToSchedule.map((lesson) => lesson._id);
    const snapshotSettings = {};
    const snapshotDrafts = {};
    snapshotLessonIds.forEach((lessonId) => {
      snapshotSettings[lessonId] = classLessonSettings[lessonId] || { isVisible: false, autoOpenAt: '' };
      snapshotDrafts[lessonId] = lessonScheduleDrafts[lessonId] ?? snapshotSettings[lessonId].autoOpenAt ?? '';
    });

    const previousAutoOpenDates = sortedLessons
      .slice(0, firstAutoScheduleIndex)
      .map((lesson, index) => lessonAutoOpenDates[index] || parseValidDate(getLessonScheduleValue(lesson._id)))
      .filter(Boolean);
    const latestPreviousAutoOpenAt = getLatestDate(previousAutoOpenDates);
    const firstLessonStartAt = latestPreviousAutoOpenAt
      ? addMinutes(latestPreviousAutoOpenAt, 60)
      : new Date();
    const sessions = getNextClassSessions(classDetail, lessonsToSchedule.length, firstLessonStartAt);

    if (sessions.length < lessonsToSchedule.length) {
      toast.error('Không đủ lịch học hợp lệ để cài tự động');
      return;
    }

    try {
      setLastAutoScheduleSnapshot({ lessonIds: snapshotLessonIds, settings: snapshotSettings, drafts: snapshotDrafts });
      const updates = [];
      for (const [index, lesson] of lessonsToSchedule.entries()) {
        const autoOpenAt = addMinutes(sessions[index].startAt, -60);
        const res = await api.patch(`/classes/${selectedClass._id}/lessons/${lesson._id}/toggle`, {
          autoOpenAt: autoOpenAt.toISOString(),
          isVisible: false,
        });
        updates.push(res);
      }

      const nextSettings = {};
      const nextDrafts = {};
      updates.forEach((res) => {
        const autoOpenAt = toLocalDatetimeInput(res.data.autoOpenAt);
        nextSettings[res.data.lessonId] = { isVisible: !!res.data.isVisible, autoOpenAt };
        nextDrafts[res.data.lessonId] = autoOpenAt;
      });
      setClassLessonSettings(prev => ({ ...prev, ...nextSettings }));
      setLessonScheduleDrafts(prev => ({ ...prev, ...nextDrafts }));
      toast.success(`Đã cài lịch tự mở cho ${updates.length} bài chưa có lịch`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không cài được lịch tự mở');
    }
  };

  const handleUndoAutoSchedule = async () => {
    if (!selectedClass?._id || !lastAutoScheduleSnapshot) return;

    try {
      const updates = [];
      for (const lessonId of lastAutoScheduleSnapshot.lessonIds) {
        const previous = lastAutoScheduleSnapshot.settings[lessonId] || { isVisible: false, autoOpenAt: '' };
        const payload = {
          isVisible: !!previous.isVisible,
          autoOpenAt: previous.autoOpenAt ? new Date(previous.autoOpenAt).toISOString() : null,
        };
        const res = await api.patch(`/classes/${selectedClass._id}/lessons/${lessonId}/toggle`, payload);
        updates.push(res);
      }

      const restoredSettings = {};
      const restoredDrafts = {};
      updates.forEach((res) => {
        const autoOpenAt = toLocalDatetimeInput(res.data.autoOpenAt);
        restoredSettings[res.data.lessonId] = { isVisible: !!res.data.isVisible, autoOpenAt };
        restoredDrafts[res.data.lessonId] = autoOpenAt;
      });
      setClassLessonSettings(prev => ({ ...prev, ...restoredSettings }));
      setLessonScheduleDrafts(prev => ({ ...prev, ...lastAutoScheduleSnapshot.drafts, ...restoredDrafts }));
      setLastAutoScheduleSnapshot(null);
      toast.success('Đã hoàn tác lịch tự mở');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không hoàn tác được lịch tự mở');
    }
  };

  const lessonReminders = activeTab === 'lessons'
    ? buildLessonReminders(classDetail || selectedClass, classLessonsMap, classLessonSettings, courses)
    : [];

  const handleUseReminderTime = (reminder) => {
    const lesson = reminder.nextLesson;
    if (!lesson) return;
    const courseId = reminder.courseId;
    const value = toLocalDatetimeInput(reminder.session.startAt);
    setExpandedCourses(prev => ({ ...prev, [courseId]: true }));
    setLessonScheduleDrafts(prev => ({ ...prev, [lesson._id]: value }));
    toast.success(`Đã điền giờ tự mở cho "${lesson.title}"`);
  };

  // --- Detail view UI ---
  if (selectedClass) {
    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => {
              setSelectedClass(null);
              setSearchParams({});
            }}
            className="btn-secondary flex items-center gap-2"
          >
            <FiArrowLeft /> Quay lại
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{selectedClass.name}</h1>
            <p className="text-sm text-gray-500">{selectedClass.description}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => { openEdit(selectedClass); }} className="btn-secondary flex items-center gap-1 text-sm">
              <FiEdit2 /> Sửa lớp
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b">
          {[['lessons', 'Bài học theo lớp'], ['students', 'Học sinh'], ['stats', 'Thống kê']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {detailLoading ? (
          <div className="text-center py-12 text-gray-500">Đang tải...</div>
        ) : (
          <>
            {/* Lessons tab */}
            {activeTab === 'lessons' && (
              <div className="space-y-4">
                {lastAutoScheduleSnapshot && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-medium text-amber-800">
                      Vừa cài lịch tự mở tự động. Có thể hoàn tác nếu nhấn nhầm.
                    </p>
                    <button
                      type="button"
                      onClick={handleUndoAutoSchedule}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
                    >
                      Hoàn tác
                    </button>
                  </div>
                )}
                {lessonReminders.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
                      <FiAlertCircle className="text-amber-600" />
                      Nhắc chuẩn bị bài học cho buổi sắp tới
                    </div>
                    <div className="space-y-2">
                      {lessonReminders.slice(0, 3).map((reminder) => (
                        <div
                          key={`${reminder.session.dayOfWeek}-${reminder.session.startAt.toISOString()}`}
                          className="flex flex-col gap-3 rounded-md border border-amber-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                              <FiCalendar className="shrink-0 text-amber-500" />
                              {formatSessionDate(reminder.session.startAt)} · {reminder.session.startTime} - {reminder.session.endTime}
                              {reminder.session.room ? ` · ${reminder.session.room}` : ''}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {reminder.nextLesson
                                ? `Chưa có bài nào được hẹn mở trong ngày này. Gợi ý: "${reminder.nextLesson.title}" (${reminder.courseTitle}).`
                                : `Khóa "${reminder.courseTitle}" chưa có bài học để hẹn cho lớp.`}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {reminder.nextLesson && (
                              <button
                                type="button"
                                onClick={() => handleUseReminderTime(reminder)}
                                className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                              >
                                Đặt giờ cho bài gợi ý
                              </button>
                            )}
                            {reminder.courseId && (
                              <Link
                                to={`/admin/lessons/new?course=${reminder.courseId}`}
                                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                              >
                                Tạo bài học
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(classDetail?.courses || []).length === 0 ? (
                  <div className="card p-8 text-center text-gray-500">
                    <FiBook size={40} className="mx-auto mb-3 text-gray-300" />
                    <p>Lớp này chưa có khóa học nào</p>
                  </div>
                ) : (classDetail?.courses || []).map(c => {
                  const courseId = (c._id || c).toString();
                  const courseTitle = c.title || courses.find(x => x._id === courseId)?.title || courseId;
                  const lessons = classLessonsMap[courseId] || [];
                  const isExpanded = expandedCourses[courseId];
                  return (
                    <div key={courseId} className="card overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                        onClick={() => toggleExpandCourse(courseId)}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <FiBook className="text-blue-500" />
                          <span className="font-semibold text-gray-900">{courseTitle}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            {lessons.filter(l => isLessonOpen(classLessonSettings[l._id])).length}/{lessons.length} bài đang bật
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleAutoScheduleCourseLessons(lessons);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                handleAutoScheduleCourseLessons(lessons);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          >
                            <FiCalendar size={13} /> Cài lịch tự mở
                          </span>
                        </div>
                        {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                      </button>
                      {isExpanded && (
                        <div className="border-t divide-y">
                          {lessons.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-gray-500">Khóa học này chưa có bài học nào</p>
                          ) : lessons.map((lesson, idx) => {
                            const setting = classLessonSettings[lesson._id] || { isVisible: false, autoOpenAt: '' };
                            const visible = isLessonOpen(setting);
                            const autoOpenValue = lessonScheduleDrafts[lesson._id] ?? setting.autoOpenAt;
                            return (
                              <div key={lesson._id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                                <span className="text-sm text-gray-400 w-6">{idx + 1}</span>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">{lesson.title}</p>
                                  <p className="text-xs text-gray-400">
                                    {lesson.duration ? `${lesson.duration} phút` : ''}
                                    {!lesson.isPublished ? ' · (chưa đăng toàn cục)' : ''}
                                    {setting.autoOpenAt ? ` · Tự mở lúc ${new Date(setting.autoOpenAt).toLocaleString('vi-VN')}` : ''}
                                  </p>
                                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                      type="datetime-local"
                                      value={autoOpenValue}
                                      onChange={(e) => setLessonScheduleDrafts(prev => ({ ...prev, [lesson._id]: e.target.value }))}
                                      className="w-full sm:w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveLessonSchedule(lesson._id, autoOpenValue)}
                                      className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                    >
                                      Lưu giờ tự mở
                                    </button>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <button
                                    onClick={() => handleToggleClassLesson(lesson._id)}
                                    title={visible ? 'Đang bật – Nhấn để tắt cho lớp này' : 'Đang tắt – Nhấn để bật cho lớp này'}
                                    className={`text-2xl transition-colors ${visible ? 'text-green-500 hover:text-green-700' : 'text-gray-300 hover:text-gray-500'}`}
                                  >
                                    {visible ? <FiToggleRight /> : <FiToggleLeft />}
                                  </button>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {visible ? 'Bật' : 'Tắt'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Students tab */}
            {activeTab === 'students' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    onClick={() => { setStudentSearch(''); setSearchResults([]); setShowAddStudent(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  ><FiUserPlus /> Thêm học sinh</button>
                </div>
                <div className="card overflow-hidden">
                  {classEnrollments.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <FiUsers size={40} className="mx-auto mb-3 text-gray-300" />
                      <p>Chưa có học sinh nào trong lớp</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {['#', 'Học sinh', 'Email', 'Ngày tham gia', ''].map(h => (
                            <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {classEnrollments.map((en, idx) => (
                          <tr key={en._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {en.student?.avatar ? (
                                  <img src={en.student.avatar} className="w-7 h-7 rounded-full object-cover" alt="" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                                    {en.student?.name?.[0]?.toUpperCase() || '?'}
                                  </div>
                                )}
                                <span className="font-medium text-gray-900">{en.student?.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-500">{en.student?.email}</td>
                            <td className="px-4 py-3 text-gray-400">{new Date(en.createdAt).toLocaleDateString('vi-VN')}</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => handleAdminRemoveStudent(en.student?._id, en.student?.name)}
                                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded px-2 py-1"
                              ><FiTrash2 /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Stats tab */}
            {activeTab === 'stats' && (
              <div className="space-y-4">
                {statsLoading ? (
                  <div className="text-center py-12 text-gray-500">Đang tải thống kê...</div>
                ) : !classStats ? (
                  <div className="card p-8 text-center text-gray-500">
                    <FiBarChart2 size={40} className="mx-auto mb-3 text-gray-300" />
                    <p>Chưa tải được thống kê</p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="card p-4">
                        <p className="text-xs font-medium uppercase text-gray-400">Học sinh</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">{classStats.students?.length || 0}</p>
                      </div>
                      <div className="card p-4">
                        <p className="text-xs font-medium uppercase text-gray-400">Bài tập</p>
                        <p className="mt-1 text-2xl font-bold text-blue-600">{classStats.homeworks?.length || 0}</p>
                      </div>
                      <div className="card p-4">
                        <p className="text-xs font-medium uppercase text-gray-400">Bài kiểm tra</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-600">{classStats.exams?.length || 0}</p>
                      </div>
                    </div>

                    <div className="card overflow-hidden">
                      {(classStats.students || []).length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <FiUsers size={40} className="mx-auto mb-3 text-gray-300" />
                          <p>Chưa có học sinh nào trong lớp</p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          <div className="hidden bg-gray-50 px-4 py-3 text-xs font-semibold uppercase text-gray-500 lg:grid lg:grid-cols-[240px_1fr_1fr_110px] lg:gap-4">
                            <span>Học sinh</span>
                            <span>Điểm bài tập</span>
                            <span>Điểm kiểm tra</span>
                            <span>Trung bình</span>
                          </div>
                          {classStats.students.map(student => (
                            <div key={student._id} className="grid gap-4 px-4 py-4 lg:grid-cols-[240px_1fr_1fr_110px] lg:items-center">
                              <div className="flex items-center gap-3">
                                {student.avatar ? (
                                  <img src={student.avatar} className="h-9 w-9 rounded-full object-cover" alt="" />
                                ) : (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                                    {student.name?.[0]?.toUpperCase() || '?'}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-gray-900">{student.name}</p>
                                  <p className="truncate text-xs text-gray-400">{student.email}</p>
                                </div>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-gray-500 lg:hidden">Điểm bài tập</p>
                                <StudentScoreChart scores={student.homeworkScores || []} color="blue" />
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-gray-500 lg:hidden">Điểm kiểm tra</p>
                                <StudentScoreChart scores={student.examScores || []} color="emerald" />
                              </div>
                              <div className="flex gap-2 lg:block">
                                <div className="rounded-lg bg-blue-50 px-3 py-2 text-center">
                                  <p className="text-[10px] font-medium uppercase text-blue-400">BT</p>
                                  <p className="text-sm font-bold text-blue-700">{formatScore(student.averageHomework)}</p>
                                </div>
                                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center lg:mt-2">
                                  <p className="text-[10px] font-medium uppercase text-emerald-400">KT</p>
                                  <p className="text-sm font-bold text-emerald-700">{formatScore(student.averageExam)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Edit modal */}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
                <h2 className="font-bold text-lg">Chỉnh sửa lớp học</h2>
                <button onClick={() => setModal(false)}><FiX /></button>
              </div>
              <form onSubmit={async (e) => { await handleSubmit(e); setSelectedClass(prev => ({ ...prev, ...form, feePerSession: form.feePerSession })); }} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên lớp *</label>
                  <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                  <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                    <input type="date" className="input-field" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                    <input type="date" className="input-field" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số học sinh tối đa</label>
                    <input type="number" className="input-field" value={form.maxStudents} onChange={e => setForm({ ...form, maxStudents: Number(e.target.value) })} min={1} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Học phí / buổi (VNĐ)</label>
                    <input type="number" className="input-field" value={form.feePerSession} onChange={e => setForm({ ...form, feePerSession: Number(e.target.value) })} min={0} />
                  </div>
                </div>
                {/* Courses */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Khóa học trong lớp</label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {courses.map(c => (
                      <label key={c._id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${form.courses.includes(c._id) ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}`}>
                        <input type="checkbox" checked={form.courses.includes(c._id)} onChange={() => toggleCourse(c._id)} />
                        <span className="truncate">{c.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Schedules */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Lịch học</label>
                  {form.schedules.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-blue-50 rounded-lg px-3 py-2 mb-2">
                      <span className="flex-1">{days[s.dayOfWeek]}: {s.startTime} - {s.endTime} {s.room && `(${s.room})`}</span>
                      <button type="button" onClick={() => removeSch(i)} className="text-red-500"><FiX /></button>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <select className="input-field text-sm" value={addSchedule.dayOfWeek} onChange={e => setAddSchedule({ ...addSchedule, dayOfWeek: Number(e.target.value) })}>
                      {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                    <input className="input-field text-sm" type="time" value={addSchedule.startTime} onChange={e => setAddSchedule({ ...addSchedule, startTime: e.target.value })} placeholder="Giờ bắt đầu" />
                    <input className="input-field text-sm" type="time" value={addSchedule.endTime} onChange={e => setAddSchedule({ ...addSchedule, endTime: e.target.value })} placeholder="Giờ kết thúc" />
                    <input className="input-field text-sm" value={addSchedule.room} onChange={e => setAddSchedule({ ...addSchedule, room: e.target.value })} placeholder="Phòng học" />
                  </div>
                  <button type="button" onClick={addSch} className="btn-secondary text-sm mt-2 w-full">+ Thêm lịch</button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
                  <span className="text-sm font-medium text-gray-700">Đang hoạt động</span>
                </label>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Hủy</button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Đang lưu...' : 'Lưu'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Student Modal */}
        {showAddStudent && (() => {
          const enrolledIds = new Set(classEnrollments.map(en => en.student?._id || en.student));
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAddStudent(false)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                    <FiUserPlus /> Thêm học sinh — {selectedClass.name}
                  </h2>
                  <button onClick={() => setShowAddStudent(false)} className="text-gray-400 hover:text-gray-700"><FiX /></button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      type="text"
                      className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Tìm theo tên hoặc email..."
                      value={studentSearch}
                      onChange={e => handleStudentSearch(e.target.value)}
                    />
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y rounded-lg border border-gray-100">
                    {searchLoading && (
                      <p className="text-center text-sm text-gray-400 py-6">Đang tìm...</p>
                    )}
                    {!searchLoading && studentSearch && searchResults.length === 0 && (
                      <p className="text-center text-sm text-gray-400 py-6">Không tìm thấy học sinh</p>
                    )}
                    {!searchLoading && !studentSearch && (
                      <p className="text-center text-sm text-gray-400 py-6">Nhập tên hoặc email để tìm học sinh</p>
                    )}
                    {searchResults.map(u => {
                      const alreadyIn = enrolledIds.has(u._id);
                      return (
                        <div key={u._id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                          {u.avatar ? (
                            <img src={u.avatar} className="w-8 h-8 rounded-full object-cover" alt="" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold">
                              {u.name?.[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                            <p className="text-xs text-gray-400 truncate">{u.email}</p>
                          </div>
                          {alreadyIn ? (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium whitespace-nowrap">Đã trong lớp</span>
                          ) : (
                            <button
                              onClick={() => handleAdminAddStudent(u._id)}
                              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                            >+ Thêm</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // --- List view ---
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý lớp học</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><FiPlus /> Thêm lớp học</button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(cls => (
          <div
            key={cls._id}
            className="card p-5 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              setSearchParams({ classId: cls._id, tab: 'lessons' });
              openClassDetail(cls);
            }}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-gray-900">{cls.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {cls.isActive ? 'Đang hoạt động' : 'Đã kết thúc'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-3">{cls.description}</p>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
              
              <FiUsers /> <span>{cls.students.length || 0}/{cls.maxStudents} học sinh</span>
            </div>
            {cls.schedules?.length > 0 && (
              <div className="text-xs text-gray-500 mb-3">
                {cls.schedules.map((s, i) => (
                  <div key={i}>{days[s.dayOfWeek]}: {s.startTime} - {s.endTime} {s.room && `(${s.room})`}</div>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-400 mb-3">{cls.courses?.length || 0} khóa học</div>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <button onClick={() => openEdit(cls)} className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1">
                <FiEdit2 /> Sửa
              </button>
              <button onClick={() => handleDelete(cls._id)} className="btn-danger text-sm px-3"><FiTrash2 /></button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-lg">{editId ? 'Chỉnh sửa' : 'Tạo'} lớp học</h2>
              <button onClick={() => setModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên lớp *</label>
                <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                  <input type="date" className="input-field" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                  <input type="date" className="input-field" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số học sinh tối đa</label>
                <input type="number" className="input-field" value={form.maxStudents} onChange={e => setForm({ ...form, maxStudents: Number(e.target.value) })} min={1} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Học phí / buổi (VNĐ)</label>
                <input type="number" className="input-field" value={form.feePerSession} onChange={e => setForm({ ...form, feePerSession: Number(e.target.value) })} min={0} />
              </div>

              {/* Courses */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Khóa học trong lớp</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {courses.map(c => (
                    <label key={c._id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${form.courses.includes(c._id) ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}`}>
                      <input type="checkbox" checked={form.courses.includes(c._id)} onChange={() => toggleCourse(c._id)} />
                      <span className="truncate">{c.title}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Schedules */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Lịch học</label>
                {form.schedules.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-blue-50 rounded-lg px-3 py-2 mb-2">
                    <span className="flex-1">{days[s.dayOfWeek]}: {s.startTime} - {s.endTime} {s.room && `(${s.room})`}</span>
                    <button type="button" onClick={() => removeSch(i)} className="text-red-500"><FiX /></button>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select className="input-field text-sm" value={addSchedule.dayOfWeek} onChange={e => setAddSchedule({ ...addSchedule, dayOfWeek: Number(e.target.value) })}>
                    {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <input className="input-field text-sm" type="time" value={addSchedule.startTime} onChange={e => setAddSchedule({ ...addSchedule, startTime: e.target.value })} placeholder="Giờ bắt đầu" />
                  <input className="input-field text-sm" type="time" value={addSchedule.endTime} onChange={e => setAddSchedule({ ...addSchedule, endTime: e.target.value })} placeholder="Giờ kết thúc" />
                  <input className="input-field text-sm" value={addSchedule.room} onChange={e => setAddSchedule({ ...addSchedule, room: e.target.value })} placeholder="Phòng học" />
                </div>
                <button type="button" onClick={addSch} className="btn-secondary text-sm mt-2 w-full">+ Thêm lịch</button>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm font-medium text-gray-700">Đang hoạt động</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Hủy</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Đang lưu...' : 'Lưu'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
