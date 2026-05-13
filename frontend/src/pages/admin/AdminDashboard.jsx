import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { FiUsers, FiBook, FiTrendingUp, FiCalendar } from 'react-icons/fi';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalUsers: 0, totalCourses: 0, totalEnrollments: 0 });

  useEffect(() => {
    api.get('/users/admin/stats').then((res) => setStats(res.data)).catch(() => {});
  }, []);

  const cards = [
    { icon: <FiBook className="text-green-600 text-3xl" />, label: 'Quản lý nội dung', value: stats.totalCourses, to: '/admin/content', bg: 'bg-green-50 border-green-200' },
    { icon: <FiUsers className="text-blue-600 text-3xl" />, label: 'Học sinh', value: stats.totalUsers, to: '/admin/students', bg: 'bg-blue-50 border-blue-200' },
    { icon: <FiTrendingUp className="text-purple-600 text-3xl" />, label: 'Đăng ký học', value: stats.totalEnrollments, to: '/admin/students', bg: 'bg-purple-50 border-purple-200' },
    { icon: <FiCalendar className="text-orange-600 text-3xl" />, label: 'Lớp học', value: '—', to: '/admin/classes', bg: 'bg-orange-50 border-orange-200' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tổng quan</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
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
