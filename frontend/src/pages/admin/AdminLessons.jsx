import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiToggleLeft, FiToggleRight } from 'react-icons/fi';

const emptyForm = { title: '', content: '', videoUrl: '', course: '', order: 0, duration: '', isPublished: false };

export default function AdminLessons() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadLessons = () => api.get('/lessons').then(res => setLessons(res.data));

  useEffect(() => {
    loadLessons();
    api.get('/courses/admin/all').then(res => setCourses(res.data));
  }, []);

  const openCreate = () => { navigate('/admin/lessons/new'); };
  const openEdit = (l) => {
    navigate(`/admin/lessons/${l._id}/edit`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editId) { await api.put(`/lessons/${editId}`, form); toast.success('Cập nhật bài học thành công'); }
      else { await api.post('/lessons', form); toast.success('Đăng bài học thành công'); }
      setModal(false); loadLessons();
    } catch (err) { toast.error(err.response?.data?.message || 'Có lỗi xảy ra'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa bài học này?')) return;
    try { await api.delete(`/lessons/${id}`); toast.success('Xóa thành công'); loadLessons(); }
    catch { toast.error('Xóa thất bại'); }
  };

  const handleToggle = async (id) => {
    try {
      const res = await api.patch(`/lessons/${id}/toggle`);
      setLessons(prev => prev.map(l => l._id === id ? res.data : l));
      toast.success(res.data.isPublished ? 'Đã bật hiển thị' : 'Đã tắt hiển thị');
    } catch { toast.error('Không thể thay đổi trạng thái'); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý bài học</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><FiPlus /> Thêm bài học</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Tên bài học', 'Khóa học', 'Thứ tự', 'Thời lượng', 'Trạng thái', 'Thao tác'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {lessons.map(l => (
              <tr key={l._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium max-w-xs truncate">{l.title}</td>
                <td className="px-4 py-3 text-gray-600">{courses.find(c => c._id === (l.course?._id || l.course))?.title || '—'}</td>
                <td className="px-4 py-3 text-center">{l.order}</td>
                <td className="px-4 py-3 text-gray-600">{l.duration || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${l.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {l.isPublished ? 'Đã đăng' : 'Nháp'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2 items-center">
                  <button
                    onClick={() => handleToggle(l._id)}
                    title={l.isPublished ? 'Đang bật – Nhấn để tắt' : 'Đang tắt – Nhấn để bật'}
                    className={l.isPublished ? 'text-green-500 hover:text-green-700 text-lg' : 'text-gray-400 hover:text-gray-600 text-lg'}
                  >
                    {l.isPublished ? <FiToggleRight /> : <FiToggleLeft />}
                  </button>
                  <button onClick={() => openEdit(l)} className="text-blue-600 hover:text-blue-800"><FiEdit2 /></button>
                  <button onClick={() => handleDelete(l._id)} className="text-red-500 hover:text-red-700"><FiTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="font-bold text-lg">{editId ? 'Chỉnh sửa' : 'Đăng'} bài học</h2>
              <button onClick={() => setModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên bài học *</label>
                <input className="input-field" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Khóa học *</label>
                <select className="input-field" value={form.course} onChange={e => setForm({...form, course: e.target.value})} required>
                  <option value="">Chọn khóa học</option>
                  {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
                <textarea className="input-field" rows={5} value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Nội dung bài học..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Video</label>
                <input className="input-field" value={form.videoUrl} onChange={e => setForm({...form, videoUrl: e.target.value})} placeholder="https://youtube.com/embed/..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thứ tự</label>
                  <input type="number" className="input-field" value={form.order} onChange={e => setForm({...form, order: Number(e.target.value)})} min={0} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thời lượng</label>
                  <input className="input-field" placeholder="vd: 15 phút" value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isPublished} onChange={e => setForm({...form, isPublished: e.target.checked})} className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Công khai</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Hủy</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Đang lưu...' : 'Lưu'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
