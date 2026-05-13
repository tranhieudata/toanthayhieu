import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiRefreshCw } from 'react-icons/fi';

const STATUS_LABEL = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
const STATUS_COLOR = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};

export default function AdminEnrollments() {
  const [enrollments, setEnrollments] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [adminNote, setAdminNote] = useState({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const params = filter ? `?status=${filter}` : '';
      const res = await api.get(`/class-enrollments${params}`);
      setEnrollments(res.data.enrollments || res.data);
    } catch (err) {
      toast.error('Không tải được danh sách đơn');
    }
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (id) => {
    setLoading(true);
    try {
      await api.put(`/class-enrollments/${id}/approve`, { adminNote: adminNote[id] || '' });
      toast.success('Đã duyệt đơn');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi duyệt đơn');
    } finally { setLoading(false); }
  };

  const handleReject = async (id) => {
    setLoading(true);
    try {
      await api.put(`/class-enrollments/${id}/reject`, { adminNote: adminNote[id] || '' });
      toast.success('Đã từ chối đơn');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi từ chối đơn');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Đơn xét duyệt lớp học</h1>
        <button onClick={load} className="btn-secondary flex items-center gap-2"><FiRefreshCw /> Làm mới</button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
          >
            {s === '' ? 'Tất cả' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {enrollments.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">Không có đơn nào</div>
      ) : (
        <div className="space-y-4">
          {enrollments.map(e => (
            <div key={e._id} className="card">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                {/* Student info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {e.student?.avatar ? (
                    <img src={e.student.avatar} alt={e.student.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                      {e.student?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{e.student?.name}</p>
                    <p className="text-sm text-gray-500 truncate">{e.student?.email}</p>
                  </div>
                </div>

                {/* Class info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500">Lớp học</p>
                  <p className="font-medium text-gray-800 truncate">{e.class?.name || 'N/A'}</p>
                </div>

                {/* Date */}
                <div className="min-w-[120px]">
                  <p className="text-sm text-gray-500">Ngày nộp</p>
                  <p className="text-sm text-gray-700">{new Date(e.createdAt).toLocaleDateString('vi-VN')}</p>
                </div>

                {/* Status badge */}
                <div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[e.status]}`}>
                    {STATUS_LABEL[e.status]}
                  </span>
                </div>
              </div>

              {/* Message from student */}
              {e.message && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                  <span className="font-medium">Lý do:</span> {e.message}
                </div>
              )}

              {/* Admin note */}
              {e.status === 'pending' && (
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    className="input-field flex-1 text-sm"
                    placeholder="Ghi chú (không bắt buộc)"
                    value={adminNote[e._id] || ''}
                    onChange={ev => setAdminNote(n => ({ ...n, [e._id]: ev.target.value }))}
                  />
                  <button
                    onClick={() => handleApprove(e._id)}
                    disabled={loading}
                    className="btn-primary flex items-center gap-1 whitespace-nowrap"
                  >
                    <FiCheck /> Duyệt
                  </button>
                  <button
                    onClick={() => handleReject(e._id)}
                    disabled={loading}
                    className="btn-danger flex items-center gap-1 whitespace-nowrap"
                  >
                    <FiX /> Từ chối
                  </button>
                </div>
              )}

              {/* Existing admin note */}
              {e.adminNote && e.status !== 'pending' && (
                <div className="mt-2 text-sm text-gray-500">
                  <span className="font-medium">Ghi chú admin:</span> {e.adminNote}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
