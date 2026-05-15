import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { FiArrowRight, FiBook, FiUsers, FiAward, FiStar } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

export default function HomePage() {
  const [classes, setClasses] = useState([]);
  const [reviews] = useState([
    { name: 'Chị Hương', role: 'Phụ huynh', content: 'Con tôi học với thầy Hiếu khoảng 3 tháng, tiến bộ rõ rệt. Thầy dạy rất dễ hiểu, nhiệt tình hướng dẫn.', rating: 5 },
    { name: 'Anh Minh', role: 'Phụ huynh', content: 'Lớp online rất tiện, con tôi có thể học vào giờ rảnh. Chất lượng giảng dạy quá tốt!', rating: 5 },
    { name: 'Chị Linh', role: 'Phụ huynh', content: 'Giáo viên tận tâm, chương trình học hợp lý. Mình rất hài lòng với sự tiến bộ của con.', rating: 5 },
  ]);
  const { user } = useAuth();

  useEffect(() => {
    api.get('/classes').then((res) => setClasses(res.data.slice(0, 6)));
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
            <Link to="/classes" className="bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors inline-flex items-center gap-2">
              Khám phá lớp học <FiArrowRight />
            </Link>
            {/* nếu có user thì không hiển thị nút đăng ký */}
            { !user && (
              <Link to="/register" className="border-2 border-white text-white font-semibold px-8 py-3 rounded-lg hover:bg-white/10 transition-colors">
                Đăng ký miễn phí
              </Link>
            )}
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

      {/* Latest Classes */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Lớp Học Mới Nhất</h2>
            <Link to="/classes" className="text-blue-600 hover:underline flex items-center gap-1">
              Xem tất cả <FiArrowRight />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.length === 0 ? (
              <p className="text-gray-500">Chưa có lớp học nào</p>
            ) : (
              classes.map((cls) => (
                <Link
                  key={cls._id}
                  to={`/classes`}
                  className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{cls.name}</h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{cls.description}</p>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <FiUsers size={14} /> {cls.students?.length || 0} học sinh
                    </span>
                    <span className="flex items-center gap-1">
                      <FiBook size={14} /> {cls.courses?.length || 0} khóa
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Parent Reviews */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Nhận Xét Từ Phụ Huynh</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {reviews.map((review, i) => (
              <div key={i} className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{review.name}</h3>
                    <p className="text-sm text-gray-500">{review.role}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: review.rating }).map((_, i) => (
                      <FiStar key={i} className="text-yellow-400 fill-yellow-400" size={16} />
                    ))}
                  </div>
                </div>
                <p className="text-gray-600 leading-relaxed text-sm">"{review.content}"</p>
              </div>
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
