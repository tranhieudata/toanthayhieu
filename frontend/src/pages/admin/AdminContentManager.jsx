import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiBook, FiFileText, FiLayers, FiPlus, FiEdit2, FiTrash2, FiX, FiChevronRight, FiArrowLeft, FiDownload } from 'react-icons/fi';

const emptyExercise = { title: '', description: '', lesson: '', timeLimit: 30, passingScore: 70, isPublished: false, questions: [] };
const emptyQ = { question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' };

export default function AdminContentManager() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);

  // Exercise form
  const [exerciseModal, setExerciseModal] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(emptyExercise);
  const [editExerciseId, setEditExerciseId] = useState(null);
  const [lessons4Ex, setLessons4Ex] = useState([]);

  const [loading, setLoading] = useState(false);

  // Load courses
  useEffect(() => {
    api.get('/courses/admin/all').then(res => setCourses(res.data)).catch(() => setCourses([]));
  }, []);

  // Load lessons when course selected
  useEffect(() => {
    if (selectedCourse) {
      api.get(`/lessons?course=${selectedCourse._id}`)
        .then(res => setLessons(res.data))
        .catch(() => setLessons([]));
      setSelectedLesson(null);
      setExercises([]);
    }
  }, [selectedCourse]);

  // Load exercises when lesson selected
  useEffect(() => {
    if (selectedLesson) {
      api.get(`/exercises?lesson=${selectedLesson._id}`)
        .then(res => setExercises(res.data))
        .catch(() => setExercises([]));
    }
  }, [selectedLesson]);

  // Lesson operations
  const openCreateLesson = () => {
    navigate(`/admin/lessons/new?course=${selectedCourse._id}`);
  };

  const openEditLesson = (lesson) => {
    navigate(`/admin/lessons/${lesson._id}/edit`);
  };

  const handleDeleteLesson = async (id) => {
    if (!confirm('Xóa bài học này?')) return;
    try {
      await api.delete(`/lessons/${id}`);
      toast.success('Xóa thành công');
      api.get(`/lessons?course=${selectedCourse._id}`).then(res => setLessons(res.data));
      setSelectedLesson(null);
      setExercises([]);
    } catch {
      toast.error('Xóa thất bại');
    }
  };

  // Exercise operations
  const openCreateExercise = () => {
    setExerciseForm({ ...emptyExercise, lesson: selectedLesson._id, questions: [{ ...emptyQ, options: ['', '', '', ''] }] });
    setEditExerciseId(null);
    setExerciseModal(true);
  };

  const openEditExercise = (ex) => {
    setExerciseForm(ex);
    setEditExerciseId(ex._id);
    setExerciseModal(true);
  };

  const handleExerciseSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editExerciseId) {
        await api.put(`/exercises/${editExerciseId}`, exerciseForm);
        toast.success('Cập nhật bài tập thành công');
      } else {
        await api.post('/exercises', { ...exerciseForm, lesson: selectedLesson._id });
        toast.success('Tạo bài tập thành công');
      }
      setExerciseModal(false);
      api.get(`/exercises?lesson=${selectedLesson._id}`).then(res => setExercises(res.data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExercise = async (id) => {
    if (!confirm('Xóa bài tập này?')) return;
    try {
      await api.delete(`/exercises/${id}`);
      toast.success('Xóa thành công');
      api.get(`/exercises?lesson=${selectedLesson._id}`).then(res => setExercises(res.data));
    } catch {
      toast.error('Xóa thất bại');
    }
  };

  return (
    <div className="flex gap-4 h-screen overflow-hidden">
      {/* Left: Courses list */}
      <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
        <div className="p-4 border-b sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900 text-sm">Khóa học</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {courses.map(course => (
            <button
              key={course._id}
              onClick={() => setSelectedCourse(course)}
              className={`w-full text-left px-4 py-3 text-sm border-b transition-colors flex items-center gap-2 ${
                selectedCourse?._id === course._id
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FiBook size={14} />
              <span className="truncate">{course.title}</span>
              <FiChevronRight size={14} className="ml-auto flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      {selectedCourse ? (
        <>
          {/* Middle: Lessons list */}
          <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
            <div className="p-4 border-b sticky top-0 bg-white">
              <button onClick={() => setSelectedCourse(null)} className="flex items-center gap-1 text-blue-600 text-xs font-medium mb-2">
                <FiArrowLeft size={12} /> Quay lại
              </button>
              <h3 className="font-bold text-gray-900 text-sm">{selectedCourse.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{lessons.length} bài học</p>
            </div>
            <div className="p-3 border-t bg-white">
              <button
                onClick={openCreateLesson}
                className="w-full btn-primary text-xs flex items-center justify-center gap-1"
              >
                <FiPlus size={12} /> Thêm bài học
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {lessons.map((lesson, idx) => (
                <button
                  key={lesson._id}
                  onClick={() => setSelectedLesson(lesson)}
                  className={`w-full text-left px-4 py-3 text-sm border-b transition-colors ${
                    selectedLesson?._id === lesson._id
                      ? 'bg-blue-50 text-blue-600 border-blue-200'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-xs">{idx + 1}. {lesson.title}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{lesson.duration || '—'} phút</p>
                </button>
              ))}
            </div>

            
          </div>

          {/* Right: Lesson details + Exercises */}
          {selectedLesson ? (
            <div className="flex-1 bg-gray-50 overflow-y-auto p-6">
              <div className="max-w-3xl">
                {/* Lesson card */}
                <div className="card p-6 mb-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedLesson.title}</h2>
                      <p className="text-sm text-gray-500 mt-1">Bài học #{lessons.findIndex(l => l._id === selectedLesson._id) + 1}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditLesson(selectedLesson)}
                        className="text-blue-600 hover:text-blue-800 p-2"
                      >
                        <FiEdit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteLesson(selectedLesson._id)}
                        className="text-red-500 hover:text-red-700 p-2"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {selectedLesson.videoUrl && (
                    <div className="mb-4 rounded-lg overflow-hidden bg-black aspect-video">
                      <iframe
                        src={toEmbedUrl(selectedLesson.videoUrl)}
                        className="w-full h-full"
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      ></iframe>
                    </div>
                  )}

                  {selectedLesson.content && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {selectedLesson.content}
                    </div>
                  )}

                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Thứ tự: {selectedLesson.order}</span>
                    <span>Thời lượng: {selectedLesson.duration || '—'} phút</span>
                    <span>Trạng thái: {selectedLesson.isPublished ? '✓ Đã đăng' : '◯ Nháp'}</span>
                  </div>
                </div>

                {/* Exercises section */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                      <FiLayers size={18} /> Bài tập ({exercises.length})
                    </h3>
                    <button onClick={openCreateExercise} className="btn-primary text-xs flex items-center gap-1">
                      <FiPlus size={12} /> Thêm bài tập
                    </button>
                  </div>

                  {exercises.length === 0 ? (
                    <div className="card p-8 text-center text-gray-500">
                      <FiLayers size={32} className="mx-auto mb-2 text-gray-300" />
                      <p>Chưa có bài tập nào</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {exercises.map((ex) => (
                        <div key={ex._id} className="card p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">{ex.title}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {ex.questions?.length || 0} câu • {ex.timeLimit} phút • Đạt {ex.passingScore}%
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => openEditExercise(ex)} className="text-blue-600 p-1">
                                <FiEdit2 size={14} />
                              </button>
                              <button onClick={() => handleDeleteExercise(ex._id)} className="text-red-500 p-1">
                                <FiTrash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-gray-50 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <FiFileText size={48} className="mx-auto mb-2 text-gray-300" />
                <p>Chọn một bài học để xem chi tiết</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 bg-gray-50 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <FiBook size={48} className="mx-auto mb-2 text-gray-300" />
            <p>Chọn một khóa học để bắt đầu</p>
          </div>
        </div>
      )}

      {/* Lesson Modal */}

      {/* Exercise Modal */}
      {exerciseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-lg">{editExerciseId ? 'Chỉnh sửa' : 'Tạo'} bài tập</h2>
              <button onClick={() => setExerciseModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleExerciseSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề *</label>
                <input
                  className="input-field"
                  value={exerciseForm.title}
                  onChange={e => setExerciseForm({ ...exerciseForm, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  value={exerciseForm.description}
                  onChange={e => setExerciseForm({ ...exerciseForm, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian (phút)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={exerciseForm.timeLimit}
                    onChange={e => setExerciseForm({ ...exerciseForm, timeLimit: Number(e.target.value) })}
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Điểm đạt (%)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={exerciseForm.passingScore}
                    onChange={e => setExerciseForm({ ...exerciseForm, passingScore: Number(e.target.value) })}
                    min={0}
                    max={100}
                  />
                </div>
              </div>

              {/* Questions */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-medium text-gray-700">Câu hỏi ({exerciseForm.questions?.length})</label>
                  <button
                    type="button"
                    onClick={() =>
                      setExerciseForm(f => ({
                        ...f,
                        questions: [...f.questions, { ...emptyQ, options: ['', '', '', ''] }],
                      }))
                    }
                    className="text-blue-600 text-sm hover:underline"
                  >
                    + Thêm câu hỏi
                  </button>
                </div>
                {exerciseForm.questions?.map((q, qi) => (
                  <div key={qi} className="border border-gray-200 rounded-lg p-4 mb-3">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Câu {qi + 1}</span>
                      <button
                        type="button"
                        onClick={() => setExerciseForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== qi) }))}
                        className="text-red-500 text-xs"
                      >
                        <FiX />
                      </button>
                    </div>
                    <input
                      className="input-field mb-2 text-sm"
                      placeholder="Nội dung câu hỏi"
                      value={q.question}
                      onChange={e =>
                        setExerciseForm(f => ({
                          ...f,
                          questions: f.questions.map((qq, i) => (i === qi ? { ...qq, question: e.target.value } : qq)),
                        }))
                      }
                    />
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2 mb-1">
                        <input
                          type="radio"
                          name={`correct_${qi}`}
                          checked={q.correctAnswer === oi}
                          onChange={() =>
                            setExerciseForm(f => ({
                              ...f,
                              questions: f.questions.map((qq, i) => (i === qi ? { ...qq, correctAnswer: oi } : qq)),
                            }))
                          }
                        />
                        <input
                          className="input-field flex-1 text-sm py-1.5"
                          placeholder={`Đáp án ${String.fromCharCode(65 + oi)}`}
                          value={opt}
                          onChange={e =>
                            setExerciseForm(f => ({
                              ...f,
                              questions: f.questions.map((qq, i) =>
                                i === qi ? { ...qq, options: qq.options.map((o, j) => (j === oi ? e.target.value : o)) } : qq
                              ),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exerciseForm.isPublished}
                  onChange={e => setExerciseForm({ ...exerciseForm, isPublished: e.target.checked })}
                />
                <span className="text-sm font-medium text-gray-700">Công khai</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setExerciseModal(false)} className="btn-secondary flex-1">Hủy</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function toEmbedUrl(url) {
  if (!url) return '';
  if (url.includes('youtube.com/embed/') || url.includes('player.vimeo.com')) return url;
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  return url;
}
