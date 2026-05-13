import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { FiBookOpen, FiAward, FiTrendingUp, FiLayers, FiClock, FiCheckCircle, FiXCircle } from 'react-icons/fi';

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
  const [enrollments, setEnrollments] = useState([]);
  const [classEnrollments, setClassEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/users/me/enrollments'),
      api.get('/class-enrollments/my'),
    ]).then(([courseRes, classRes]) => {
      setEnrollments(courseRes.data);
      setClassEnrollments(classRes.data);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { icon: <FiBookOpen className="text-blue-600 text-2xl" />, label: 'Khóa học đang học', value: enrollments.length, bg: 'bg-blue-50' },
            { icon: <FiAward className="text-yellow-600 text-2xl" />, label: 'Khóa học hoàn thành', value: enrollments.filter(e => e.isCompleted).length, bg: 'bg-yellow-50' },
            { icon: <FiTrendingUp className="text-green-600 text-2xl" />, label: 'Tiến độ trung bình', value: `${enrollments.length ? Math.round(enrollments.reduce((a, e) => a + e.progress, 0) / enrollments.length) : 0}%`, bg: 'bg-green-50' },
          ].map((stat) => (
            <div key={stat.label} className={`card p-5 flex items-center gap-4 ${stat.bg}`}>
              {stat.icon}
              <div>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-4">Lớp học của tôi</h2>
        {loading ? (
          <div className="card animate-pulse h-24 mb-6"></div>
        ) : classEnrollments.length === 0 ? (
          <div className="card text-center py-8 mb-6">
            <FiLayers className="text-3xl text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 mb-3">Bạn chưa đăng ký lớp học nào</p>
            <Link to="/classes" className="btn-primary">Đăng ký lớp học ngay</Link>
          </div>
        ) : (
          <div className="space-y-6 mb-6">
            {classEnrollments.map((e) => (
              <div key={e._id} className="card p-5">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-gray-900 text-lg">{e.class?.name || 'Lớp học'}</h3>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${CLASS_STATUS_COLOR[e.status]}`}>
                    {CLASS_STATUS_ICON[e.status]}{CLASS_STATUS_LABEL[e.status]}
                  </span>
                </div>

                {/* Courses inside this class */}
                {e.status === 'approved' && e.class?.courses?.length > 0 ? (
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase mb-2">Khóa học trong lớp</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {e.class.courses.map(c => (
                        <Link
                          key={c._id}
                          to={`/courses/${c._id}`}
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                        >
                          {c.thumbnail ? (
                            <img src={c.thumbnail} alt={c.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <FiBookOpen className="text-blue-600" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-sm line-clamp-2 group-hover:text-blue-600">{c.title}</p>
                            <p className="text-xs text-gray-400">{c.totalLessons || 0} bài học</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : e.status === 'pending' ? (
                  <p className="text-sm text-yellow-600">Đơn đang chờ admin xét duyệt. Nội dung sẽ mở sau khi được duyệt.</p>
                ) : e.status === 'rejected' ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-red-500">Đơn đăng ký bị từ chối.</p>
                    <Link to="/classes" className="text-sm text-blue-600 hover:underline">Đăng ký lớp khác →</Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <h2 className="text-xl font-bold text-gray-900 mb-4">Khóa học của tôi</h2>
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-32"></div>)}
          </div>
        ) : enrollments.length === 0 ? (
          <div className="text-center py-16 card">
            <FiBookOpen className="text-4xl text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Bạn chưa đăng ký khóa học nào</p>
            <Link to="/courses" className="btn-primary">Khám phá khóa học</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrollments.map((enrollment) => (
              <Link key={enrollment._id} to={`/courses/${enrollment.course?._id}`} className="card p-4 hover:shadow-md transition-shadow">
                <img
                  src={enrollment.course?.thumbnail || 'https://via.placeholder.com/400x220?text=Khóa+học'}
                  alt={enrollment.course?.title}
                  className="w-full h-32 object-cover rounded-lg mb-3"
                />
                <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-2">{enrollment.course?.title}</h3>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>{enrollment.course?.category}</span>
                  <span className={enrollment.isCompleted ? 'text-green-600' : 'text-blue-600'}>
                    {enrollment.isCompleted ? 'Hoàn thành' : `${enrollment.progress}%`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${enrollment.progress}%` }}></div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
