import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import {
  FiBookOpen, FiAward, FiTrendingUp, FiLayers, FiClock,
  FiCheckCircle, FiXCircle, FiChevronDown, FiChevronRight,
  FiPlay, FiLock, FiBook,
} from 'react-icons/fi';

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classEnrollments, setClassEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);

  // expandedCourses: { `${classId}_${courseId}`: lessons[] | 'loading' | null }
  const [expandedCourses, setExpandedCourses] = useState({});

  useEffect(() => {
    api.get('/class-enrollments/my')
      .then(res => setClassEnrollments(res.data))
      .finally(() => setLoading(false));
  }, []);

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
