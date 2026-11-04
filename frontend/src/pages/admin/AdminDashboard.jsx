import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import WeeklyTeachingSchedule from '../../components/WeeklyTeachingSchedule';
import { FiUsers, FiBook, FiTrendingUp, FiCalendar, FiLogIn, FiUserCheck, FiUserX, FiClock, FiBell, FiAlertCircle } from 'react-icons/fi';

// ─── Weekly Schedule ─────────────────────────────────────────────────────────

function combineDateAndTime(date, time) {
  const [hours = 0, minutes = 0] = (time || '00:00').split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function isLessonOpen(setting) {
  if (!setting) return false;
  if (setting.isVisible) return true;
  return !!setting.autoOpenAt && new Date(setting.autoOpenAt) <= new Date();
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatSessionDate(date) {
  return date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
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

function buildReminderList(classes, lessonsByCourse) {
  return classes.flatMap((cls) => {
    if (!(cls?.courses || []).length) return [];

    const lessonSettings = {};
    (cls.lessonVisibility || []).forEach((setting) => {
      const lessonId = (setting.lesson?._id || setting.lesson)?.toString();
      if (lessonId) lessonSettings[lessonId] = setting;
    });

    return getUpcomingClassSessions(cls).map((session) => {
      const courseOptions = (cls.courses || []).map((course) => {
        const courseId = (course._id || course).toString();
        const lessons = lessonsByCourse[courseId] || [];
        return {
          courseId,
          courseTitle: course.title || courseId,
          lessons,
          nextLesson: lessons.find((lesson) => !isLessonOpen(lessonSettings[lesson._id])),
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
        classId: cls._id,
        className: cls.name,
        session,
        courseTitle: suggested?.courseTitle || '',
        nextLessonTitle: suggested?.nextLesson?.title || '',
      };
    }).filter(Boolean);
  }).sort((a, b) => a.session.startAt - b.session.startAt);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    loggedInToday: 0,
    todayLoginUsers: [],
    totalCourses: 0,
    totalEnrollments: 0,
  });
  const [classes, setClasses] = useState([]);
  const [lessonsByCourse, setLessonsByCourse] = useState({});

  useEffect(() => {
    api.get('/users/admin/stats').then((res) => setStats(res.data)).catch(() => {});
    api.get('/classes').then((res) => setClasses(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const courseIds = [...new Set(classes.flatMap((cls) =>
      (cls.courses || []).map((course) => (course._id || course).toString())
    ))];
    if (!courseIds.length) {
      setLessonsByCourse({});
      return;
    }

    Promise.all(courseIds.map(async (courseId) => {
      const { data } = await api.get(`/lessons?course=${courseId}`);
      return [courseId, data || []];
    }))
      .then((entries) => setLessonsByCourse(Object.fromEntries(entries)))
      .catch(() => setLessonsByCourse({}));
  }, [classes]);

  const lessonReminders = buildReminderList(classes, lessonsByCourse);

  const cards = [
    { icon: <FiBook className="text-green-600 text-3xl" />, label: 'Quản lý nội dung', value: stats.totalCourses, to: '/admin/content', bg: 'bg-green-50 border-green-200' },
    { icon: <FiUsers className="text-blue-600 text-3xl" />, label: 'Học sinh', value: stats.totalUsers, to: '/admin/students', bg: 'bg-blue-50 border-blue-200' },
    { icon: <FiLogIn className="text-emerald-600 text-3xl" />, label: 'Login hôm nay', value: stats.loggedInToday, to: '/admin/students', bg: 'bg-emerald-50 border-emerald-200' },
    { icon: <FiUserCheck className="text-cyan-600 text-3xl" />, label: 'Đang hoạt động', value: stats.activeUsers, to: '/admin/students', bg: 'bg-cyan-50 border-cyan-200' },
    { icon: <FiUserX className="text-rose-600 text-3xl" />, label: 'Bị khóa', value: stats.inactiveUsers, to: '/admin/students', bg: 'bg-rose-50 border-rose-200' },
    { icon: <FiTrendingUp className="text-purple-600 text-3xl" />, label: 'Đăng ký học', value: stats.totalEnrollments, to: '/admin/enrollments', bg: 'bg-purple-50 border-purple-200' },
    { icon: <FiCalendar className="text-orange-600 text-3xl" />, label: 'Lớp học', value: classes.length, to: '/admin/classes', bg: 'bg-orange-50 border-orange-200' },
  ];

  const formatLoginTime = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tổng quan</h1>

      <div className="card mb-6 overflow-hidden border border-amber-200">
        <div className="flex items-center justify-between gap-3 bg-amber-50 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-amber-900">
            <FiBell className="text-amber-600" />
            Nhắc tạo bài học
          </h2>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
            {lessonReminders.length} nhắc
          </span>
        </div>
        {lessonReminders.length > 0 ? (
          <div className="divide-y divide-amber-100">
            {lessonReminders.slice(0, 5).map((reminder) => (
              <Link
                key={`${reminder.classId}-${reminder.session.startAt.toISOString()}`}
                to={`/admin/classes?classId=${reminder.classId}&tab=lessons`}
                className="flex flex-col gap-2 px-5 py-3 hover:bg-amber-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <FiAlertCircle className="shrink-0 text-amber-500" />
                    {reminder.className}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatSessionDate(reminder.session.startAt)} · {reminder.session.startTime}-{reminder.session.endTime}
                    {reminder.session.room ? ` · ${reminder.session.room}` : ''}
                  </p>
                </div>
                <p className="text-xs text-amber-700 sm:text-right">
                  {reminder.nextLessonTitle
                    ? `Gợi ý: ${reminder.nextLessonTitle}`
                    : `Cần tạo bài cho ${reminder.courseTitle || 'khóa học'}`}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-5 py-4 text-sm text-gray-500">Chưa có lớp nào cần nhắc tạo bài trong 3 ngày tới.</div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} className={`card p-5 border flex items-center gap-4 hover:shadow-md transition-shadow ${card.bg}`}>
            {card.icon}
            <div>
              <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              <div className="text-sm text-gray-600">{card.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FiLogIn className="text-emerald-500" />
            Học sinh login hôm nay
          </h2>
          <span className="text-sm text-gray-500">{stats.loggedInToday || 0} học sinh</span>
        </div>

        {stats.todayLoginUsers?.length ? (
          <div className="divide-y divide-gray-100">
            {stats.todayLoginUsers.map((user) => (
              <div key={user._id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold">
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{user.name}</div>
                    <div className="text-xs text-gray-500 truncate">{user.email}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-gray-800 flex items-center justify-end gap-1">
                    <FiClock className="text-gray-400" />
                    {formatLoginTime(user.lastLoginAt)}
                  </div>
                  <div className="text-xs text-gray-400">{user.loginCount || 0} lần login</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-gray-400">Chưa có học sinh nào login hôm nay.</div>
        )}
      </div>

      <WeeklyTeachingSchedule classes={classes} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Thao tác nhanh</h2>
          <div className="space-y-2">
            <Link to="/admin/content" className="block p-3 rounded-lg hover:bg-gray-50 text-sm text-blue-600">📚 Quản lý khóa học, bài học & bài tập</Link>
            <Link to="/admin/classes" className="block p-3 rounded-lg hover:bg-gray-50 text-sm text-blue-600">+ Tạo lớp học mới</Link>
            <Link to="/admin/enrollments" className="block p-3 rounded-lg hover:bg-gray-50 text-sm text-blue-600">✓ Xét duyệt đơn tham gia lớp</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
