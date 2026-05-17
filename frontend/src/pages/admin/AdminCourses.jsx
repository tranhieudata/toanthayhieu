import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX } from 'react-icons/fi';

const emptyForm = { title: '', description: '', level: '', thumbnail: '', duration: '', isPublished: false };

export default function AdminCourses() {
  const [courses, setCourses] = useState([]);
  const [levels, setLevels] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => api.get('/courses/admin/all').then((res) => setCourses(res.data));

  useEffect(() => {
    load();
    api.get('/levels').then(r => setLevels(r.data || [])).catch(() => {});
  }, []);

  const openCreate = () => { setForm(emptyForm); setEditId(null); setModal(true); };
  const openEdit = (c) => { setForm({ title: c.title, description: c.description, level: c.level?._id || c.level || '', thumbnail: c.thumbnail, duration: c.duration, isPublished: c.isPublished }); setEditId(c._id); setModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editId) { await api.put(`/courses/${editId}`, form); toast.success('Cập nhật khóa học thành công'); }
      else { await api.post('/courses', form); toast.success('Tạo khóa học thành công'); }
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Có lỗi xảy ra'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xác nhận xóa khóa học này?')) return;
    try { await api.delete(`/courses/${id}`); toast.success('Xóa thành công'); load(); }
    catch { toast.error('Xóa thất bại'); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý khóa học</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><FiPlus /> Thêm khóa học</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Tên khóa học', 'Cấp độ lớp', 'Trạng thái', 'Thao tác'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {courses.map((c) => (
              <tr key={c._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{c.title}</td>
                <td className="px-4 py-3">
                  {c.level ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.level.bgColor} ${c.level.textColor}`}>{c.level.name}</span>
                  ) : <span className="text-gray-400 text-xs">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.isPublished ? 'Đã đăng' : 'Nháp'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(c)} className="text-blue-600 hover:text-blue-800"><FiEdit2 /></button>
                  <button onClick={() => handleDelete(c._id)} className="text-red-500 hover:text-red-700"><FiTrash2 /></button>
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
              <h2 className="font-bold text-lg">{editId ? 'Chỉnh sửa' : 'Thêm'} khóa học</h2>
              <button onClick={() => setModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên khóa học *</label>
                <input className="input-field" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả *</label>
                <textarea className="input-field" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cấp độ lớp</label>
                  <select className="input-field" value={form.level} onChange={e => setForm({...form, level: e.target.value})}>
                    <option value="">-- Chọn cấp độ --</option>
                    {levels.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thời lượng</label>
                  <input className="input-field" placeholder="vd: 10 giờ" value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL ảnh bìa</label>
                <input className="input-field" value={form.thumbnail} onChange={e => setForm({...form, thumbnail: e.target.value})} placeholder="https://..." />
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
