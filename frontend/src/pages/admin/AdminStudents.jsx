import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiSearch, FiTrash2, FiPlus, FiX, FiCopy, FiUser, FiEdit2, FiRefreshCw } from 'react-icons/fi';

const DEFAULT_PASSWORD = 'toanthayhieu@123';

function generateEmail(name) {
  const slug = name.toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '.');
  return slug ? `${slug}@toanthayhieu.edu` : '';
}

export default function AdminStudents() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Add student modal
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [emailEdited, setEmailEdited] = useState(false);
  const [adding, setAdding] = useState(false);
  const [createdInfo, setCreatedInfo] = useState(null); // { email, defaultPassword }
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [resetInfo, setResetInfo] = useState(null);

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

  const openAddModal = () => {
    setAddName('');
    setAddEmail('');
    setEmailEdited(false);
    setCreatedInfo(null);
    setShowAdd(true);
  };

  const handleAddNameChange = (val) => {
    setAddName(val);
    if (!emailEdited) setAddEmail(generateEmail(val));
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!addName.trim()) return toast.error('Vui lòng nhập tên');
    setAdding(true);
    try {
      const { data } = await api.post('/users', { name: addName.trim(), email: addEmail.trim() || undefined });
      setCreatedInfo({ email: data.user.email, defaultPassword: data.defaultPassword });
      toast.success(`Đã tạo học sinh: ${data.user.name}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi tạo học sinh');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await api.put(`/users/${user._id}`, { isActive: !user.isActive });
      toast.success('Cập nhật thành công');
      load();
    } catch { toast.error('Có lỗi xảy ra'); }
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setEditForm({ name: user.name || '', email: user.email || '' });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editForm.name.trim()) return toast.error('Vui lòng nhập tên học sinh');
    if (!editForm.email.trim()) return toast.error('Vui lòng nhập email');

    setSavingEdit(true);
    try {
      await api.put(`/users/${editingUser._id}`, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
      });
      toast.success('Cập nhật học sinh thành công');
      setEditingUser(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cập nhật thất bại');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleResetPassword = async (user) => {
    if (!confirm(`Reset mật khẩu của ${user.name} về mặc định?`)) return;
    try {
      const { data } = await api.post(`/users/${user._id}/reset-password`);
      setResetInfo({
        name: user.name,
        email: user.email,
        defaultPassword: data.defaultPassword || DEFAULT_PASSWORD,
      });
      toast.success('Đã reset mật khẩu');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset mật khẩu thất bại');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý học sinh ({total})</h1>
        <button onClick={openAddModal} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <FiPlus /> Thêm học sinh
        </button>
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
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEditModal(u)} className="text-blue-600 hover:text-blue-800" title="Sửa thông tin">
                      <FiEdit2 />
                    </button>
                    <button onClick={() => handleResetPassword(u)} className="text-amber-600 hover:text-amber-800" title="Reset mật khẩu">
                      <FiRefreshCw />
                    </button>
                    <button onClick={() => handleDelete(u._id)} className="text-red-500 hover:text-red-700" title="Xóa">
                      <FiTrash2 />
                    </button>
                  </div>
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

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FiEdit2 /> Sửa thông tin học sinh</h2>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-700"><FiX /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.name}
                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email đăng nhập</label>
                <input
                  type="email"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.email}
                  onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditingUser(null)} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2">Hủy</button>
                <button type="submit" disabled={savingEdit} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-5 py-2 rounded-lg font-medium transition-colors">
                  <FiEdit2 /> {savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setResetInfo(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FiRefreshCw /> Đã reset mật khẩu</h2>
              <button onClick={() => setResetInfo(null)} className="text-gray-400 hover:text-gray-700"><FiX /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-semibold text-green-800">{resetInfo.name}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-mono font-medium text-gray-900">{resetInfo.email}</span>
                  <button onClick={() => { navigator.clipboard.writeText(resetInfo.email); toast.success('Đã copy'); }} className="text-blue-500 hover:text-blue-700"><FiCopy /></button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-600">Mật khẩu mới:</span>
                  <span className="font-mono font-medium text-gray-900">{resetInfo.defaultPassword}</span>
                  <button onClick={() => { navigator.clipboard.writeText(resetInfo.defaultPassword); toast.success('Đã copy'); }} className="text-blue-500 hover:text-blue-700"><FiCopy /></button>
                </div>
              </div>
              <p className="text-xs text-gray-500">Học sinh nên đổi mật khẩu sau khi đăng nhập lại.</p>
              <div className="flex justify-end">
                <button onClick={() => setResetInfo(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg">Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FiUser /> Thêm học sinh mới</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-700"><FiX /></button>
            </div>

            <div className="p-5">
              {/* After creation — show credentials */}
              {createdInfo ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-2">
                    <p className="font-semibold text-green-800">Tạo tài khoản thành công!</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-600">Email đăng nhập:</span>
                      <span className="font-mono font-medium text-gray-900">{createdInfo.email}</span>
                      <button onClick={() => { navigator.clipboard.writeText(createdInfo.email); toast.success('Đã copy'); }} className="text-blue-500 hover:text-blue-700"><FiCopy /></button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-600">Mật khẩu mặc định:</span>
                      <span className="font-mono font-medium text-gray-900">{createdInfo.defaultPassword}</span>
                      <button onClick={() => { navigator.clipboard.writeText(createdInfo.defaultPassword); toast.success('Đã copy'); }} className="text-blue-500 hover:text-blue-700"><FiCopy /></button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Học sinh có thể đổi mật khẩu hoặc liên kết tài khoản Google sau khi đăng nhập.</p>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setCreatedInfo(null); setAddName(''); setAddEmail(''); setEmailEdited(false); }} className="text-sm text-blue-600 hover:text-blue-800 underline">Thêm học sinh khác</button>
                    <button onClick={() => setShowAdd(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg">Đóng</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAddStudent} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên <span className="text-red-500">*</span></label>
                    <input
                      autoFocus
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="VD: Nguyễn Văn An"
                      value={addName}
                      onChange={(e) => handleAddNameChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email đăng nhập
                      <span className="ml-1 text-xs text-gray-400 font-normal">(tự sinh từ tên, có thể sửa)</span>
                    </label>
                    <input
                      type="email"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="email@toanthayhieu.edu"
                      value={addEmail}
                      onChange={(e) => { setAddEmail(e.target.value); setEmailEdited(true); }}
                    />
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                    Mật khẩu mặc định: <strong className="font-mono">{DEFAULT_PASSWORD}</strong>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setShowAdd(false)} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2">Hủy</button>
                    <button type="submit" disabled={adding || !addName.trim()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-5 py-2 rounded-lg font-medium transition-colors">
                      <FiPlus /> {adding ? 'Đang tạo...' : 'Tạo tài khoản'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
