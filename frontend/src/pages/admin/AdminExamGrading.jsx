import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheckSquare, FiSearch, FiArrowRight } from 'react-icons/fi';
import api from '../../api/axios';

export default function AdminExamGrading() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');

  const loadExams = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/exams');
      setExams((data || []).filter(exam => exam.classSchedules?.some(schedule => schedule.class)));
    } catch {
      setError('Không tải được danh sách đề kiểm tra.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadExams(); }, []);

  const classes = useMemo(() => {
    const items = new Map();
    exams.forEach(exam => exam.classSchedules?.forEach(schedule => {
      const classroom = schedule.class;
      if (classroom?._id) items.set(classroom._id, classroom);
    }));
    return [...items.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  }, [exams]);

  const filteredExams = useMemo(() => exams.filter(exam => {
    const matchesClass = !classId || exam.classSchedules?.some(schedule => (schedule.class?._id || schedule.class) === classId);
    return matchesClass && (exam.title || '').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'));
  }), [exams, classId, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><FiCheckSquare className="text-blue-600" /> Chấm đề kiểm tra</h1>
        <p className="mt-2 text-sm text-gray-500">Chọn đề đã giao cho lớp để nhận ảnh bài làm, chấm thủ công hoặc bằng AI và in phiếu kết quả.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl bg-white p-4 shadow-sm">
        <label className="min-w-48 flex-1 text-sm text-gray-600">
          Tìm đề kiểm tra
          <div className="relative mt-1"><FiSearch className="absolute left-3 top-3 text-gray-400" />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nhập tên đề..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" />
          </div>
        </label>
        <label className="text-sm text-gray-600">Lớp học
          <select value={classId} onChange={e => setClassId(e.target.value)} className="mt-1 block min-w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Tất cả lớp</option>
            {classes.map(classroom => <option key={classroom._id} value={classroom._id}>{classroom.name}</option>)}
          </select>
        </label>
        {!loading && !error && <span className="pb-2 text-sm text-gray-500">{filteredExams.length} đề kiểm tra</span>}
      </div>

      {loading ? <div className="flex justify-center py-12"><div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" /></div>
        : error ? <div className="rounded-xl bg-white p-8 text-center"><p className="text-red-600">{error}</p><button onClick={loadExams} className="mt-3 text-sm text-blue-600 hover:underline">Thử lại</button></div>
        : filteredExams.length === 0 ? <div className="rounded-xl bg-white p-10 text-center text-gray-500">
          <FiCheckSquare className="mx-auto mb-3 text-3xl text-gray-300" />
          <p>{exams.length ? 'Không có đề phù hợp với bộ lọc.' : 'Chưa có đề kiểm tra nào được giao cho lớp.'}</p>
          {!exams.length && <p className="mt-2 text-sm">Giao đề cho lớp trong mục Tạo Đề, sau đó quay lại đây để chấm bài.</p>}
        </div>
        : <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
          {filteredExams.map(exam => <Link key={exam._id} to={`/admin/exam-grading/${exam._id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-blue-50">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-gray-900">{exam.title}</h2>
              <div className="mt-2 flex flex-wrap gap-2">{exam.classSchedules.filter(schedule => schedule.class).map(schedule => <span key={schedule.class?._id || schedule.class} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{schedule.class?.name || 'Lớp học'}</span>)}</div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-blue-600">Chấm bài <FiArrowRight /></span>
          </Link>)}
        </div>}
    </div>
  );
}
