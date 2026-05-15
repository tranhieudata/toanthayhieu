import { useState, useEffect, useRef } from 'react';
import api, { getUploadUrl } from '../../api/axios';
import toast from 'react-hot-toast';
import { FiSave, FiUpload, FiSettings, FiCreditCard, FiX } from 'react-icons/fi';

export default function AdminSettings() {
  const [form, setForm] = useState({
    schoolName: '', bankName: '', bankAccountNumber: '', bankAccountName: '', bankQrImageUrl: '', receiptNote: '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    api.get('/settings').then((r) => setForm({
      schoolName: r.data.schoolName || '',
      bankName: r.data.bankName || '',
      bankAccountNumber: r.data.bankAccountNumber || '',
      bankAccountName: r.data.bankAccountName || '',
      bankQrImageUrl: r.data.bankQrImageUrl || '',
      receiptNote: r.data.receiptNote || '',
    })).catch(() => toast.error('Không tải được cài đặt'));
  }, []);

  const handleUploadQR = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Chỉ chấp nhận file ảnh');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/upload/image', fd);
      setForm((f) => ({ ...f, bankQrImageUrl: data.url }));
      toast.success('Tải ảnh QR thành công');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi tải ảnh');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', form);
      toast.success('Đã lưu cài đặt');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu cài đặt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FiSettings /> Cài đặt hệ thống</h1>

      {/* School info */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Thông tin trường / trung tâm</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên trường / trung tâm</label>
          <input className="input-field" value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} placeholder="VD: Toán Thầy Hiếu" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú in trên phiếu thu</label>
          <textarea className="input-field" rows={2} value={form.receiptNote} onChange={(e) => setForm({ ...form, receiptNote: e.target.value })} placeholder="VD: Vui lòng đóng học phí trước ngày 5 hàng tháng" />
        </div>
      </div>

      {/* Bank info */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FiCreditCard /> Thông tin chuyển khoản</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
            <input className="input-field" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="VD: Vietcombank" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
            <input className="input-field" value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="VD: 1234567890" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên chủ tài khoản</label>
          <input className="input-field" value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} placeholder="VD: NGUYEN VAN HIEU" />
        </div>

        {/* QR upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh QR chuyển khoản</label>
          <div className="flex items-start gap-4">
            {form.bankQrImageUrl ? (
              <div className="relative group">
                <img src={getUploadUrl(form.bankQrImageUrl)} alt="QR Code" className="w-32 h-32 object-contain border rounded-lg bg-gray-50" />
                <button
                  onClick={() => setForm({ ...form, bankQrImageUrl: '' })}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                ><FiX /></button>
              </div>
            ) : (
              <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs text-center">
                Chưa có ảnh QR
              </div>
            )}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 btn-secondary text-sm"
              >
                <FiUpload /> {uploading ? 'Đang tải...' : 'Tải ảnh QR lên'}
              </button>
              <p className="text-xs text-gray-400 mt-2">Ảnh QR sẽ hiển thị trên phiếu thu học phí của từng học sinh</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleUploadQR} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-medium">
          <FiSave /> {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>
    </div>
  );
}
