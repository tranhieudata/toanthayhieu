import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { FiUsers, FiBook, FiTrendingUp, FiCalendar } from 'react-icons/fi';

// ─── Weekly Schedule ─────────────────────────────────────────────────────────

const DAYS = [
  { key: 1, label: 'Thứ 2' },
  { key: 2, label: 'Thứ 3' },
  { key: 3, label: 'Thứ 4' },
  { key: 4, label: 'Thứ 5' },
  { key: 5, label: 'Thứ 6' },
  { key: 6, label: 'Thứ 7' },
  { key: 0, label: 'CN' },
];

const START_HOUR = 6;
const END_HOUR = 22;
const TOTAL_MIN = (END_HOUR - START_HOUR) * 60;
const GRID_H = 640;
const PX_PER_MIN = GRID_H / TOTAL_MIN;

const CLASS_COLORS = [
  'bg-blue-500 border-blue-700',
  'bg-emerald-500 border-emerald-700',
  'bg-violet-500 border-violet-700',
  'bg-orange-500 border-orange-700',
  'bg-rose-500 border-rose-700',
  'bg-teal-500 border-teal-700',
  'bg-pink-500 border-pink-700',
  'bg-indigo-400 border-indigo-600',
  'bg-amber-500 border-amber-700',
  'bg-cyan-500 border-cyan-700',
];

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function WeeklySchedule({ classes }) {
  const today = new Date().getDay();

  const colorMap = {};
  classes.forEach((cls, i) => { colorMap[cls._id] = CLASS_COLORS[i % CLASS_COLORS.length]; });

  const events = [];
  classes.forEach((cls) => {
    (cls.schedules || []).forEach((sch) => {
      if (!sch.startTime || !sch.endTime) return;
      const s = timeToMin(sch.startTime) - START_HOUR * 60;
      const e = timeToMin(sch.endTime) - START_HOUR * 60;
      if (e <= s) return;
      events.push({
        classId: cls._id, className: cls.name,
        dayOfWeek: sch.dayOfWeek,
        startTime: sch.startTime, endTime: sch.endTime, room: sch.room,
        top: Math.max(0, s) * PX_PER_MIN,
        height: Math.max(28, (e - Math.max(0, s)) * PX_PER_MIN - 2),
        color: colorMap[cls._id],
      });
    });
  });

  const hourTicks = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => ({
    h: START_HOUR + i,
    top: i * 60 * PX_PER_MIN,
  }));

  const classesWithSchedule = classes.filter((c) => (c.schedules || []).length > 0);

  if (classesWithSchedule.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        <FiCalendar className="mx-auto text-3xl mb-2 text-gray-300" />
        Chưa có lịch học nào. Thêm lịch trong phần <Link to="/admin/classes" className="text-blue-500 underline">Lớp học</Link>.
      </div>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {classesWithSchedule.map((cls, i) => (
          <span key={cls._id} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full text-white font-medium ${CLASS_COLORS[i % CLASS_COLORS.length].split(' ')[0]}`}>
            {cls.name}
            <span className="opacity-75 font-normal">· {cls.students?.length ?? 0} hs</span>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        {/* Day headers */}
        <div className="flex min-w-[580px] bg-gray-50 border-b border-gray-200">
          <div className="w-12 shrink-0" />
          {DAYS.map((d) => (
            <div
              key={d.key}
              className={`flex-1 text-center py-2.5 border-l border-gray-200 ${d.key === today ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}
            >
              <div className="text-xs font-bold">{d.label}</div>
              {d.key === today && <div className="text-blue-400" style={{ fontSize: 9 }}>Hôm nay</div>}
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="flex min-w-[580px]">
          {/* Time axis */}
          <div className="w-12 shrink-0 bg-gray-50 relative border-r border-gray-200" style={{ height: GRID_H }}>
            {hourTicks.map(({ h, top }) => (
              <div key={h} className="absolute text-gray-400 text-right pr-1.5 leading-none" style={{ top: top - 5, left: 0, right: 0, fontSize: 9 }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((d) => {
            const isToday = d.key === today;
            const dayEvs = events.filter((e) => e.dayOfWeek === d.key);
            return (
              <div key={d.key} className={`flex-1 relative border-l border-gray-200 ${isToday ? 'bg-blue-50/40' : 'bg-white'}`} style={{ height: GRID_H }}>
                {hourTicks.map(({ h, top }) => (
                  <div key={h} className={`absolute left-0 right-0 border-t ${h % 2 === 0 ? 'border-gray-200' : 'border-gray-100'}`} style={{ top }} />
                ))}
                {dayEvs.map((ev, ei) => (
                  <div
                    key={ei}
                    title={`${ev.className}  ${ev.startTime}–${ev.endTime}${ev.room ? `\n📍 ${ev.room}` : ''}`}
                    className={`absolute left-0.5 right-0.5 rounded-md border-l-[3px] px-1.5 py-1 overflow-hidden text-white ${ev.color}`}
                    style={{ top: ev.top, height: ev.height, fontSize: 10, lineHeight: 1.35 }}
                  >
                    <div className="font-bold truncate">{ev.className}</div>
                    <div className="opacity-90">{ev.startTime}–{ev.endTime}</div>
                    {ev.room && ev.height > 56 && <div className="opacity-70 truncate">📍 {ev.room}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalUsers: 0, totalCourses: 0, totalEnrollments: 0 });
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    api.get('/users/admin/stats').then((res) => setStats(res.data)).catch(() => {});
    api.get('/classes').then((res) => setClasses(res.data)).catch(() => {});
  }, []);

  const cards = [
    { icon: <FiBook className="text-green-600 text-3xl" />, label: 'Quản lý nội dung', value: stats.totalCourses, to: '/admin/content', bg: 'bg-green-50 border-green-200' },
    { icon: <FiUsers className="text-blue-600 text-3xl" />, label: 'Học sinh', value: stats.totalUsers, to: '/admin/students', bg: 'bg-blue-50 border-blue-200' },
    { icon: <FiTrendingUp className="text-purple-600 text-3xl" />, label: 'Đăng ký học', value: stats.totalEnrollments, to: '/admin/enrollments', bg: 'bg-purple-50 border-purple-200' },
    { icon: <FiCalendar className="text-orange-600 text-3xl" />, label: 'Lớp học', value: classes.length, to: '/admin/classes', bg: 'bg-orange-50 border-orange-200' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tổng quan</h1>

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

      {/* Weekly schedule */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FiCalendar className="text-blue-500" />
          Lịch dạy theo tuần
        </h2>
        <WeeklySchedule classes={classes} />
      </div>

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
