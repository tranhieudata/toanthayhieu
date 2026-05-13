import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX } from 'react-icons/fi';

const emptyForm = { title: '', description: '', lesson: '', timeLimit: 30, passingScore: 70, isPublished: false, questions: [] };
const emptyQ = { question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' };

export default function AdminExercises() {
  const [exercises, setExercises] = useState([]);
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => api.get('/exercises').then(res => setExercises(res.data));

  useEffect(() => {
    load();
    api.get('/courses/admin/all').then(res => setCourses(res.data));
  }, []);

  // Khi chọn course, load lessons của course đó
  const handleCourseChange = async (courseId) => {
    setSelectedCourse(courseId);
    setForm(f => ({ ...f, lesson: '' }));
    if (courseId) {
      try {
        const res = await api.get(`/lessons?course=${courseId}`);
        setLessons(res.data);
      } catch { setLessons([]); }
    } else {
      setLessons([]);
    }
  };

  const openCreate = () => {
    setForm({ ...emptyForm, questions: [{ ...emptyQ, options: ['', '', '', ''] }] });
    setSelectedCourse(''); setLessons([]); setEditId(null); setModal(true);
  };
  const openEdit = async (ex) => {
    // Load lessons của course tương ứng
    const courseId = ex.course?._id || ex.course || '';
    setSelectedCourse(courseId);
    if (courseId) {
      try {
        const res = await api.get(`/lessons?course=${courseId}`);
        setLessons(res.data);
      } catch { setLessons([]); }
    }
    setForm({ title: ex.title, description: ex.description, lesson: ex.lesson?._id || ex.lesson || '', timeLimit: ex.timeLimit, passingScore: ex.passingScore, isPublished: ex.isPublished, questions: ex.questions });
    setEditId(ex._id); setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editId) { await api.put(`/exercises/${editId}`, form); toast.success('Cập nhật bài tập thành công'); }
      else { await api.post('/exercises', form); toast.success('Tạo bài tập thành công'); }
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Có lỗi xảy ra'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa bài tập này?')) return;
    try { await api.delete(`/exercises/${id}`); toast.success('Xóa thành công'); load(); }
    catch { toast.error('Xóa thất bại'); }
  };

  const addQuestion = () => setForm(f => ({ ...f, questions: [...f.questions, { ...emptyQ, options: ['', '', '', ''] }] }));
  const removeQuestion = (i) => setForm(f => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));
  const updateQ = (i, key, val) => setForm(f => ({ ...f, questions: f.questions.map((q, idx) => idx === i ? { ...q, [key]: val } : q) }));
  const updateOpt = (qi, oi, val) => setForm(f => ({ ...f, questions: f.questions.map((q, idx) => idx === qi ? { ...q, options: q.options.map((o, oidx) => oidx === oi ? val : o) } : q) }));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý bài tập</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><FiPlus /> Thêm bài tập</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Tên bài tập', 'Bài học', 'Số câu', 'Thời gian', 'Trạng thái', 'Thao tác'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {exercises.map(ex => (
              <tr key={ex._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{ex.title}</td>
                <td className="px-4 py-3 text-gray-600">{ex.lesson?.title || '—'}</td>
                <td className="px-4 py-3 text-center">{ex.questions?.length || 0} câu</td>
                <td className="px-4 py-3 text-gray-600">{ex.timeLimit} phút</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ex.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {ex.isPublished ? 'Đã đăng' : 'Nháp'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(ex)} className="text-blue-600 hover:text-blue-800"><FiEdit2 /></button>
                  <button onClick={() => handleDelete(ex._id)} className="text-red-500 hover:text-red-700"><FiTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-lg">{editId ? 'Chỉnh sửa' : 'Tạo'} bài tập</h2>
              <button onClick={() => setModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên bài tập *</label>
                <input className="input-field" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Khóa học *</label>
                <select className="input-field" value={selectedCourse} onChange={e => handleCourseChange(e.target.value)} required>
                  <option value="">Chọn khóa học</option>
                  {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bài học *</label>
                <select className="input-field" value={form.lesson} onChange={e => setForm({...form, lesson: e.target.value})} required disabled={!selectedCourse}>
                  <option value="">{selectedCourse ? 'Chọn bài học' : 'Chọn khóa học trước'}</option>
                  {lessons.map(l => <option key={l._id} value={l._id}>{l.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <input className="input-field" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian (phút)</label>
                  <input type="number" className="input-field" value={form.timeLimit} onChange={e => setForm({...form, timeLimit: Number(e.target.value)})} min={1} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Điểm đạt (%)</label>
                  <input type="number" className="input-field" value={form.passingScore} onChange={e => setForm({...form, passingScore: Number(e.target.value)})} min={0} max={100} />
                </div>
              </div>

              {/* Questions */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-medium text-gray-700">Câu hỏi ({form.questions.length})</label>
                  <button type="button" onClick={addQuestion} className="text-blue-600 text-sm hover:underline">+ Thêm câu hỏi</button>
                </div>
                {form.questions.map((q, qi) => (
                  <div key={qi} className="border border-gray-200 rounded-lg p-4 mb-3">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Câu {qi + 1}</span>
                      <button type="button" onClick={() => removeQuestion(qi)} className="text-red-500 text-xs"><FiX /></button>
                    </div>
                    <input className="input-field mb-2 text-sm" placeholder="Nội dung câu hỏi" value={q.question} onChange={e => updateQ(qi, 'question', e.target.value)} />
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2 mb-1">
                        <input type="radio" name={`correct_${qi}`} checked={q.correctAnswer === oi} onChange={() => updateQ(qi, 'correctAnswer', oi)} className="text-blue-600" />
                        <input className="input-field flex-1 text-sm py-1.5" placeholder={`Đáp án ${String.fromCharCode(65 + oi)}`} value={opt} onChange={e => updateOpt(qi, oi, e.target.value)} />
                      </div>
                    ))}
                    <input className="input-field mt-2 text-sm text-gray-500" placeholder="Giải thích (không bắt buộc)" value={q.explanation} onChange={e => updateQ(qi, 'explanation', e.target.value)} />
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isPublished} onChange={e => setForm({...form, isPublished: e.target.checked})} className="w-4 h-4" />
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
