import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { FiBookOpen, FiClock, FiPlay, FiLock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

export default function CourseDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [hasAccess, setHasAccess] = useState(false);   // approved class enrollment
  const [accessPending, setAccessPending] = useState(false); // pending class enrollment
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourse = api.get(`/courses/${id}`);
    const fetchLessons = user
      ? api.get(`/lessons?course=${id}`)
          .then(r => ({ data: r.data, ok: true }))
          .catch(err => ({ data: [], ok: false, status: err.response?.status }))
      : Promise.resolve({ data: [], ok: false });

    Promise.all([fetchCourse, fetchLessons]).then(([courseRes, lessonsRes]) => {
      setCourse(courseRes.data);
      setLessons(lessonsRes.data);
      setHasAccess(lessonsRes.ok);
      // 403 means no approved access - check if pending
      if (!lessonsRes.ok && lessonsRes.status === 403 && user) {
        api.get('/class-enrollments/my')
          .then(r => {
            const pending = r.data.some(e =>
              e.status === 'pending' &&
              e.class?.courses?.some(c => (c._id || c) === id)
            );
            setAccessPending(pending);
          })
          .catch(() => {});
      }
    }).finally(() => setLoading(false));
  }, [id, user]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  if (!course) return <div className="min-h-screen flex items-center justify-center text-gray-500">Không tìm thấy khóa học</div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      {/* Hero */}
      <div className="bg-gray-900 text-white py-10 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            {course.level && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${course.level.bgColor} ${course.level.textColor}`}>{course.level.name}</span>
            )}
            <h1 className="text-3xl font-bold mt-3 mb-4">{course.title}</h1>
            <p className="text-gray-300 mb-4">{course.description}</p>
            <div className="flex flex-wrap gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1"><FiBookOpen /> {course.totalLessons} bài học</span>
              <span className="flex items-center gap-1"><FiClock /> {course.duration || 'Linh hoạt'}</span>
            </div>
          </div>
          <div className="card p-6 text-gray-900">
            <img src={course.thumbnail || 'https://via.placeholder.com/400x220?text=Khóa+học'} alt={course.title} className="rounded-lg mb-4 w-full h-40 object-cover" />
            {hasAccess ? (
              <div className="flex items-center gap-2 text-green-600 font-semibold">
                <FiCheckCircle /> Đã được vào lớp học
              </div>
            ) : accessPending ? (
              <div className="flex items-center gap-2 text-yellow-600 font-semibold">
                <FiAlertCircle /> Đơn đăng ký đang chờ duyệt
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-3">Bạn cần đăng ký và được duyệt vào lớp học có khóa này để học.</p>
                <Link to="/classes" className="btn-primary block text-center">Đăng ký lớp học</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {lessons.length > 0 ? (
          <div>
            <h2 className="text-xl font-bold mb-4">Nội dung khóa học ({lessons.length} bài)</h2>
            <div className="space-y-2">
              {lessons.map((lesson, idx) => (
                <div key={lesson._id} className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{lesson.title}</p>
                    {lesson.duration && <p className="text-xs text-gray-400">{lesson.duration} phút</p>}
                  </div>
                  <Link
                    to={`/lessons/${lesson._id}`}
                    className="flex items-center gap-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  >
                    <FiPlay size={12} /> Học
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 card">
            <FiLock className="text-4xl text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium mb-1">Nội dung bị khóa</p>
            <p className="text-gray-400 text-sm mb-4">
              {!user
                ? 'Vui lòng đăng nhập để xem nội dung'
                : accessPending
                ? 'Đơn đăng ký lớp học của bạn đang chờ admin xét duyệt'
                : 'Bạn cần được admin duyệt vào lớp học có khóa này'}
            </p>
            {!user ? (
              <Link to="/login" className="btn-primary">Đăng nhập</Link>
            ) : !hasAccess && !accessPending ? (
              <Link to="/classes" className="btn-primary">Đăng ký lớp học</Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
