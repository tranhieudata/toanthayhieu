import { useState, useEffect, useRef } from 'react';
import api, { getUploadUrl } from '../../api/axios';
import toast from 'react-hot-toast';
import { FiSave, FiUpload, FiSettings, FiCreditCard, FiX, FiPlus, FiTrash2, FiLayers, FiBook, FiMenu, FiEdit2 } from 'react-icons/fi';
import VN_MATH_CURRICULUM from '../../utils/vnMathCurriculum';

const TAILWIND_COLORS = [
  { label: 'Xanh lá', bg: 'bg-green-100', text: 'text-green-700' },
  { label: 'Xanh dương', bg: 'bg-blue-100', text: 'text-blue-700' },
  { label: 'Cam', bg: 'bg-orange-100', text: 'text-orange-700' },
  { label: 'Đỏ', bg: 'bg-red-100', text: 'text-red-700' },
  { label: 'Tím', bg: 'bg-purple-100', text: 'text-purple-700' },
  { label: 'Hồng', bg: 'bg-pink-100', text: 'text-pink-700' },
  { label: 'Xanh dương lợn', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { label: 'Xám', bg: 'bg-gray-100', text: 'text-gray-700' },
];

export default function AdminSettings() {
  const [form, setForm] = useState({
    schoolName: '', bankName: '', bankAccountNumber: '', bankAccountName: '', bankQrImageUrl: '', receiptNote: '', difficultyLevels: [], curriculum: VN_MATH_CURRICULUM,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [levels, setLevels] = useState([]);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [newLevelName, setNewLevelName] = useState('');
  const [newLevelColor, setNewLevelColor] = useState({ bg: 'bg-blue-100', text: 'text-blue-700' });
  const [editingLevel, setEditingLevel] = useState(null);
  const [selectedCurriculumGrade, setSelectedCurriculumGrade] = useState('6');
  const [newChapterName, setNewChapterName] = useState('');
  const [newTopicByChapter, setNewTopicByChapter] = useState({});
  const [editingChapter, setEditingChapter] = useState(null);
  const [editingChapterName, setEditingChapterName] = useState('');
  const [editingTopic, setEditingTopic] = useState(null);
  const [editingTopicName, setEditingTopicName] = useState('');
  const [draggedCurriculumItem, setDraggedCurriculumItem] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    api.get('/settings').then((r) => setForm({
      schoolName: r.data.schoolName || '',
      bankName: r.data.bankName || '',
      bankAccountNumber: r.data.bankAccountNumber || '',
      bankAccountName: r.data.bankAccountName || '',
      bankQrImageUrl: r.data.bankQrImageUrl || '',
      receiptNote: r.data.receiptNote || '',
      difficultyLevels: r.data.difficultyLevels || [],
      curriculum: r.data.curriculum && Object.keys(r.data.curriculum).length > 0 ? r.data.curriculum : VN_MATH_CURRICULUM,
    })).catch(() => toast.error('Không tải được cài đặt'));

    loadLevels();
  }, []);

  const loadLevels = async () => {
    setLoadingLevels(true);
    try {
      const { data } = await api.get('/levels');
      setLevels(data);
    } catch (err) {
      toast.error('Không tải được danh sách lớp');
    } finally {
      setLoadingLevels(false);
    }
  };

  const handleAddLevel = async () => {
    if (!newLevelName.trim()) {
      return toast.error('Vui lòng nhập tên lớp');
    }
    try {
      const { data } = await api.post('/levels', {
        name: newLevelName,
        bgColor: newLevelColor.bg,
        textColor: newLevelColor.text,
        order: levels.length,
      });
      setLevels([...levels, data]);
      setNewLevelName('');
      setNewLevelColor({ bg: 'bg-blue-100', text: 'text-blue-700' });
      toast.success('Đã thêm lớp mới');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi thêm lớp');
    }
  };

  const handleUpdateLevel = async (id, updates) => {
    try {
      const { data } = await api.put(`/levels/${id}`, updates);
      setLevels(levels.map(l => l._id === id ? data : l));
      setEditingLevel(null);
      toast.success('Đã cập nhật lớp');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật lớp');
    }
  };

  const handleDeleteLevel = async (id) => {
    if (!window.confirm('Bạn chắc chắn muốn xóa lớp này?')) return;
    try {
      await api.delete(`/levels/${id}`);
      setLevels(levels.filter(l => l._id !== id));
      toast.success('Đã xóa lớp');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa lớp');
    }
  };

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

  const handleAddDifficultyLevel = () => {
    const newLevel = {
      name: '',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-700',
    };
    setForm((f) => ({ ...f, difficultyLevels: [...f.difficultyLevels, newLevel] }));
  };

  const handleUpdateDifficultyLevel = (index, field, value) => {
    setForm((f) => {
      const updated = [...f.difficultyLevels];
      updated[index] = { ...updated[index], [field]: value };
      return { ...f, difficultyLevels: updated };
    });
  };

  const handleDeleteDifficultyLevel = (index) => {
    setForm((f) => ({
      ...f,
      difficultyLevels: f.difficultyLevels.filter((_, i) => i !== index),
    }));
  };

  const handleSetDifficultyColor = (index, bgColor, textColor) => {
    handleUpdateDifficultyLevel(index, 'bgColor', bgColor);
    handleUpdateDifficultyLevel(index, 'textColor', textColor);
  };

  const updateCurriculum = (updater) => {
    setForm((f) => ({ ...f, curriculum: updater(f.curriculum || {}) }));
  };

  const moveArrayItem = (items, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const moveChapter = (fromChapter, toChapter) => {
    if (!fromChapter || !toChapter || fromChapter === toChapter) return;
    updateCurriculum((curriculum) => {
      const gradeCurriculum = curriculum[selectedCurriculumGrade] || {};
      const entries = Object.entries(gradeCurriculum);
      const fromIndex = entries.findIndex(([chapter]) => chapter === fromChapter);
      const toIndex = entries.findIndex(([chapter]) => chapter === toChapter);
      if (fromIndex === -1 || toIndex === -1) return curriculum;
      return {
        ...curriculum,
        [selectedCurriculumGrade]: Object.fromEntries(moveArrayItem(entries, fromIndex, toIndex)),
      };
    });
  };

  const moveTopic = (chapter, fromIndex, toIndex) => {
    if (!chapter || fromIndex === toIndex) return;
    updateCurriculum((curriculum) => {
      const gradeCurriculum = curriculum[selectedCurriculumGrade] || {};
      const topics = gradeCurriculum[chapter] || [];
      return {
        ...curriculum,
        [selectedCurriculumGrade]: {
          ...gradeCurriculum,
          [chapter]: moveArrayItem(topics, fromIndex, toIndex),
        },
      };
    });
  };

  const handleAddChapter = () => {
    const name = newChapterName.trim();
    if (!name) return toast.error('Vui lòng nhập tên chương');
    updateCurriculum((curriculum) => ({
      ...curriculum,
      [selectedCurriculumGrade]: {
        ...(curriculum[selectedCurriculumGrade] || {}),
        [name]: [],
      },
    }));
    setNewChapterName('');
  };

  const handleRenameChapter = (oldName) => {
    const nextName = editingChapterName.trim();
    if (!nextName) return toast.error('Vui lòng nhập tên chương');
    updateCurriculum((curriculum) => {
      const gradeCurriculum = curriculum[selectedCurriculumGrade] || {};
      const updatedGrade = {};
      Object.entries(gradeCurriculum).forEach(([chapter, topics]) => {
        updatedGrade[chapter === oldName ? nextName : chapter] = topics;
      });
      return { ...curriculum, [selectedCurriculumGrade]: updatedGrade };
    });
    setEditingChapter(null);
    setEditingChapterName('');
  };

  const handleDeleteChapter = (chapter) => {
    if (!window.confirm('Xóa chương này và tất cả chủ đề bên trong?')) return;
    updateCurriculum((curriculum) => {
      const gradeCurriculum = { ...(curriculum[selectedCurriculumGrade] || {}) };
      delete gradeCurriculum[chapter];
      return { ...curriculum, [selectedCurriculumGrade]: gradeCurriculum };
    });
  };

  const handleAddTopic = (chapter) => {
    const topic = (newTopicByChapter[chapter] || '').trim();
    if (!topic) return toast.error('Vui lòng nhập chủ đề');
    updateCurriculum((curriculum) => {
      const gradeCurriculum = curriculum[selectedCurriculumGrade] || {};
      return {
        ...curriculum,
        [selectedCurriculumGrade]: {
          ...gradeCurriculum,
          [chapter]: [...(gradeCurriculum[chapter] || []), topic],
        },
      };
    });
    setNewTopicByChapter((prev) => ({ ...prev, [chapter]: '' }));
  };

  const handleRenameTopic = (chapter, topicIndex) => {
    const nextName = editingTopicName.trim();
    if (!nextName) return toast.error('Vui lòng nhập chủ đề');
    updateCurriculum((curriculum) => {
      const gradeCurriculum = curriculum[selectedCurriculumGrade] || {};
      return {
        ...curriculum,
        [selectedCurriculumGrade]: {
          ...gradeCurriculum,
          [chapter]: (gradeCurriculum[chapter] || []).map((topic, idx) => idx === topicIndex ? nextName : topic),
        },
      };
    });
    setEditingTopic(null);
    setEditingTopicName('');
  };

  const handleDeleteTopic = (chapter, topicIndex) => {
    updateCurriculum((curriculum) => {
      const gradeCurriculum = curriculum[selectedCurriculumGrade] || {};
      return {
        ...curriculum,
        [selectedCurriculumGrade]: {
          ...gradeCurriculum,
          [chapter]: (gradeCurriculum[chapter] || []).filter((_, idx) => idx !== topicIndex),
        },
      };
    });
  };

  const handleSave = async () => {
    if (activeTab === 'general' || activeTab === 'difficulty' || activeTab === 'curriculum') {
      if (activeTab === 'difficulty' && form.difficultyLevels.some((l) => !l.name.trim())) {
        return toast.error('Vui lòng nhập tên cho tất cả mức độ');
      }

      setSaving(true);
      try {
        await api.put('/settings', form);
        toast.success('Đã lưu cài đặt');
      } catch (err) {
        toast.error(err.response?.data?.message || 'Lỗi lưu cài đặt');
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <FiSettings /> Cài đặt hệ thống
      </h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'general'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Thông tin chung
        </button>
        <button
          onClick={() => setActiveTab('difficulty')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
            activeTab === 'difficulty'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <FiLayers size={16} /> Phân loại mức độ
        </button>
        <button
          onClick={() => setActiveTab('levels')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
            activeTab === 'levels'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <FiBook size={16} /> Lớp học
        </button>
        <button
          onClick={() => setActiveTab('curriculum')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
            activeTab === 'curriculum'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <FiMenu size={16} /> Chủ đề kiểm tra
        </button>
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <>
          {/* School info */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Thông tin trường / trung tâm</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên trường / trung tâm</label>
              <input
                className="input-field"
                value={form.schoolName}
                onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                placeholder="VD: Toán Thầy Hiếu"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú in trên phiếu thu</label>
              <textarea
                className="input-field"
                rows={2}
                value={form.receiptNote}
                onChange={(e) => setForm({ ...form, receiptNote: e.target.value })}
                placeholder="VD: Vui lòng đóng học phí trước ngày 5 hàng tháng"
              />
            </div>
          </div>

          {/* Bank info */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <FiCreditCard /> Thông tin chuyển khoản
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
                <input
                  className="input-field"
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  placeholder="VD: Vietcombank"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
                <input
                  className="input-field"
                  value={form.bankAccountNumber}
                  onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                  placeholder="VD: 1234567890"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên chủ tài khoản</label>
              <input
                className="input-field"
                value={form.bankAccountName}
                onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })}
                placeholder="VD: NGUYEN VAN HIEU"
              />
            </div>

            {/* QR upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh QR chuyển khoản</label>
              <div className="flex items-start gap-4">
                {form.bankQrImageUrl ? (
                  <div className="relative group">
                    <img
                      src={getUploadUrl(form.bankQrImageUrl)}
                      alt="QR Code"
                      className="w-32 h-32 object-contain border rounded-lg bg-gray-50"
                    />
                    <button
                      onClick={() => setForm({ ...form, bankQrImageUrl: '' })}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      <FiX />
                    </button>
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
                  <p className="text-xs text-gray-400 mt-2">
                    Ảnh QR sẽ hiển thị trên phiếu thu học phí của từng học sinh
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleUploadQR}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Difficulty Tab */}
      {activeTab === 'difficulty' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Cấu hình mức độ phân loại</h2>
            <button
              onClick={handleAddDifficultyLevel}
              className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              <FiPlus size={14} /> Thêm mức độ
            </button>
          </div>

          {form.difficultyLevels.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FiLayers size={32} className="mx-auto mb-2 text-gray-300" />
              <p>Chưa có mức độ nào. Hãy thêm mức độ mới.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {form.difficultyLevels.map((level, idx) => (
                <div key={idx} className="p-4 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Tên mức độ</label>
                      <input
                        type="text"
                        className="input-field"
                        value={level.name}
                        onChange={(e) => handleUpdateDifficultyLevel(idx, 'name', e.target.value)}
                        placeholder="VD: Nhận biết"
                      />
                    </div>
                    <button
                      onClick={() => handleDeleteDifficultyLevel(idx)}
                      className="mt-5 p-1.5 text-red-500 hover:bg-red-50 rounded"
                      title="Xóa mức độ"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>

                  {/* Color Selector */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">Chọn màu</label>
                    <div className="grid grid-cols-4 gap-2">
                      {TAILWIND_COLORS.map((color, colorIdx) => (
                        <button
                          key={colorIdx}
                          onClick={() => handleSetDifficultyColor(idx, color.bg, color.text)}
                          className={`p-2 rounded border-2 transition-all ${
                            level.bgColor === color.bg && level.textColor === color.text
                              ? 'border-blue-500 ring-1 ring-blue-300'
                              : 'border-gray-200'
                          } ${color.bg} text-center text-xs font-medium`}
                        >
                          <span className={color.text}>{color.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">Xem trước:</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${level.bgColor} ${level.textColor} font-medium`}>
                      {level.name || 'Mức độ'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Levels Tab */}
      {activeTab === 'levels' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FiBook /> Cấu hình lớp học
            </h2>

            {/* Add new level */}
            <div className="p-4 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50 space-y-3 mb-6">
              <h3 className="font-medium text-blue-900 text-sm">Thêm lớp mới</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Tên lớp (vd: Lớp 6, Lớp 7, Lớp 8)</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newLevelName}
                    onChange={(e) => setNewLevelName(e.target.value)}
                    placeholder="VD: Lớp 6"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-2">Chọn màu</label>
                  <div className="grid grid-cols-4 gap-2">
                    {TAILWIND_COLORS.map((color, idx) => (
                      <button
                        key={idx}
                        onClick={() => setNewLevelColor(color)}
                        className={`p-2 rounded border-2 transition-all ${
                          newLevelColor.bg === color.bg
                            ? 'border-blue-500 ring-2 ring-blue-300'
                            : 'border-gray-200'
                        } ${color.bg} text-center text-xs font-medium`}
                      >
                        <span className={color.text}>{color.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <span className="text-xs text-gray-600">Xem trước:</span>
                  <span className={`text-xs px-3 py-1 rounded-full ${newLevelColor.bg} ${newLevelColor.text} font-medium`}>
                    {newLevelName || 'Lớp mới'}
                  </span>
                </div>

                <button
                  onClick={handleAddLevel}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  <FiPlus size={14} /> Thêm lớp
                </button>
              </div>
            </div>

            {/* Levels list */}
            {loadingLevels ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : levels.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <FiBook size={32} className="mx-auto mb-2 text-gray-300" />
                <p>Chưa có lớp nào. Hãy thêm lớp mới.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {levels.map((level) => (
                  <div key={level._id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    {editingLevel === level._id ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Tên lớp</label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            defaultValue={level.name}
                            onChange={(e) => {
                              level.name = e.target.value;
                            }}
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-600 mb-2">Chọn màu</label>
                          <div className="grid grid-cols-4 gap-2">
                            {TAILWIND_COLORS.map((color, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  level.bgColor = color.bg;
                                  level.textColor = color.text;
                                }}
                                className={`p-2 rounded border-2 transition-all ${
                                  level.bgColor === color.bg
                                    ? 'border-blue-500 ring-2 ring-blue-300'
                                    : 'border-gray-200'
                                } ${color.bg} text-center text-xs font-medium`}
                              >
                                <span className={color.text}>{color.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleUpdateLevel(level._id, {
                                name: level.name,
                                bgColor: level.bgColor,
                                textColor: level.textColor,
                              })
                            }
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium"
                          >
                            <FiSave size={14} className="inline mr-1" /> Lưu
                          </button>
                          <button
                            onClick={() => setEditingLevel(null)}
                            className="px-3 py-1.5 border border-gray-300 rounded text-sm font-medium hover:bg-gray-100"
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FiMenu size={16} className="text-gray-300" />
                          <div>
                            <p className="font-medium text-gray-900">{level.name}</p>
                            {level.description && (
                              <p className="text-xs text-gray-500">{level.description}</p>
                            )}
                            <div className="mt-1">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${level.bgColor} ${level.textColor} font-medium`}
                              >
                                Xem trước
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingLevel(level._id)}
                            className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded text-sm font-medium"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => handleDeleteLevel(level._id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                            title="Xóa"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'curriculum' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <FiMenu /> Cấu hình chủ đề tạo đề AI
              </h2>
              <p className="text-xs text-gray-500 mt-1">Danh mục này được dùng khi tạo đề kiểm tra bằng AI và tạo bài học bằng AI.</p>
            </div>
            <label className="block min-w-40">
              <span className="block text-xs text-gray-600 mb-1">Chọn lớp</span>
              <select
                className="input-field"
                value={selectedCurriculumGrade}
                onChange={(e) => setSelectedCurriculumGrade(e.target.value)}
              >
                {Object.keys(form.curriculum || VN_MATH_CURRICULUM).sort((a, b) => Number(a) - Number(b)).map((grade) => (
                  <option key={grade} value={grade}>Lớp {grade}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-4">
            <label className="block text-xs text-gray-600 mb-1">Thêm chương / phụ lục mới</label>
            <div className="flex gap-2">
              <input
                className="input-field"
                value={newChapterName}
                onChange={(e) => setNewChapterName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddChapter())}
                placeholder="VD: Chương 1. Căn thức"
              />
              <button
                type="button"
                onClick={handleAddChapter}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <FiPlus size={14} /> Thêm
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {Object.entries((form.curriculum || {})[selectedCurriculumGrade] || {}).map(([chapter, topics]) => (
              <div
                key={chapter}
                draggable={!editingChapter}
                onDragStart={(event) => {
                  setDraggedCurriculumItem({ type: 'chapter', chapter });
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  if (draggedCurriculumItem?.type === 'chapter') event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedCurriculumItem?.type === 'chapter') moveChapter(draggedCurriculumItem.chapter, chapter);
                  setDraggedCurriculumItem(null);
                }}
                onDragEnd={() => setDraggedCurriculumItem(null)}
                className={`border rounded-lg p-4 space-y-3 transition-colors ${draggedCurriculumItem?.type === 'chapter' && draggedCurriculumItem.chapter !== chapter ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200'}`}
              >
                {editingChapter === chapter ? (
                  <div className="flex gap-2">
                    <input
                      className="input-field"
                      value={editingChapterName}
                      onChange={(e) => setEditingChapterName(e.target.value)}
                    />
                    <button type="button" onClick={() => handleRenameChapter(chapter)} className="px-3 py-2 rounded bg-green-600 text-white text-sm">Lưu</button>
                    <button type="button" onClick={() => setEditingChapter(null)} className="px-3 py-2 rounded border text-sm">Hủy</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <FiMenu className="shrink-0 cursor-grab text-gray-300" title="Kéo để đổi thứ tự chương" />
                      <h3 className="font-semibold text-gray-900">{chapter}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { setEditingChapter(chapter); setEditingChapterName(chapter); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded" title="Sửa chương">
                        <FiEdit2 size={15} />
                      </button>
                      <button type="button" onClick={() => handleDeleteChapter(chapter)} className="p-2 text-red-500 hover:bg-red-50 rounded" title="Xóa chương">
                        <FiTrash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {(topics || []).map((topic, topicIndex) => (
                    <div
                      key={`${topic}-${topicIndex}`}
                      draggable={!(editingTopic?.chapter === chapter && editingTopic?.index === topicIndex)}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        setDraggedCurriculumItem({ type: 'topic', chapter, index: topicIndex });
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(event) => {
                        if (draggedCurriculumItem?.type === 'topic' && draggedCurriculumItem.chapter === chapter) {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (draggedCurriculumItem?.type === 'topic' && draggedCurriculumItem.chapter === chapter) {
                          moveTopic(chapter, draggedCurriculumItem.index, topicIndex);
                        }
                        setDraggedCurriculumItem(null);
                      }}
                      onDragEnd={(event) => {
                        event.stopPropagation();
                        setDraggedCurriculumItem(null);
                      }}
                      className={`flex items-center justify-between gap-2 rounded border px-3 py-2 transition-colors ${draggedCurriculumItem?.type === 'topic' && draggedCurriculumItem.chapter === chapter && draggedCurriculumItem.index !== topicIndex ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}
                    >
                      {editingTopic?.chapter === chapter && editingTopic?.index === topicIndex ? (
                        <>
                          <input
                            className="input-field text-sm"
                            value={editingTopicName}
                            onChange={(e) => setEditingTopicName(e.target.value)}
                          />
                          <button type="button" onClick={() => handleRenameTopic(chapter, topicIndex)} className="px-3 py-1.5 rounded bg-green-600 text-white text-xs">Lưu</button>
                          <button type="button" onClick={() => setEditingTopic(null)} className="px-3 py-1.5 rounded border text-xs">Hủy</button>
                        </>
                      ) : (
                        <>
                          <span className="flex min-w-0 items-center gap-2 text-sm text-gray-800">
                            <FiMenu className="shrink-0 cursor-grab text-gray-300" title="Kéo để đổi thứ tự chủ đề" />
                            <span className="truncate">{topic}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => { setEditingTopic({ chapter, index: topicIndex }); setEditingTopicName(topic); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Sửa chủ đề">
                              <FiEdit2 size={13} />
                            </button>
                            <button type="button" onClick={() => handleDeleteTopic(chapter, topicIndex)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Xóa chủ đề">
                              <FiTrash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    className="input-field text-sm"
                    value={newTopicByChapter[chapter] || ''}
                    onChange={(e) => setNewTopicByChapter((prev) => ({ ...prev, [chapter]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTopic(chapter))}
                    placeholder="Thêm chủ đề mới"
                  />
                  <button type="button" onClick={() => handleAddTopic(chapter)} className="px-3 py-2 rounded bg-gray-900 text-white text-sm whitespace-nowrap">
                    <FiPlus size={14} className="inline mr-1" /> Chủ đề
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        {(activeTab === 'general' || activeTab === 'difficulty' || activeTab === 'curriculum') && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-medium"
          >
            <FiSave /> {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        )}
      </div>
    </div>
  );
}
