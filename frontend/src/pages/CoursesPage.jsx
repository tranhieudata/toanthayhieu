import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import CourseCard from '../components/CourseCard';
import { FiSearch, FiFilter } from 'react-icons/fi';

const categories = ['Toán lớp 6', 'Toán lớp 7', 'Toán lớp 8', 'Toán lớp 9', 'Toán lớp 10', 'Toán lớp 11', 'Toán lớp 12', 'Luyện thi THPT', 'Ôn thi Đại học'];
const levels = [{ value: 'beginner', label: 'Cơ bản' }, { value: 'intermediate', label: 'Trung cấp' }, { value: 'advanced', label: 'Nâng cao' }];

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');

  const category = searchParams.get('category') || '';
  const level = searchParams.get('level') || '';
  const page = Number(searchParams.get('page') || 1);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 12 });
    if (category) params.set('category', category);
    if (level) params.set('level', level);
    if (search) params.set('search', search);

    api.get(`/courses?${params}`).then((res) => {
      setCourses(res.data.courses);
      setTotal(res.data.total);
    }).finally(() => setLoading(false));
  }, [category, level, page, search]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Tất cả khóa học</h1>

        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input-field pl-9"
              placeholder="Tìm kiếm khóa học..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setFilter('search', search)}
            />
          </div>
          <select className="input-field w-auto" value={category} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input-field w-auto" value={level} onChange={(e) => setFilter('level', e.target.value)}>
            <option value="">Tất cả trình độ</option>
            {levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        <p className="text-gray-500 text-sm mb-4">Tìm thấy <strong>{total}</strong> khóa học</p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card animate-pulse h-72"></div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20 text-gray-500">Không tìm thấy khóa học phù hợp</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => <CourseCard key={course._id} course={course} />)}
          </div>
        )}
      </div>
    </div>
  );
}
