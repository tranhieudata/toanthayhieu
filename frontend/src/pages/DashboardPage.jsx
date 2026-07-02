import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import {
  FiBookOpen, FiAward, FiTrendingUp, FiLayers, FiClock,
  FiCheckCircle, FiXCircle, FiChevronDown, FiChevronRight,
  FiPlay, FiLock, FiBook, FiClipboard,
} from 'react-icons/fi';

// ─── Biểu đồ đường tiến độ điểm ────────────────────────────────────────────
function ProgressLineChart({ data }) {
  const [hov, setHov] = useState(null);

  const W = 600, H = 220;
  const pL = 44, pR = 16, pT = 24, pB = 48;
  const cW = W - pL - pR;
  const cH = H - pT - pB;

  const n = data.length;
  const getX = i => n > 1 ? pL + (i / (n - 1)) * cW : pL + cW / 2;
  const getY = v => pT + cH - (v / 10) * cH;
  const scoreColor = v => v >= 9 ? '#7c3aed' : v >= 8 ? '#22c55e' : v >= 7 ? '#3b82f6' : v >= 5 ? '#f59e0b' : v >= 4 ? '#f97316' : '#ef4444';
  const scoreLabel = v => v >= 9 ? 'Xuất sắc' : v >= 8 ? 'Giỏi' : v >= 7 ? 'Khá' : v >= 5 ? 'Trung bình' : v >= 4 ? 'Yếu' : 'Kém';

  const grid = [0, 2.5, 5, 7.5, 10];

  // Tính tọa độ điểm
  const ptObjs = data.map((d, i) => ({ x: getX(i), y: getY(d.score10) }));

  // Catmull-Rom → cubic bezier, tension 0.35
  const smoothPath = (pts) => {
    if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x},${pts[0].y}` : '';
    const t = 0.35;
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) * t;
      const cp1y = p1.y + (p2.y - p0.y) * t;
      const cp2x = p2.x - (p3.x - p1.x) * t;
      const cp2y = p2.y - (p3.y - p1.y) * t;
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const linePath = smoothPath(ptObjs);
  const areaPath = n > 1
    ? `${linePath} L ${ptObjs[n - 1].x.toFixed(1)},${(pT + cH).toFixed(1)} L ${ptObjs[0].x.toFixed(1)},${(pT + cH).toFixed(1)} Z`
    : '';

  const fmtD = d => {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  };
  const fmtFull = d => {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  if (n === 0) return (
    <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-1">
      <FiTrendingUp size={28} className="text-gray-300" />
      Chưa có bài kiểm tra hoặc bài tập nào được chấm điểm
    </div>
  );

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
          <filter id="pgShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Grid + Y labels */}
        {grid.map(p => (
          <g key={p}>
            <line x1={pL} y1={getY(p)} x2={W - pR} y2={getY(p)}
              stroke={p === 0 ? '#d1d5db' : '#f3f4f6'} strokeWidth={p === 0 ? 1.5 : 1} />
            <text x={pL - 6} y={getY(p) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{p}</text>
          </g>
        ))}

        {/* Area fill */}
        {n > 1 && <path d={areaPath} fill="url(#pgGrad)" />}

        {/* Line smooth */}
        {n > 1 && (
          <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Dots, labels, tooltip */}
        {data.map((d, i) => {
          const cx = getX(i), cy = getY(d.score10);
          const col = scoreColor(d.score10);
          const isHov = hov === i;
          const ttW = 160, ttH = 58;
          let tx = cx - ttW / 2;
          if (tx < pL) tx = pL;
          if (tx + ttW > W - pR) tx = W - pR - ttW;
          const ty = cy - ttH - 12 < pT ? cy + 12 : cy - ttH - 12;

          return (
            <g key={i} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
              {/* invisible hover area */}
              <circle cx={cx} cy={cy} r={16} fill="transparent" />
              {/* dot */}
              <circle cx={cx} cy={cy} r={isHov ? 7 : 5} fill="white"
                stroke={col} strokeWidth="2.5"
                filter={isHov ? 'url(#pgShadow)' : undefined} />
              {/* x-axis date */}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">
                {fmtD(d.date)}
              </text>
              {/* score label above dot (always visible) */}
              <text x={cx} y={cy - 9} textAnchor="middle" fontSize="10"
                fontWeight="600" fill={col}>{d.score10}/10</text>

              {/* tooltip on hover */}
              {isHov && (
                <g>
                  <rect x={tx} y={ty} width={ttW} height={ttH} rx="6"
                    fill="white" filter="url(#pgShadow)" stroke="#e5e7eb" strokeWidth="1" />
                  <text x={tx + ttW / 2} y={ty + 16} textAnchor="middle"
                    fontSize="11" fontWeight="bold" fill={col}>
                    {d.score10}/10 — {scoreLabel(d.score10)}
                  </text>
                  <text x={tx + ttW / 2} y={ty + 31} textAnchor="middle"
                    fontSize="10" fill="#6b7280">
                    {d.title.length > 22 ? d.title.slice(0, 20) + '…' : d.title}
                  </text>
                  <text x={tx + ttW / 2} y={ty + 47} textAnchor="middle"
                    fontSize="9.5" fill="#9ca3af">
                    {d.typeLabel || 'Kết quả'} · {fmtFull(d.date)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const CLASS_STATUS_LABEL = { pending: 'Chờ duyệt', approved: 'Đã vào lớp', rejected: 'Bị từ chối' };
const CLASS_STATUS_COLOR = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};
const CLASS_STATUS_ICON = {
  pending: <FiClock className="inline mr-1" />,
  approved: <FiCheckCircle className="inline mr-1" />,
  rejected: <FiXCircle className="inline mr-1" />,
};

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [classEnrollments, setClassEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [homeworkSubmissions, setHomeworkSubmissions] = useState({});
  const [chartFilter, setChartFilter] = useState('all'); // 'all' | 'month' | 'range'
  const [filterMonth, setFilterMonth] = useState('');    // YYYY-MM
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // expandedCourses: { `${classId}_${courseId}`: lessons[] | 'loading' | null }
  const [expandedCourses, setExpandedCourses] = useState({});

  useEffect(() => {
    api.get('/class-enrollments/my')
      .then(res => setClassEnrollments(res.data))
      .finally(() => setLoading(false));
    api.get('/exams/student')
      .then(r => setExams(r.data || []))
      .catch(err => console.error('[Dashboard] exams/student error:', err?.response?.data || err.message));
    api.get('/homeworks/student/list')
      .then(async (r) => {
        const homeworkList = r.data || [];
        setHomeworks(homeworkList);

        const submissionPairs = await Promise.all(
          homeworkList.map(async (homework) => {
            try {
              const { data } = await api.get(`/homeworks/${homework._id}/my-submission`);
              return [homework._id, data];
            } catch {
              return [homework._id, null];
            }
          })
        );
        setHomeworkSubmissions(Object.fromEntries(submissionPairs));
      })
      .catch(err => console.error('[Dashboard] homeworks/student/list error:', err?.response?.data || err.message));
  }, []);

  // Lấy thời gian tạo từ ObjectId (fallback cho record cũ không có createdAt)
  const dateFromObjId = id => new Date(parseInt(id.substring(0, 8), 16) * 1000);

  // Dữ liệu biểu đồ tiến độ
  const examChartData = exams
    .filter(e => e.myResult?.status === 'graded')
    .map(e => ({
      date: new Date(e.myResult.gradedAt || e.myResult.createdAt || dateFromObjId(e.myResult._id)),
      score10: e.myResult.maxScore > 0 ? Math.round((e.myResult.totalScore / e.myResult.maxScore) * 100) / 10 : 0,
      title: e.title,
      score: e.myResult.totalScore,
      maxScore: e.myResult.maxScore,
      type: 'exam',
      typeLabel: 'Bài kiểm tra',
    }))
    .filter(e => !isNaN(e.date.getTime()));

  const homeworkChartData = homeworks
    .map(homework => {
      const submission = homeworkSubmissions[homework._id];
      const score = Number(submission?.score);
      const maxScore = Number(submission?.maxScore || homework.maxScore || 10);
      if (submission?.status !== 'graded' || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
        return null;
      }

      return {
        date: new Date(submission.gradedAt || submission.updatedAt || submission.submittedAt || homework.createdAt),
        score10: Math.round((score / maxScore) * 100) / 10,
        title: homework.title,
        score,
        maxScore,
        type: 'homework',
        typeLabel: 'Bài tập về nhà',
      };
    })
    .filter(Boolean)
    .filter(e => !isNaN(e.date.getTime()));

  const chartData = [...examChartData, ...homeworkChartData]
    .sort((a, b) => a.date - b.date);

  const filteredChartData = chartData.filter(e => {
    if (chartFilter === 'month' && filterMonth) {
      const ym = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
      return ym === filterMonth;
    }
    if (chartFilter === 'range') {
      if (filterFrom && e.date < new Date(filterFrom)) return false;
      if (filterTo && e.date > new Date(filterTo + 'T23:59:59')) return false;
    }
    return true;
  });

  const approvedCount = classEnrollments.filter(e => e.status === 'approved').length;
  const totalCourses = classEnrollments
    .filter(e => e.status === 'approved')
    .reduce((sum, e) => sum + (e.class?.courses?.length || 0), 0);

  const toggleCourse = async (classId, courseId, key) => {
    if (expandedCourses[key] !== undefined) {
      // đóng nếu đã mở
      setExpandedCourses(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    // mở và fetch bài học
    setExpandedCourses(prev => ({ ...prev, [key]: 'loading' }));
    try {
      const res = await api.get(`/lessons?course=${courseId}`);
      setExpandedCourses(prev => ({ ...prev, [key]: res.data }));
    } catch {
      setExpandedCourses(prev => ({ ...prev, [key]: [] }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Profile header */}
        <div className="flex items-center gap-4 mb-8">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chào, {user?.name}!</h1>
            <p className="text-gray-500">{user?.email}</p>
          </div>
        </div>

        {!isAdmin && (
          <div className="grid grid-cols-2 gap-3 mb-8 md:hidden">
            <Link
              to="/homeworks"
              className="bg-white rounded-xl border border-blue-100 shadow-sm p-4 flex flex-col items-center gap-2 text-center active:scale-[0.98] transition"
            >
              <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <FiBookOpen size={22} />
              </div>
              <span className="text-sm font-semibold text-gray-900">Bài tập</span>
            </Link>
            <Link
              to="/exams"
              className="bg-white rounded-xl border border-indigo-100 shadow-sm p-4 flex flex-col items-center gap-2 text-center active:scale-[0.98] transition"
            >
              <div className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FiClipboard size={22} />
              </div>
              <span className="text-sm font-semibold text-gray-900">Đề kiểm tra</span>
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { icon: <FiLayers className="text-blue-600 text-2xl" />, label: 'Lớp học đang tham gia', value: approvedCount, bg: 'bg-blue-50' },
            { icon: <FiBookOpen className="text-purple-600 text-2xl" />, label: 'Khóa học trong lớp', value: totalCourses, bg: 'bg-purple-50' },
            { icon: <FiAward className="text-yellow-600 text-2xl" />, label: 'Đang chờ duyệt', value: classEnrollments.filter(e => e.status === 'pending').length, bg: 'bg-yellow-50' },
          ].map(s => (
            <div key={s.label} className={`card p-5 flex items-center gap-4 ${s.bg}`}>
              {s.icon}
              <div>
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                <div className="text-sm text-gray-600">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Progress Chart */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FiTrendingUp className="text-blue-600" /> Biểu đồ tiến độ điểm kiểm tra và bài tập
            </h2>
            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {[['all', 'Tất cả'], ['month', 'Theo tháng'], ['range', 'Khoảng ngày']].map(([val, label]) => (
                <button key={val} onClick={() => setChartFilter(val)}
                  className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                    chartFilter === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}>{label}</button>
              ))}
              {chartFilter === 'month' && (
                <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              )}
              {chartFilter === 'range' && (
                <div className="flex items-center gap-1">
                  <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <span className="text-gray-400 text-xs">→</span>
                  <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              )}
            </div>
          </div>
          <ProgressLineChart data={filteredChartData} />
          {filteredChartData.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-400 justify-end">
              <span className="font-medium text-gray-500">Gồm bài kiểm tra và bài tập về nhà</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{background:'#7c3aed'}} /> 9–10 Xuất sắc</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> 8–8.9 Giỏi</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> 7–7.9 Khá</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> 5–6.9 Trung bình</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{background:'#f97316'}} /> 4–4.9 Yếu</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> &lt;4 Kém</span>
            </div>
          )}
        </div>

        {/* Classes */}
        <h2 className="text-xl font-bold text-gray-900 mb-4">Lớp học của tôi</h2>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="card animate-pulse h-28" />)}
          </div>
        ) : classEnrollments.length === 0 ? (
          <div className="card text-center py-12">
            <FiLayers className="text-4xl text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Bạn chưa đăng ký lớp học nào</p>
            <Link to="/classes" className="btn-primary">Đăng ký lớp học ngay</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {classEnrollments.map(enrollment => {
              const cls = enrollment.class;
              const isPending = enrollment.status === 'pending';
              const isRejected = enrollment.status === 'rejected';
              const isApproved = enrollment.status === 'approved';

              return (
                <div key={enrollment._id} className="card overflow-hidden">
                  {/* Class header */}
                  <div className="p-5 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{cls?.name || 'Lớp học'}</h3>
                      {cls?.description && <p className="text-sm text-gray-500 mt-0.5">{cls.description}</p>}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${CLASS_STATUS_COLOR[enrollment.status]}`}>
                      {CLASS_STATUS_ICON[enrollment.status]}{CLASS_STATUS_LABEL[enrollment.status]}
                    </span>
                  </div>

                  {/* Pending */}
                  {isPending && (
                    <div className="px-5 pb-5">
                      <p className="text-sm text-yellow-600 bg-yellow-50 rounded-lg px-4 py-3">
                        Đơn đăng ký đang chờ admin xét duyệt. Nội dung sẽ mở sau khi được duyệt.
                      </p>
                    </div>
                  )}

                  {/* Rejected */}
                  {isRejected && (
                    <div className="px-5 pb-5 flex items-center justify-between">
                      <p className="text-sm text-red-500">Đơn đăng ký bị từ chối.</p>
                      <Link to="/classes" className="text-sm text-blue-600 hover:underline">Đăng ký lớp khác →</Link>
                    </div>
                  )}

                  {/* Approved - show courses */}
                  {isApproved && cls?.courses?.length > 0 && (
                    <div className="border-t divide-y">
                      {cls.courses.map(course => {
                        const key = `${enrollment._id}_${course._id}`;
                        const expanded = expandedCourses[key];
                        const isOpen = expanded !== undefined;
                        const isLoading = expanded === 'loading';
                        const lessons = Array.isArray(expanded) ? expanded : [];

                        return (
                          <div key={course._id}>
                            {/* Course row */}
                            <button
                              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                              onClick={() => toggleCourse(enrollment._id, course._id, key)}
                            >
                              {course.thumbnail ? (
                                <img src={course.thumbnail} alt={course.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                  <FiBook className="text-blue-600" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 text-sm">{course.title}</p>
                                <p className="text-xs text-gray-400">
                                  {isOpen && !isLoading
                                    ? `${lessons.length} bài học mở`
                                    : `${course.totalLessons || 0} bài học`}
                                </p>
                              </div>
                              {isLoading ? (
                                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                              ) : isOpen ? (
                                <FiChevronDown className="text-gray-400 flex-shrink-0" />
                              ) : (
                                <FiChevronRight className="text-gray-400 flex-shrink-0" />
                              )}
                            </button>

                            {/* Lessons list */}
                            {isOpen && !isLoading && (
                              <div className="bg-gray-50 border-t divide-y divide-gray-100">
                                {lessons.length === 0 ? (
                                  <div className="flex items-center gap-2 px-6 py-3 text-sm text-gray-400">
                                    <FiLock className="text-gray-300" />
                                    Chưa có bài học nào được mở cho lớp của bạn
                                  </div>
                                ) : lessons.map((lesson, idx) => (
                                  <Link
                                    key={lesson._id}
                                    to={`/lesson/${lesson._id}`}
                                    className="flex items-center gap-3 px-6 py-2.5 hover:bg-blue-50 transition-colors group"
                                  >
                                    <span className="text-xs text-gray-300 w-5 flex-shrink-0">{idx + 1}</span>
                                    <FiPlay className="text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" size={12} />
                                    <span className="text-sm text-gray-700 group-hover:text-blue-600 flex-1">{lesson.title}</span>
                                    {lesson.duration && (
                                      <span className="text-xs text-gray-400 flex-shrink-0">{lesson.duration} phút</span>
                                    )}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isApproved && (!cls?.courses || cls.courses.length === 0) && (
                    <div className="px-5 pb-5">
                      <p className="text-sm text-gray-400">Lớp này chưa có khóa học nào.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
