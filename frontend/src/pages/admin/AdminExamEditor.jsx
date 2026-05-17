import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiSave, FiPlus, FiTrash2 } from 'react-icons/fi';
import RichTextEditor from '../../components/RichTextEditor';

const defaultLevel = (name) => ({ name, fromQuestion: '', toQuestion: '', totalPoints: '', criteria: [] });

// Chuyển Date (UTC) thành giá trị local cho input datetime-local
function toLocalDatetimeInput(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminExamEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [levelOptions, setLevelOptions] = useState([]);
  const [form, setForm] = useState({
    title: '',
    content: '',
    lesson: '',
    level: '',
    totalQuestions: '',
    isTemplate: false,
    note: '',
    classSchedules: [],
    levels: [],
  });
  const [lessons, setLessons] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classLevels, setClassLevels] = useState([]);
  const [lessonCriteria, setLessonCriteria] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  // Load lists and difficulty levels
  useEffect(() => {
    api.get('/lessons').then(r => setLessons(r.data || [])).catch(() => {});
    api.get('/classes').then(r => setClasses(r.data || [])).catch(() => {});
    api.get('/levels').then(r => setClassLevels(r.data || [])).catch(() => {});
    api.get('/settings')
      .then(r => {
        const levels = r.data.difficultyLevels || [];
        setLevelOptions(levels);
      })
      .catch(() => {});
  }, []);

  // Initialize form with difficulty levels for new exams
  useEffect(() => {
    if (isEdit || levelOptions.length === 0) return;
    setForm(f => ({
      ...f,
      levels: levelOptions.map(l => defaultLevel(l.name)),
    }));
  }, [isEdit, levelOptions]);

  // Load exam for edit
  useEffect(() => {
    if (!isEdit) return;
    const loadExam = async () => {
      try {
        const { data: e } = await api.get(`/exams/${id}`);
        
        // Build levels from current levelOptions, preserving exam data where it exists
        const levelsData = levelOptions.length > 0
          ? levelOptions.map(levelOpt => {
              const found = e.levels?.find(l => l.name === levelOpt.name);
              return found
                ? { 
                    name: found.name, 
                    fromQuestion: found.fromQuestion, 
                    toQuestion: found.toQuestion, 
                    totalPoints: found.totalPoints, 
                    criteria: found.criteria || [] 
                  }
                : defaultLevel(levelOpt.name);
            })
          : e.levels || [];

        setForm({
          title: e.title || '',
          content: e.content || '',
          lesson: e.lesson?._id || e.lesson || '',
          level: e.level?._id || e.level || '',
          totalQuestions: e.totalQuestions || '',
          isTemplate: e.isTemplate || false,
          note: e.note || '',
          classSchedules: (e.classSchedules || []).map(s => ({
            class: s.class?._id || s.class || '',
            startDate: toLocalDatetimeInput(s.startDate),
            endDate: toLocalDatetimeInput(s.endDate),
          })),
          levels: levelsData,
        });
        
        if (e.lesson?._id) loadCriteria(e.lesson._id);
      } catch {
        toast.error('Không tải được đề');
      } finally {
        setFetching(false);
      }
    };
    
    loadExam();
  }, [id, isEdit, levelOptions]);

  // Load criteria when lesson changes
  const loadCriteria = (lessonId) => {
    if (!lessonId) { setLessonCriteria([]); return; }
    api.get(`/lessons/${lessonId}`)
      .then(r => setLessonCriteria(r.data.criteria || []))
      .catch(() => setLessonCriteria([]));
  };

  const handleLessonChange = (lessonId) => {
    setForm(f => ({ ...f, lesson: lessonId, levels: f.levels.map(l => ({ ...l, criteria: [] })) }));
    loadCriteria(lessonId);
  };

  const updateLevel = (idx, field, value) => {
    setForm(f => {
      const levels = [...f.levels];
      levels[idx] = { ...levels[idx], [field]: value };
      return { ...f, levels };
    });
  };

  const toggleCriterion = (levelIdx, critId) => {
    setForm(f => {
      const levels = [...f.levels];
      const level = { ...levels[levelIdx] };
      const crits = level.criteria.includes(critId)
        ? level.criteria.filter(c => c !== critId)
        : [...level.criteria, critId];
      level.criteria = crits;
      levels[levelIdx] = level;
      return { ...f, levels };
    });
  };

  const totalPoints = form.levels.reduce((s, l) => s + (Number(l.totalPoints) || 0), 0);
  const totalQuestionsCovered = form.levels.reduce((max, l) => Math.max(max, Number(l.toQuestion) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validate
    if (!form.title.trim()) return toast.error('Nhập tiêu đề đề kiểm tra');
    if (!form.totalQuestions || Number(form.totalQuestions) < 1) return toast.error('Nhập số câu hỏi');
    const levels = form.levels.filter(l => l.fromQuestion && l.toQuestion && l.totalPoints);
    if (levels.length === 0) return toast.error('Thiết lập ít nhất một mức độ câu hỏi');

    setLoading(true);
    try {
      const payload = {
        title: form.title,
        content: form.content,
        totalQuestions: Number(form.totalQuestions),
        isTemplate: form.isTemplate,
        note: form.note,
        levels: form.levels
          .filter(l => l.fromQuestion && l.toQuestion && l.totalPoints)
          .map(l => ({
            name: l.name,
            fromQuestion: Number(l.fromQuestion),
            toQuestion: Number(l.toQuestion),
            totalPoints: Number(l.totalPoints),
            criteria: l.criteria,
          })),
        classSchedules: form.classSchedules
          .filter(s => s.class)
          .map(s => ({
            class: s.class,
            startDate: s.startDate ? new Date(s.startDate).toISOString() : null,
            endDate: s.endDate ? new Date(s.endDate).toISOString() : null,
          })),
      };

      if (form.lesson) payload.lesson = form.lesson;
      if (form.level) payload.level = form.level;

      if (isEdit) {
        await api.put(`/exams/${id}`, payload);
        toast.success('Đã cập nhật đề kiểm tra');
      } else {
        await api.post('/exams', payload);
        toast.success('Đã tạo đề kiểm tra');
      }
      navigate('/admin/exams');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu đề');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/exams')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm">
          <FiArrowLeft size={16} /> Quay lại
        </button>
        <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Chỉnh sửa đề kiểm tra' : 'Tạo đề kiểm tra mới'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Thông tin đề</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề đề *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="VD: Kiểm tra 15 phút - Chương 1"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chủ đề / Bài học</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.lesson}
                onChange={e => handleLessonChange(e.target.value)}
              >
                <option value="">-- Chọn bài học --</option>
                {lessons.map(l => (
                  <option key={l._id} value={l._id}>{l.title}</option>
                ))}
              </select>
              {form.lesson && lessonCriteria.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">Bài học này chưa có tiêu chí đánh giá</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cấp Độ Lớp (Lớp 6, 7, 8...)</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.level}
                onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
              >
                <option value="">-- Chọn cấp độ lớp --</option>
                {classLevels.map(l => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Giao đề cho lớp học */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Giao đề cho lớp học</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, classSchedules: [...f.classSchedules, { class: '', startDate: '', endDate: '' }] }))}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-300 px-2 py-1 rounded-lg hover:bg-blue-50"
              >
                <FiPlus size={13} /> Thêm lớp
              </button>
            </div>
            {form.classSchedules.length === 0 && (
              <p className="text-xs text-gray-400 italic">Chưa giao cho lớp nào (ngân hàng đề)</p>
            )}
            <div className="space-y-3">
              {form.classSchedules.map((schedule, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={schedule.class}
                      onChange={e => {
                        const val = e.target.value;
                        setForm(f => {
                          const cs = [...f.classSchedules];
                          cs[idx] = { ...cs[idx], class: val };
                          return { ...f, classSchedules: cs };
                        });
                      }}
                    >
                      <option value="">-- Chọn lớp --</option>
                      {classes.map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, classSchedules: f.classSchedules.filter((_, i) => i !== idx) }))}
                      className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded"
                    >
                      <FiTrash2 size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🕐 Bắt đầu <span className="text-gray-400">(tuỳ chọn)</span></label>
                      <input
                        type="datetime-local"
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={schedule.startDate}
                        onChange={e => {
                          const val = e.target.value;
                          setForm(f => {
                            const cs = [...f.classSchedules];
                            cs[idx] = { ...cs[idx], startDate: val };
                            return { ...f, classSchedules: cs };
                          });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🕐 Kết thúc <span className="text-gray-400">(tuỳ chọn)</span></label>
                      <input
                        type="datetime-local"
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={schedule.endDate}
                        onChange={e => {
                          const val = e.target.value;
                          setForm(f => {
                            const cs = [...f.classSchedules];
                            cs[idx] = { ...cs[idx], endDate: val };
                            return { ...f, classSchedules: cs };
                          });
                        }}
                      />
                      {schedule.startDate && schedule.endDate && new Date(schedule.endDate) <= new Date(schedule.startDate) && (
                        <p className="text-xs text-red-500 mt-1">⚠ Kết thúc phải sau bắt đầu</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tổng số câu hỏi *</label>
              <input
                type="number"
                min="1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="VD: 10"
                value={form.totalQuestions}
                onChange={e => setForm(f => ({ ...f, totalQuestions: e.target.value }))}
                required
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isTemplate}
                  onChange={e => setForm(f => ({ ...f, isTemplate: e.target.checked }))}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">Lưu vào ngân hàng đề</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ghi chú thêm (tuỳ chọn)"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            />
          </div>

          {/* Thời gian mở/đóng đề đã chuyển vào từng lớp học ở trên */}
        </div>

        {/* Nội dung đề */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
          <h2 className="font-semibold text-gray-800">Nội dung đề kiểm tra</h2>
          <p className="text-xs text-gray-500">Soạn đề bài, câu hỏi, hình vẽ. Hỗ trợ công thức toán LaTeX.</p>
          <RichTextEditor
            value={form.content}
            onChange={(html) => setForm(f => ({ ...f, content: html }))}
            placeholder="Nhập nội dung đề kiểm tra. Dùng nút ƒx để chèn công thức toán..."
          />
        </div>

        {/* Levels */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Phân loại mức độ câu hỏi</h2>
            <div className="text-sm text-gray-500">Tổng điểm: <span className="font-bold text-blue-700">{totalPoints}</span></div>
          </div>

          {form.levels.map((level, idx) => {
            const levelOption = levelOptions.find(lo => lo.name === level.name);
            const bgClass = levelOption?.bgColor || 'bg-gray-50';
            const borderClass = bgClass.replace('bg-', 'border-').replace('-100', '-200');
            const textClass = levelOption?.textColor?.replace('text-', 'text-').replace('-700', '-800') || 'text-gray-800';

            return (
              <div
                key={level.name}
                className={`border rounded-xl p-4 space-y-3 ${borderClass} ${bgClass}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className={`font-semibold text-sm ${textClass}`}>
                    {level.name}
                  </h3>
                  {level.fromQuestion && level.toQuestion && (
                    <span className="text-xs text-gray-500">{Number(level.toQuestion) - Number(level.fromQuestion) + 1} câu</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Từ câu</label>
                    <input
                      type="number" min="1" max={form.totalQuestions || 999}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="VD: 1"
                      value={level.fromQuestion}
                      onChange={e => updateLevel(idx, 'fromQuestion', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Đến câu</label>
                    <input
                      type="number" min="1" max={form.totalQuestions || 999}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="VD: 2"
                      value={level.toQuestion}
                      onChange={e => updateLevel(idx, 'toQuestion', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Tổng điểm mức này</label>
                    <input
                      type="number" min="0" step="0.5"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="VD: 5"
                      value={level.totalPoints}
                      onChange={e => updateLevel(idx, 'totalPoints', e.target.value)}
                    />
                  </div>
                </div>

                {/* Criteria selection */}
                <div>
                  <label className={`block text-xs font-medium mb-2 ${textClass}`}>
                    Tiêu chí đánh giá cho mức này:
                  </label>
                  {!form.lesson ? (
                    <p className="text-xs text-gray-400 italic">Chọn bài học để thêm tiêu chí</p>
                  ) : lessonCriteria.length === 0 ? (
                    <p className="text-xs text-yellow-600 italic">Bài học chưa có tiêu chí đánh giá</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {lessonCriteria.map(c => (
                        <button
                          key={c._id}
                          type="button"
                          onClick={() => toggleCriterion(idx, c._id)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            level.criteria.includes(c._id)
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {level.criteria.length > 0 && (
                    <p className="text-xs text-purple-600 mt-1">{level.criteria.length} tiêu chí đã chọn</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Summary */}
          {form.totalQuestions && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
              <p>📋 Tổng câu bao phủ: {totalQuestionsCovered} / {form.totalQuestions} câu</p>
              <p>💯 Tổng điểm: {totalPoints}</p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-3 pb-8">
          <button type="button" onClick={() => navigate('/admin/exams')} className="flex-1 border border-gray-300 text-gray-600 px-4 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium">
            Hủy
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 text-sm font-medium"
          >
            <FiSave size={15} />
            {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật đề' : 'Tạo đề'}
          </button>
        </div>
      </form>
    </div>
  );
}
