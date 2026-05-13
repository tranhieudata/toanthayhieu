import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiSave, FiClock } from 'react-icons/fi';
import RichTextEditor from '../../components/RichTextEditor';
import PdfUploader from '../../components/PdfUploader';

const AUTO_SAVE_INTERVAL = 30_000; // 30 giây

const emptyLesson = {
  title: '',
  content: '',
  videoUrl: '',
  course: '',
  order: 0,
  duration: '',
  isPublished: false,
  pdfAttachments: [],
};

export default function AdminLessonEditor() {
  const navigate = useNavigate();
  const { id } = useParams(); // lesson id nếu edit
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('course'); // courseId nếu create

  const [form, setForm] = useState(emptyLesson);
  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!id);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [draftId, setDraftId] = useState(null); // ID bài học nháp tạo ra khi auto-save bài mới

  const formRef = useRef(form);
  const draftIdRef = useRef(null);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  const isEdit = !!id;

  useEffect(() => {
    if (isEdit) {
      api.get(`/lessons/${id}`)
        .then(res => {
          const lesson = res.data;
          setForm({
            title: lesson.title || '',
            content: lesson.content || '',
            videoUrl: lesson.videoUrl || '',
            course: lesson.course?._id || lesson.course || '',
            order: lesson.order ?? 0,
            duration: lesson.duration || '',
            isPublished: lesson.isPublished || false,
            pdfAttachments: lesson.pdfAttachments || [],
          });
          if (lesson.course?.title) setCourseName(lesson.course.title);
          else if (lesson.course) {
            api.get(`/courses/${lesson.course}`).then(r => setCourseName(r.data.title)).catch(() => {});
          }
        })
        .catch(() => toast.error('Không tải được bài học'))
        .finally(() => setFetching(false));
    } else if (courseId) {
      api.get(`/courses/${courseId}`).then(r => setCourseName(r.data.title)).catch(() => {});
    }
  }, [id, courseId, isEdit]);

  // Auto-save mỗi 30 giây
  useEffect(() => {
    const timer = setInterval(async () => {
      const f = formRef.current;
      if (!f.title.trim()) return; // Không lưu nháp nếu chưa có tiêu đề

      const courseIdToUse = isEdit ? f.course : courseId;
      if (!courseIdToUse) return;

      setAutoSaving(true);
      try {
        if (isEdit) {
          // Bài học đang chỉnh sửa → PUT im lặng
          await api.put(`/lessons/${id}`, f);
        } else if (draftIdRef.current) {
          // Đã tạo nháp trước đó → PUT cập nhật nháp
          await api.put(`/lessons/${draftIdRef.current}`, { ...f, course: courseIdToUse });
        } else {
          // Bài học mới → POST tạo nháp lần đầu
          const res = await api.post('/lessons', { ...f, course: courseIdToUse, isPublished: false });
          setDraftId(res.data._id);
        }
        setLastSaved(new Date());
      } catch {
        // Auto-save thất bại, im lặng — không toast để không làm phiền người dùng
      } finally {
        setAutoSaving(false);
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(timer);
  }, [id, courseId, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const courseIdToUse = isEdit ? form.course : courseId;
      if (!courseIdToUse) {
        toast.error('Vui lòng chọn khóa học');
        setLoading(false);
        return;
      }

      const submitData = isEdit ? form : { ...form, course: courseIdToUse };

      if (isEdit) {
        await api.put(`/lessons/${id}`, submitData);
        toast.success('Cập nhật bài học thành công');
      } else if (draftId) {
        // Bài mới đã được auto-save → PUT nháp với trạng thái cuối cùng
        await api.put(`/lessons/${draftId}`, submitData);
        toast.success('Tạo bài học thành công');
      } else {
        await api.post('/lessons', submitData);
        toast.success('Tạo bài học thành công');
      }
      navigate(`/admin/content?course=${courseIdToUse}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi lưu bài học');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(`/admin/content?course=${isEdit ? form.course : courseId}`)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm transition-colors"
        >
          <FiArrowLeft size={16} /> Quay lại
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Chỉnh sửa bài học' : 'Thêm bài học mới'}
          </h1>
          {courseName && <p className="text-sm text-gray-500 mt-0.5">Khóa học: {courseName}</p>}
        </div>
        {/* Auto-save indicator */}
        <div className="text-xs text-gray-400 flex items-center gap-1 min-w-max">
          {autoSaving ? (
            <><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> Đang lưu nháp...</>
          ) : lastSaved ? (
            <><FiClock size={12} /> Đã lưu nháp {lastSaved.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</>
          ) : !isEdit ? (
            <span className="text-gray-300">Tự động lưu nháp sau 30s</span>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6 space-y-5">
          {/* Tiêu đề */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề *</label>
            <input
              className="input-field text-base"
              placeholder="Nhập tiêu đề bài học..."
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          {/* Video URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Video URL (YouTube / Vimeo)</label>
            <input
              className="input-field"
              placeholder="https://youtube.com/watch?v=... hoặc https://youtu.be/..."
              value={form.videoUrl}
              onChange={e => setForm({ ...form, videoUrl: e.target.value })}
            />
          </div>

          {/* Thứ tự & Thời lượng & Trạng thái */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thứ tự</label>
              <input
                type="number"
                className="input-field"
                value={form.order}
                onChange={e => setForm({ ...form, order: Number(e.target.value) })}
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thời lượng (phút)</label>
              <input
                className="input-field"
                placeholder="Ví dụ: 45"
                value={form.duration}
                onChange={e => setForm({ ...form, duration: e.target.value })}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={e => setForm({ ...form, isPublished: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">Công khai</span>
              </label>
            </div>
          </div>
        </div>

        {/* Nội dung - Rich Text Editor */}
        <div className="card p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Nội dung bài học</label>
          <RichTextEditor
            value={form.content}
            onChange={(html) => setForm(f => ({ ...f, content: html }))}
            placeholder="Nhập nội dung bài học. Dùng nút ƒx để chèn công thức toán..."
          />
        </div>

        {/* PDF Attachments */}
        <div className="card p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Tệp PDF đính kèm</label>
          <PdfUploader
            attachments={form.pdfAttachments || []}
            onAttachmentsChange={(atts) => setForm(f => ({ ...f, pdfAttachments: atts }))}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <button
            type="button"
            onClick={() => navigate('/admin/content')}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <FiSave size={16} />
            {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo bài học'}
          </button>
        </div>
      </form>
    </div>
  );
}
