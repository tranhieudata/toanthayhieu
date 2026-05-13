import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiBook, FiFileText, FiLayers, FiPlus, FiEdit2, FiTrash2, FiX, FiChevronRight, FiArrowLeft, FiDownload, FiEye } from 'react-icons/fi';
import 'katex/dist/katex.min.css';
import katex from 'katex';

const emptyExercise = { title: '', description: '', lesson: '', timeLimit: 30, passingScore: 70, isPublished: false, questions: [] };
const emptyQ = { question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' };
const emptyCourse = { title: '', description: '', category: '', level: 'beginner', price: 0, thumbnail: '', duration: '', tags: [] };

export default function AdminContentManager() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [searchLesson, setSearchLesson] = useState('');

  // Course form
  const [courseModal, setCourseModal] = useState(false);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [editingCourseId, setEditingCourseId] = useState(null);

  // Exercise form
  const [exerciseModal, setExerciseModal] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(emptyExercise);
  const [editExerciseId, setEditExerciseId] = useState(null);
  const [lessons4Ex, setLessons4Ex] = useState([]);

  const [loading, setLoading] = useState(false);

  // Render LaTeX khi popup bài học mở
  useEffect(() => {
    if (!selectedLesson?.content) return;
    const timer = setTimeout(() => {
      const contentEl = document.querySelector('.admin-lesson-content .ql-editor');
      if (!contentEl) return;
      const walker = document.createTreeWalker(
        contentEl,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            let el = node.parentElement;
            while (el && el !== contentEl) {
              if (el.classList.contains('ql-formula') || el.classList.contains('katex') || el.classList.contains('katex-display'))
                return NodeFilter.FILTER_REJECT;
              el = el.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );
      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) {
        if (/\$/.test(node.textContent)) textNodes.push(node);
      }
      textNodes.forEach(textNode => {
        const text = textNode.textContent;
        if (!/\$/.test(text)) return;
        const html = text
          .replace(/\$\$([^$]+?)\$\$/g, (match, f) => {
            try { return katex.renderToString(f.trim(), { displayMode: true, throwOnError: false }); }
            catch { return match; }
          })
          .replace(/\$([^$\n]+?)\$/g, (match, f) => {
            if (!f.trim()) return match;
            try { return katex.renderToString(f.trim(), { throwOnError: false }); }
            catch { return match; }
          });
        if (html !== text) {
          const span = document.createElement('span');
          span.innerHTML = html;
          textNode.parentNode.replaceChild(span, textNode);
        }
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedLesson]);

  // Load courses helper
  const loadCourses = () => {
    api.get('/courses/admin/all').then(res => setCourses(res.data)).catch(() => setCourses([]));
  };

  // Load courses
  useEffect(() => {
    const returnCourseId = searchParams.get('course');
    api.get('/courses/admin/all')
      .then(res => {
        setCourses(res.data);
        // Tự động chọn lại khóa học nếu quay lại từ trang sửa bài học
        if (returnCourseId) {
          const found = res.data.find(c => c._id === returnCourseId);
          if (found) setSelectedCourse(found);
        }
      })
      .catch(() => setCourses([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Course operations
  const openCreateCourse = () => {
    setCourseForm(emptyCourse);
    setEditingCourseId(null);
    setCourseModal(true);
  };

  const handleEditCourse = (course) => {
    setCourseForm({
      title: course.title || '',
      description: course.description || '',
      category: course.category || '',
      level: course.level || 'beginner',
      price: course.price || 0,
      thumbnail: course.thumbnail || '',
      duration: course.duration || '',
      tags: course.tags || [],
    });
    setEditingCourseId(course._id);
    setCourseModal(true);
  };

  const handleCourseSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingCourseId) {
        await api.put(`/courses/${editingCourseId}`, courseForm);
        toast.success('Cập nhật khóa học thành công');
      } else {
        await api.post('/courses', courseForm);
        toast.success('Tạo khóa học thành công');
      }
      setCourseModal(false);
      setCourseForm(emptyCourse);
      setEditingCourseId(null);
      loadCourses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCourse = async (id) => {
    if (!confirm('Xóa khóa học này? Tất cả bài học và bài tập sẽ bị xóa')) return;
    try {
      await api.delete(`/courses/${id}`);
      toast.success('Xóa khóa học thành công');
      loadCourses();
      if (selectedCourse?._id === id) {
        setSelectedCourse(null);
        setLessons([]);
        setExercises([]);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Xóa thất bại');
    }
  };

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
    <div className="w-full h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Quản lý nội dung</h1>
            <p className="text-gray-600 mt-1">
              {selectedCourse ? selectedCourse.title : 'Danh sách khóa học'}
            </p>
          </div>
          {!selectedCourse && (
            <button
              onClick={openCreateCourse}
              className="btn-primary flex items-center gap-2"
            >
              <FiPlus size={18} /> Thêm khóa học
            </button>
          )}
          
        </div>
      </div>

      {/* Content - List view */}
      {!selectedCourse && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {courses.length === 0 ? (
              <div className="card p-12 text-center text-gray-500">
                <FiBook size={48} className="mx-auto mb-4 text-gray-300" />
                <p className="text-lg">Chưa có khóa học nào</p>
                <p className="text-sm mt-2">Hãy tạo khóa học đầu tiên của bạn</p>
              </div>
            ) : (
              <div className="space-y-4">
                {courses.map(course => (
                  <div
                    key={course._id}
                    className="card p-6 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedCourse(course)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900">{course.title}</h3>
                        <p className="text-gray-600 text-sm mt-1">{course.description}</p>
                        <div className="flex gap-4 mt-3 text-xs text-gray-500">
                          <span>📁 {course.category}</span>
                          <span>📊 {course.level}</span>
                          <span>💰 {course.price.toLocaleString()}đ</span>
                          <span>⏱️ {course.duration}</span>
                          <span>{course.isPublished ? '✅ Đã công khai' : '🔒 Nháp'}</span>
                        </div>
                      </div>
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedCourse(course)}
                          className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Xem chi tiết"
                        >
                          <FiEye size={18} />
                        </button>
                        <button
                          onClick={() => handleEditCourse(course)}
                          className="text-green-600 hover:text-green-800 p-2 hover:bg-green-50 rounded-lg transition-colors"
                          title="Sửa khóa học"
                        >
                          <FiEdit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteCourse(course._id)}
                          className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa khóa học"
                        >
                          <FiTrash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content - Course detail with lessons */}
      {selectedCourse && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Header when course selected */}
          <div className="bg-white border-b border-gray-200 p-6">
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Danh sách Bài Học</h2>
                  <p className="text-gray-600 mt-1">{selectedCourse.title}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedCourse(null);
                    setSelectedLesson(null);
                    setLessons([]);
                    setExercises([]);
                    setSearchLesson('');
                  }}
                  className="btn-secondary flex items-center gap-2"
                >
                  <FiArrowLeft size={18} /> Quay lại
                </button>
              </div>

              {/* Search and actions */}
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Tìm kiếm bài học..."
                  className="input-field flex-1"
                  value={searchLesson}
                  onChange={e => setSearchLesson(e.target.value)}
                />
                <button
                  onClick={openCreateLesson}
                  className="btn-primary flex items-center gap-2"
                >
                  <FiPlus size={16} /> Thêm bài học
                </button>
              </div>
            </div>
          </div>

          {/* Lessons list */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto">
              {lessons.filter(l => l.title.toLowerCase().includes(searchLesson.toLowerCase())).length === 0 ? (
                <div className="card p-12 text-center text-gray-500">
                  <FiFileText size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">Chưa có bài học nào</p>
                  <p className="text-sm mt-2">Hãy thêm bài học đầu tiên</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {lessons.filter(l => l.title.toLowerCase().includes(searchLesson.toLowerCase())).map((lesson, idx) => (
                    <div
                      key={lesson._id}
                      className="card p-4 hover:shadow-md transition-shadow flex justify-between items-center group cursor-pointer"
                      onClick={() => setSelectedLesson(lesson)}
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{idx + 1}. {lesson.title}</p>
                        <div className="flex gap-4 mt-2 text-xs text-gray-500">
                          <span>⏱️ {lesson.duration || '—'} phút</span>
                          <span>{lesson.isPublished ? '✅ Đã đăng' : '🔒 Nháp'}</span>
                          <span>📋 {lesson.order} thứ tự</span>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.stopPropagation(); openEditLesson(lesson); }}
                          className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-lg"
                          title="Sửa"
                        >
                          <FiEdit2 size={18} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteLesson(lesson._id); }}
                          className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg"
                          title="Xóa"
                        >
                          <FiTrash2 size={18} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedLesson(lesson); }}
                          className="text-gray-600 hover:text-gray-800 p-2 hover:bg-gray-50 rounded-lg"
                          title="Xem chi tiết"
                        >
                          <FiChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lesson detail modal */}
          {selectedLesson && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
                  <h2 className="font-bold text-lg">{selectedLesson.title}</h2>
                  <button onClick={() => { setSelectedLesson(null); setExercises([]); }}>
                    <FiX size={24} />
                  </button>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Thứ tự</label>
                      <p className="text-gray-900 font-semibold">{selectedLesson.order}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Thời lượng</label>
                      <p className="text-gray-900 font-semibold">{selectedLesson.duration || '—'} phút</p>
                    </div>
                  </div>

                  {selectedLesson.videoUrl && (
                    <div className="mb-6 rounded-lg overflow-hidden bg-black aspect-video">
                      <iframe
                        src={toEmbedUrl(selectedLesson.videoUrl)}
                        className="w-full h-full"
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      ></iframe>
                    </div>
                  )}

                  {selectedLesson.content && (
                    <div className="admin-lesson-content mb-6">
                      <div
                        className="ql-editor"
                        dangerouslySetInnerHTML={{ __html: selectedLesson.content }}
                      />
                    </div>
                  )}

                  {/* Exercises section */}
                  <div className="mt-6 pt-6 border-t">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                        <FiLayers size={18} /> Bài tập ({exercises.length})
                      </h3>
                      <button onClick={openCreateExercise} className="btn-primary text-xs flex items-center gap-1">
                        <FiPlus size={12} /> Thêm bài tập
                      </button>
                    </div>

                    {exercises.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        <FiLayers size={32} className="mx-auto mb-2 text-gray-300" />
                        <p>Chưa có bài tập nào</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {exercises.map((ex) => (
                          <div key={ex._id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold text-gray-900">{ex.title}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {ex.questions?.length || 0} câu • {ex.timeLimit} phút • Đạt {ex.passingScore}%
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => openEditExercise(ex)} className="text-blue-600 p-1">
                                  <FiEdit2 size={16} />
                                </button>
                                <button onClick={() => handleDeleteExercise(ex._id)} className="text-red-500 p-1">
                                  <FiTrash2 size={16} />
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
            </div>
          )}
        </div>
      )}

      {/* Course Modal */}
      {courseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-lg">{editingCourseId ? 'Sửa khóa học' : 'Tạo khóa học mới'}</h2>
              <button onClick={() => { setCourseModal(false); setEditingCourseId(null); }}><FiX /></button>
            </div>
            <form onSubmit={handleCourseSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Nhập tiêu đề khóa học"
                  value={courseForm.title}
                  onChange={e => setCourseForm({ ...courseForm, title: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả *</label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Nhập mô tả khóa học"
                  value={courseForm.description}
                  onChange={e => setCourseForm({ ...courseForm, description: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ví dụ: Toán, Lý, Hóa"
                    value={courseForm.category}
                    onChange={e => setCourseForm({ ...courseForm, category: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cấp độ</label>
                  <select
                    className="input-field"
                    value={courseForm.level}
                    onChange={e => setCourseForm({ ...courseForm, level: e.target.value })}
                  >
                    <option value="beginner">Cơ bản</option>
                    <option value="intermediate">Trung bình</option>
                    <option value="advanced">Nâng cao</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá (VND)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={courseForm.price}
                    onChange={e => setCourseForm({ ...courseForm, price: Number(e.target.value) })}
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thời lượng (giờ)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ví dụ: 10 giờ"
                    value={courseForm.duration}
                    onChange={e => setCourseForm({ ...courseForm, duration: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Hình thumbnail</label>
                <input
                  type="url"
                  className="input-field"
                  placeholder="https://example.com/image.jpg"
                  value={courseForm.thumbnail}
                  onChange={e => setCourseForm({ ...courseForm, thumbnail: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tags (phân cách bằng dấu phẩy)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ví dụ: tag1, tag2, tag3"
                  value={courseForm.tags.join(', ')}
                  onChange={e => setCourseForm({ ...courseForm, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setCourseModal(false); setEditingCourseId(null); }} className="btn-secondary flex-1">Hủy</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? 'Đang lưu...' : editingCourseId ? 'Lưu thập chỉ' : 'Tạo khóa học'}
                </button>
              </div>
            </form>
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

/* ───── Quill content styles for admin lesson preview ───── */
const lessonContentStyle = `
  .admin-lesson-content .ql-editor { padding: 0; border: none; font-family: inherit; font-size: 1rem; line-height: 1.7; }
  .admin-lesson-content .ql-editor h1 { font-size: 1.75em; font-weight: bold; margin: 1em 0 0.5em; }
  .admin-lesson-content .ql-editor h2 { font-size: 1.4em; font-weight: bold; margin: 0.75em 0 0.4em; }
  .admin-lesson-content .ql-editor h3 { font-size: 1.2em; font-weight: bold; margin: 0.6em 0 0.3em; }
  .admin-lesson-content .ql-editor p { margin: 0.8em 0; }
  .admin-lesson-content .ql-editor ul { margin: 1em 0; padding-left: 2em; list-style-type: disc; }
  .admin-lesson-content .ql-editor ol { margin: 1em 0; padding-left: 2em; list-style-type: decimal; }
  .admin-lesson-content .ql-editor li { margin: 0.4em 0; }
  .admin-lesson-content .ql-editor blockquote { border-left: 4px solid #3b82f6; margin: 1em 0; padding: 0.5em 1em; background: #f0f9ff; color: #1e40af; }
  .admin-lesson-content .ql-editor code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 0.9em; }
  .admin-lesson-content .ql-editor pre { background: #1f2937; color: #f3f4f6; padding: 1em; border-radius: 4px; overflow-x: auto; margin: 1em 0; }
  .admin-lesson-content .ql-editor pre code { background: none; padding: 0; color: inherit; }
  .admin-lesson-content .ql-editor strong { font-weight: bold; }
  .admin-lesson-content .ql-editor em { font-style: italic; }
  .admin-lesson-content .ql-editor img { max-width: 100%; height: auto; margin: 1em 0; border-radius: 4px; }
  .admin-lesson-content .ql-editor table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  .admin-lesson-content .ql-editor table td, .admin-lesson-content .ql-editor table th { border: 1px solid #d1d5db; padding: 8px 12px; }
  .admin-lesson-content .ql-editor table th { background: #f3f4f6; font-weight: bold; }
  .admin-lesson-content .katex-display { display: flex; justify-content: center; margin: 1.5em 0; overflow-x: auto; }
`;

// Inject styles once
if (typeof document !== 'undefined' && !document.getElementById('admin-lesson-style')) {
  const style = document.createElement('style');
  style.id = 'admin-lesson-style';
  style.textContent = lessonContentStyle;
  document.head.appendChild(style);
}
