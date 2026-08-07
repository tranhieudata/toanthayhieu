import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import VN_MATH_CURRICULUM from '../../utils/vnMathCurriculum';
import {
  FiBookOpen,
  FiClock,
  FiEdit2,
  FiPlus,
  FiToggleLeft,
  FiToggleRight,
  FiTrash2,
  FiVideo,
  FiZap,
} from 'react-icons/fi';

export default function AdminLessons() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [curriculum, setCurriculum] = useState(VN_MATH_CURRICULUM);
  const [autoCreateForm, setAutoCreateForm] = useState({ course: '', grade: '', topic: '' });
  const [autoCreating, setAutoCreating] = useState(false);

  const courseTitle = (lesson) => {
    const courseId = lesson?.course?._id || lesson?.course;
    return lesson?.course?.title || courses.find((course) => course._id === courseId)?.title || 'Chưa chọn khóa học';
  };

  const sortedLessons = useMemo(() => {
    return [...lessons].sort((a, b) => {
      const byCourse = courseTitle(a).localeCompare(courseTitle(b), 'vi');
      if (byCourse !== 0) return byCourse;

      const orderA = Number(a.order) || 0;
      const orderB = Number(b.order) || 0;
      if (orderA !== orderB) return orderA - orderB;

      return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
    });
  }, [lessons, courses]);

  const selectedLesson = useMemo(() => {
    return sortedLessons.find((lesson) => lesson._id === selectedLessonId) || sortedLessons[0] || null;
  }, [sortedLessons, selectedLessonId]);
  const curriculumGrades = Object.keys(curriculum || {}).sort((a, b) => Number(a) - Number(b));
  const selectedTopics = Object.values(autoCreateForm.grade ? curriculum?.[autoCreateForm.grade] || {} : {})
    .flatMap((topics) => Array.isArray(topics) ? topics : [])
    .map((topic) => String(topic || '').trim())
    .filter(Boolean);

  const loadLessons = () => api.get('/lessons').then((res) => {
    const items = res.data || [];
    setLessons(items);
    setSelectedLessonId((prev) => prev || items[0]?._id || '');
  });

  useEffect(() => {
    loadLessons();
    api.get('/courses/admin/all').then((res) => {
      const items = res.data || [];
      setCourses(items);
      setAutoCreateForm((prev) => ({ ...prev, course: prev.course || items[0]?._id || '' }));
    }).catch(() => setCourses([]));
    api.get('/settings')
      .then(({ data }) => {
        if (data?.curriculum && Object.keys(data.curriculum).length > 0) setCurriculum(data.curriculum);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!autoCreateForm.course || autoCreateForm.grade) return;
    const selectedCourse = courses.find((course) => course._id === autoCreateForm.course);
    const courseText = `${selectedCourse?.level?.name || ''} ${selectedCourse?.title || ''}`;
    const match = courseText.match(/(?:lớp|lop|khối|khoi)\s*(6|7|8|9|10|11|12)\b/i) || courseText.match(/\b(6|7|8|9|10|11|12)\b/);
    if (match?.[1] && curriculum?.[match[1]]) {
      setAutoCreateForm((prev) => ({ ...prev, grade: match[1], topic: '' }));
    }
  }, [autoCreateForm.course, autoCreateForm.grade, courses, curriculum]);

  const openCreate = () => {
    navigate('/admin/lessons/new');
  };

  const openEdit = (lesson) => {
    navigate(`/admin/lessons/${lesson._id}/edit`);
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa bài học này?')) return;

    try {
      await api.delete(`/lessons/${id}`);
      toast.success('Xóa thành công');
      setSelectedLessonId((prev) => (prev === id ? '' : prev));
      loadLessons();
    } catch {
      toast.error('Xóa thất bại');
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await api.patch(`/lessons/${id}/toggle`);
      setLessons((prev) => prev.map((lesson) => (lesson._id === id ? res.data : lesson)));
      toast.success(res.data.isPublished ? 'Đã bật hiển thị' : 'Đã tắt hiển thị');
    } catch {
      toast.error('Không thể thay đổi trạng thái');
    }
  };

  const handleAutoCreateLessons = async () => {
    const courseId = autoCreateForm.course;
    if (!courseId) return toast.error('Chọn khóa học trước');
    if (!autoCreateForm.grade || !autoCreateForm.topic) return toast.error('Chọn lớp và chủ đề trước');

    const lessonsInCourse = lessons.filter((lesson) => String(lesson.course?._id || lesson.course) === String(courseId));
    const existingTitles = new Set(lessonsInCourse.map((lesson) => String(lesson.title || '').trim().toLowerCase()).filter(Boolean));
    const title = autoCreateForm.topic.trim();

    if (existingTitles.has(title.toLowerCase())) {
      toast.success('Chủ đề này đã có bài học');
      return;
    }

    const orderBase = lessonsInCourse.reduce((maxOrder, lesson) => Math.max(maxOrder, Number(lesson.order) || 0), 0);
    setAutoCreating(true);
    try {
      const { data: created } = await api.post('/lessons', {
        title,
        course: courseId,
        order: orderBase + 1,
        duration: '',
        content: '',
        videoUrl: '',
        isPublished: false,
      });

      await loadLessons();
      if (created?._id) setSelectedLessonId(created._id);
      setAutoCreateForm((prev) => ({ ...prev, topic: '' }));
      toast.success('Đã tạo bài học từ danh mục chủ đề');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không tạo được bài học tự động');
    } finally {
      setAutoCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý bài học</h1>
          <p className="mt-1 text-sm text-gray-500">Chọn bài học ở cột bên trái để xem nhanh nội dung.</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center justify-center gap-2">
          <FiPlus /> Thêm bài học
        </button>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_140px_minmax(180px,1fr)_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Khóa học</span>
            <select
              className="input-field"
              value={autoCreateForm.course}
              onChange={(e) => setAutoCreateForm((prev) => ({ ...prev, course: e.target.value, grade: '', topic: '' }))}
            >
              <option value="">Chọn khóa học</option>
              {courses.map((course) => (
                <option key={course._id} value={course._id}>{course.title}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Lớp</span>
            <select
              className="input-field"
              value={autoCreateForm.grade}
              onChange={(e) => setAutoCreateForm((prev) => ({ ...prev, grade: e.target.value, topic: '' }))}
            >
              <option value="">Chọn lớp</option>
              {curriculumGrades.map((grade) => (
                <option key={grade} value={grade}>Lớp {grade}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Chủ đề</span>
            <select
              className="input-field"
              value={autoCreateForm.topic}
              onChange={(e) => setAutoCreateForm((prev) => ({ ...prev, topic: e.target.value }))}
              disabled={!autoCreateForm.grade}
            >
              <option value="">Chọn chủ đề</option>
              {selectedTopics.map((topic, index) => (
                <option key={`${topic}-${index}`} value={topic}>{topic}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleAutoCreateLessons}
            disabled={autoCreating || !autoCreateForm.course || !autoCreateForm.grade || !autoCreateForm.topic}
            className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <FiZap size={16} /> {autoCreating ? 'Đang tạo...' : 'Tạo từ chủ đề'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="card overflow-hidden">
          <div className="border-b border-gray-100 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <FiBookOpen className="text-blue-600" /> Danh sách bài học
            </h2>
            <p className="mt-1 text-xs text-gray-500">{sortedLessons.length} bài đã tạo</p>
          </div>

          <div className="max-h-[calc(100vh-230px)] overflow-y-auto p-3">
            {sortedLessons.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                Chưa có bài học nào
              </div>
            ) : (
              <div className="space-y-2">
                {sortedLessons.map((lesson) => {
                  const isSelected = selectedLesson?._id === lesson._id;

                  return (
                    <button
                      key={lesson._id}
                      type="button"
                      onClick={() => setSelectedLessonId(lesson._id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        isSelected
                          ? 'border-blue-200 bg-blue-50 shadow-sm'
                          : 'border-gray-100 bg-white hover:border-blue-100 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {lesson.order ? `${lesson.order}. ` : ''}{lesson.title || 'Chưa có tiêu đề'}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-500">{courseTitle(lesson)}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          lesson.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {lesson.isPublished ? 'Đã đăng' : 'Nháp'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="card min-h-[520px] p-6">
          {selectedLesson ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-gray-500">{courseTitle(selectedLesson)}</p>
                  <h2 className="mt-1 text-2xl font-bold text-gray-900">
                    {selectedLesson.title || 'Chưa có tiêu đề'}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                    <span className="rounded-full bg-gray-100 px-3 py-1">Thứ tự {selectedLesson.order ?? 0}</span>
                    <span className="rounded-full bg-gray-100 px-3 py-1">
                      {selectedLesson.duration || 'Chưa nhập thời lượng'} phút
                    </span>
                    <span className={`rounded-full px-3 py-1 ${
                      selectedLesson.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {selectedLesson.isPublished ? 'Đã công khai' : 'Bản nháp'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggle(selectedLesson._id)}
                    className="btn-secondary flex items-center gap-2"
                    title={selectedLesson.isPublished ? 'Tắt hiển thị' : 'Bật hiển thị'}
                  >
                    {selectedLesson.isPublished ? <FiToggleRight /> : <FiToggleLeft />}
                    {selectedLesson.isPublished ? 'Tắt' : 'Bật'}
                  </button>
                  <button type="button" onClick={() => openEdit(selectedLesson)} className="btn-primary flex items-center gap-2">
                    <FiEdit2 /> Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedLesson._id)}
                    className="btn-secondary flex items-center gap-2 text-red-600 hover:text-red-700"
                  >
                    <FiTrash2 /> Xóa
                  </button>
                </div>
              </div>

              <div className="grid gap-5 py-5 md:grid-cols-2">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase text-gray-400">Khóa học</p>
                  <p className="mt-1 font-semibold text-gray-900">{courseTitle(selectedLesson)}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase text-gray-400">
                    <FiClock /> Thời lượng
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">{selectedLesson.duration || '—'} phút</p>
                </div>
              </div>

              {selectedLesson.videoUrl && (
                <a
                  href={selectedLesson.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-5 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  <FiVideo /> Mở video bài học
                </a>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-100 p-4">
                {selectedLesson.content ? (
                  <div className="ql-editor max-w-none" dangerouslySetInnerHTML={{ __html: selectedLesson.content }} />
                ) : (
                  <p className="text-sm text-gray-400">Bài học này chưa có nội dung.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center text-center text-gray-400">
              <div>
                <FiBookOpen size={42} className="mx-auto mb-3 text-gray-300" />
                <p>Chọn một bài học ở cột bên trái để xem chi tiết.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
