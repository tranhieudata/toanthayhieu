import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiBook, FiArchive, FiCalendar, FiLayers } from 'react-icons/fi';

const LEVEL_COLORS = {
  'Nhận biết': 'bg-green-100 text-green-700',
  'Thông hiểu': 'bg-blue-100 text-blue-700',
  'Vận dụng cao': 'bg-orange-100 text-orange-700',
};

export default function AdminExams() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTemplate, setFilterTemplate] = useState('all'); // 'all' | 'true' | 'false'
  const [classes, setClasses] = useState([]);
  const [filterClass, setFilterClass] = useState('');
  const [deleting, setDeleting] = useState(null);

  const loadExams = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterTemplate !== 'all') params.isTemplate = filterTemplate;
      if (filterClass) params.classId = filterClass;
      const { data } = await api.get('/exams', { params });
      setExams(data);
    } catch {
      toast.error('Không tải được danh sách đề');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/classes').then(r => setClasses(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { loadExams(); }, [filterTemplate, filterClass]); // eslint-disable-line

  const handleDelete = async (examId) => {
    if (!window.confirm('Xóa đề kiểm tra này? Tất cả kết quả liên quan cũng sẽ bị xóa.')) return;
    setDeleting(examId);
    try {
      await api.delete(`/exams/${examId}`);
      toast.success('Đã xóa đề kiểm tra');
      loadExams();
    } catch {
      toast.error('Lỗi xóa đề');
    } finally {
      setDeleting(null);
    }
  };

  const totalPoints = (exam) => exam.levels?.reduce((s, l) => s + l.totalPoints, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FiBook className="text-blue-600" /> Quản lý đề kiểm tra
        </h1>
        <button
          onClick={() => navigate('/admin/exams/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <FiPlus /> Tạo đề mới
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-4 items-center">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Loại đề</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterTemplate}
            onChange={e => setFilterTemplate(e.target.value)}
          >
            <option value="all">Tất cả</option>
            <option value="false">Đề thường</option>
            <option value="true">Ngân hàng đề</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Lớp</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
          >
            <option value="">Tất cả lớp</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">{exams.length} đề</div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <FiBook className="mx-auto text-4xl mb-3 text-gray-300" />
          <p>Chưa có đề kiểm tra nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {exams.map(exam => (
            <div key={exam._id} className="bg-white rounded-xl shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{exam.title}</span>
                    {exam.isTemplate && (
                      <span className="shrink-0 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1"><FiArchive size={10} /> Ngân hàng</span>
                    )}
                  </div>
                  {exam.lesson && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><FiBook size={11} /> {exam.lesson.title}</p>}
                  {exam.class && <p className="text-xs text-gray-500 flex items-center gap-1"><FiCalendar size={11} /> {exam.class.name}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => navigate(`/admin/exams/${exam._id}/edit`)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Sửa"><FiEdit2 size={15} /></button>
                  <button onClick={() => handleDelete(exam._id)} disabled={deleting === exam._id} className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="Xóa"><FiTrash2 size={15} /></button>
                </div>
              </div>

              {/* Levels */}
              <div className="flex flex-wrap gap-1.5">
                {exam.levels?.map((l, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${LEVEL_COLORS[l.name] || 'bg-gray-100 text-gray-600'}`}>
                    {l.name}: C{l.fromQuestion}–C{l.toQuestion} ({l.totalPoints}đ)
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1"><FiLayers size={11} /> {exam.totalQuestions} câu · {totalPoints(exam)} điểm</span>
                <button
                  onClick={() => navigate(`/admin/exams/${exam._id}/grade`)}
                  className="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2 py-1 rounded font-medium"
                >
                  Chấm điểm
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
