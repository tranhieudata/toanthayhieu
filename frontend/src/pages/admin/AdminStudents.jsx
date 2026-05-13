import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiSearch, FiTrash2, FiEye } from 'react-icons/fi';

export default function AdminStudents() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = (s = search, p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ role: 'student', page: p, limit: 20 });
    if (s) params.set('search', s);
    api.get(`/users?${params}`).then(res => { setUsers(res.data.users); setTotal(res.data.total); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  const handleDelete = async (id) => {
    if (!confirm('Xóa học sinh này?')) return;
    try { await api.delete(`/users/${id}`); toast.success('Xóa thành công'); load(); }
    catch { toast.error('Xóa thất bại'); }
  };

  const handleToggleActive = async (user) => {
    try {
      await api.put(`/users/${user._id}`, { isActive: !user.isActive });
      toast.success('Cập nhật thành công');
      load();
    } catch { toast.error('Có lỗi xảy ra'); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý học sinh ({total})</h1>
      </div>

      <div className="relative mb-4">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input-field pl-9 max-w-sm"
          placeholder="Tìm theo tên hoặc email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(search, 1)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Học sinh', 'Email', 'Ngày tham gia', 'Trạng thái', 'Thao tác'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
            ) : users.map(u => (
              <tr key={u._id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">{u.name?.charAt(0).toUpperCase()}</div>
                    )}
                    <span className="font-medium text-gray-900">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3 text-gray-600">{new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggleActive(u)} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {u.isActive ? 'Hoạt động' : 'Bị khóa'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(u._id)} className="text-red-500 hover:text-red-700"><FiTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3 py-1 text-sm">Trước</button>
          <span className="px-3 py-1 text-sm text-gray-600">Trang {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="btn-secondary px-3 py-1 text-sm">Sau</button>
        </div>
      )}
    </div>
  );
}
