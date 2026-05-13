import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import CourseCard from '../components/CourseCard';
import { FiArrowRight, FiBook, FiUsers, FiAward } from 'react-icons/fi';

export default function HomePage() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    api.get('/courses?limit=6').then((res) => setCourses(res.data.courses));
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Học Toán cùng <span className="text-yellow-400">Toán Thầy Hiếu</span>
          </h1>
          <p className="text-xl text-blue-100 mb-8">
            Học Toán chất lượng cao cùng Thầy Hiếu – dễ hiểu, hiệu quả, mọi lúc mọi nơi.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/courses" className="bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors inline-flex items-center gap-2">
              Khám phá khóa học <FiArrowRight />
            </Link>
            <Link to="/register" className="border-2 border-white text-white font-semibold px-8 py-3 rounded-lg hover:bg-white/10 transition-colors">
              Đăng ký miễn phí
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {[
            { icon: <FiBook className="text-3xl text-blue-600" />, value: '100+', label: 'Khóa học' },
            { icon: <FiUsers className="text-3xl text-green-600" />, value: '5000+', label: 'Học viên' },
            { icon: <FiAward className="text-3xl text-purple-600" />, value: '50+', label: 'Giảng viên' },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-2">
              {stat.icon}
              <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Courses */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Khóa học nổi bật</h2>
            <Link to="/courses" className="text-blue-600 hover:underline flex items-center gap-1">
              Xem tất cả <FiArrowRight />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <CourseCard key={course._id} course={course} />
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400 py-8 text-center">
        <p>© 2025 Toán Thầy Hiếu. Nền tảng học Toán trực tuyến hàng đầu.</p>
      </footer>
    </div>
  );
}
