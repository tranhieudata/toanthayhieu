import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getUploadUrl } from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiBook, FiList, FiChevronDown, FiChevronUp, FiUpload, FiImage, FiX, FiEdit3, FiCheckCircle, FiClock, FiEye } from 'react-icons/fi';
import { compressImageFile } from '../../utils/imageCompression';


const emptyForm = {
  title: '',
  description: '',
  classId: '',
  lessonId: '',
  questionImage: { url: '' },
  sourceExam: '',
  examPackage: null,
  solutionImages: [],
  answerKey: '',
  maxScore: 10,
  dueDate: '',
};

function examPackageToHomeworkText(paper) {
  if (!paper) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => {
    const options = ['A', 'B', 'C', 'D'].map(key => `${key}. ${q.options?.[key] || ''}`).join('\n');
    return `Câu ${q.number || index + 1}. ${q.question || ''}\n${options}`;
  });
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}. ${q.question || ''}`);
  return [
    paper.title || '',
    mc.length ? `I. Phần trắc nghiệm\n${mc.join('\n\n')}` : '',
    essay.length ? `II. Phần tự luận\n${essay.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function examPackageToAnswerKey(paper) {
  if (!paper) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => `Câu ${q.number || index + 1}: ${q.answer || ''}`);
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}: ${q.solution || ''}`);
  return [...mc, ...essay].filter(Boolean).join('\n');
}

function getClipboardImageFiles(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return [];

  const fromItems = Array.from(clipboard.items || [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      return new File([file], file.name || `clipboard-image-${Date.now()}-${index}.${ext}`, {
        type: file.type,
        lastModified: Date.now(),
      });
    })
    .filter(Boolean);

  if (fromItems.length > 0) return fromItems;

  return Array.from(clipboard.files || [])
    .filter(file => file.type.startsWith('image/'));
}

export default function AdminHomework() {
  const navigate = useNavigate();
  const [homeworks, setHomeworks] = useState([]);
  const [classes, setClasses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [examBank, setExamBank] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Submissions view
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [classStudents, setClassStudents] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [expandedSubmissions, setExpandedSubmissions] = useState({});
  const [gradingStudent, setGradingStudent] = useState(null);
  const [gradingForm, setGradingForm] = useState({ score: '', feedback: '', aiModel: 'manual' });
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [adminUploadingStudent, setAdminUploadingStudent] = useState(null);
  const [adminUploadImages, setAdminUploadImages] = useState([]);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradingError, setGradingError] = useState('');
  const [previewImage, setPreviewImage] = useState(null);

  const loadHomeworks = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterClass) params.classId = filterClass;
      const { data } = await api.get('/homeworks', { params });
      setHomeworks(data);
    } catch (err) {
      console.error('Load homeworks error:', err);
      toast.error(err.response?.data?.message || 'Lỗi tải bài tập');
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissions = async (homeworkId) => {
    setSubmissionsLoading(true);
    try {
      const { data: students } = await api.get(`/homeworks/${homeworkId}/class-students`);
      const { data: subs } = await api.get(`/homeworks/${homeworkId}/submissions`);
      setClassStudents(students);
      setSubmissions(subs);
    } catch (err) {
      console.error('Load submissions error:', err);
      toast.error(err.response?.data?.message || 'Lỗi tải bài làm');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  useEffect(() => {
    loadHomeworks();
    api.get('/classes').then(r => setClasses(r.data || [])).catch(() => {});
    api.get('/lessons').then(r => setLessons(r.data || [])).catch(() => {});
    api.get('/exams', { params: { isTemplate: 'true' } }).then(r => setExamBank(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadHomeworks();
  }, [filterClass]);

  const handleImageUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const compressedFile = await compressImageFile(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      const { data } = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setForm(f => ({
        ...f,
        questionImage: { url: data.url, uploadedAt: new Date() }
      }));
      toast.success('Tải ảnh thành công');
    } catch (err) {
      console.error('Image upload error:', err);
      toast.error(err.response?.data?.message || 'Lỗi tải ảnh');
    } finally {
      setUploading(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      handleImageUpload(file);
    }
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditId(null);
    setImageFile(null);
    setModal(true);
  };

  const openEdit = (hw) => {
    setForm({
      title: hw.title,
      description: hw.description,
      classId: hw.class?._id || '',
      lessonId: hw.lesson?._id || '',
      questionImage: hw.questionImage || { url: '' },
      sourceExam: hw.sourceExam?._id || hw.sourceExam || '',
      examPackage: hw.examPackage || null,
      solutionImages: hw.solutionImages || [],
      answerKey: hw.answerKey || '',
      maxScore: hw.maxScore || 10,
      dueDate: hw.dueDate ? hw.dueDate.substring(0, 10) : '',
    });
    setEditId(hw._id);
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.classId || (!form.questionImage?.url && !form.description?.trim() && !form.sourceExam)) {
      return toast.error('Vui lòng nhập đề bài, chọn từ ngân hàng đề hoặc tải ảnh đề');
    }

    setSubmitting(true);
    try {
      if (editId) {
        await api.put(`/homeworks/${editId}`, form);
        toast.success('Cập nhật bài tập thành công');
      } else {
        await api.post('/homeworks', form);
        toast.success('Tạo bài tập thành công');
      }
      setModal(false);
      loadHomeworks();
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa bài tập này và tất cả bài làm của học sinh?')) return;
    try {
      await api.delete(`/homeworks/${id}`);
      toast.success('Xóa thành công');
      loadHomeworks();
    } catch {
      toast.error('Xóa thất bại');
    }
  };

  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    if (!gradingStudent) return;

    setGradingLoading(true);
    setGradingError('');
    const isUsingAI = gradingForm.aiModel !== 'manual';
    const aiLabel = gradingForm.aiModel === 'chatgpt' ? 'ChatGPT' : 'Gemini';
    const statusToast = isUsingAI 
      ? toast.loading(`Đang chấm bằng AI ${aiLabel}...`) 
      : null;

    try {
      // Nếu dùng AI không cần validate score vì AI sẽ tính
      if (!isUsingAI) {
        const score = parseFloat(gradingForm.score);
        const maxScore = Number(selectedHomework?.maxScore) || 10;
        if (isNaN(score) || score < 0 || score > maxScore) {
          return toast.error(`Điểm phải từ 0-${maxScore}`);
        }
      }

      const { data: gradedSubmission } = await api.post(`/homeworks/${selectedHomework._id}/submissions/${gradingStudent._id}/grade`, {
        score: isUsingAI ? undefined : parseFloat(gradingForm.score),
        feedback: isUsingAI ? undefined : gradingForm.feedback,
        aiModel: gradingForm.aiModel,
      });

      if (statusToast) toast.dismiss(statusToast);
      setSubmissions(prev =>
        prev.map(sub => (sub.student?._id === gradingStudent._id ? gradedSubmission : sub))
      );
      toast.success(
        isUsingAI
          ? `Chấm điểm thành công bằng ${aiLabel}: ${gradedSubmission.score}/${gradedSubmission.maxScore || selectedHomework.maxScore}`
          : 'Chấm điểm thành công'
      );
      await loadSubmissions(selectedHomework._id);
      setGradingStudent(null);
      setGradingForm({ score: '', feedback: '', aiModel: 'manual' });
    } catch (err) {
      if (statusToast) toast.dismiss(statusToast);
      console.error('Grade error:', err);
      const message = err.response?.data?.message || 'Lỗi chấm điểm';
      setGradingError(message);
      toast.error(message);
    } finally {
      setGradingLoading(false);
    }
  };

  const uploadHomeworkImage = async (file) => {
    if (!file) return;
    const compressedFile = await compressImageFile(file);
    const formData = new FormData();
    formData.append('file', compressedFile);
    const { data } = await api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return { url: data.url, uploadedAt: new Date() };
  };

  const handleSelectExamFromBank = (examId) => {
    const selectedExam = examBank.find(exam => exam._id === examId);
    if (!selectedExam) {
      setForm(f => ({ ...f, sourceExam: '', examPackage: null }));
      return;
    }
    const description = selectedExam.examPackage
      ? examPackageToHomeworkText(selectedExam.examPackage)
      : selectedExam.content || selectedExam.title;
    const answerKey = selectedExam.examPackage
      ? examPackageToAnswerKey(selectedExam.examPackage)
      : '';
    setForm(f => ({
      ...f,
      title: f.title || selectedExam.title,
      description: description || f.description,
      sourceExam: selectedExam._id,
      examPackage: selectedExam.examPackage || null,
      answerKey: f.answerKey || answerKey,
      maxScore: selectedExam.levels?.reduce((sum, level) => sum + (level.totalPoints || 0), 0) || f.maxScore,
    }));
  };

  const handleSolutionImageUpload = async (files) => {
    if (!files || files.length === 0) return;
    try {
      const uploadedImages = [];
      for (const file of files) {
        uploadedImages.push(await uploadHomeworkImage(file));
      }
      setForm(f => ({
        ...f,
        solutionImages: [...(f.solutionImages || []), ...uploadedImages],
      }));
      toast.success('Tải ảnh lời giải thành công');
    } catch (err) {
      console.error('Solution image upload error:', err);
      toast.error(err.response?.data?.message || 'Lỗi tải ảnh lời giải');
    }
  };

  const removeSolutionImage = (index) => {
    setForm(f => ({
      ...f,
      solutionImages: (f.solutionImages || []).filter((_, idx) => idx !== index),
    }));
  };

  const handleAdminImageUpload = async (file) => {
    if (!file) return;
    try {
      const uploadedImage = await uploadHomeworkImage(file);
      setAdminUploadImages(prev => [...prev, uploadedImage]);
      toast.success('Tải ảnh thành công');
    } catch (err) {
      console.error('Image upload error:', err);
      toast.error(err.response?.data?.message || 'Lỗi tải ảnh');
    }
  };

  const saveAdminSubmissionImages = async (studentId, images, successMessage = 'Cập nhật ảnh thành công') => {
    try {
      const { data } = await api.post(`/homeworks/${selectedHomework._id}/submissions/admin-submit`, {
        studentId,
        submissionImages: images
      });
      setSubmissions(prev => {
        const exists = prev.some(sub => sub.student?._id === studentId);
        if (exists) {
          return prev.map(sub => (sub.student?._id === studentId ? data : sub));
        }
        return [...prev, data];
      });
      toast.success(successMessage);
      await loadSubmissions(selectedHomework._id);
    } catch (err) {
      console.error('Update submission images error:', err);
      toast.error(err.response?.data?.message || 'Lỗi cập nhật ảnh');
    }
  };

  const handleAddSubmissionImages = async (files, student, submission) => {
    if (!files || files.length === 0) return;
    try {
      const uploadedImages = [];
      for (const file of files) {
        uploadedImages.push(await uploadHomeworkImage(file));
      }
      await saveAdminSubmissionImages(
        student._id,
        [...(submission?.submissionImages || []), ...uploadedImages],
        'Thêm ảnh thành công'
      );
    } catch (err) {
      console.error('Add submission images error:', err);
      toast.error(err.response?.data?.message || 'Lỗi thêm ảnh');
    }
  };

  const handlePasteSubmissionImages = async (event, student, submission) => {
    const files = getClipboardImageFiles(event);
    if (files.length === 0) return;
    event.preventDefault();
    await handleAddSubmissionImages(files, student, submission);
  };

  const handlePasteAdminUploadImages = (event) => {
    const files = getClipboardImageFiles(event);
    if (files.length === 0) return;
    event.preventDefault();
    files.forEach(file => handleAdminImageUpload(file));
  };

  const handleReplaceSubmissionImage = async (file, student, submission, imageIndex) => {
    if (!file) return;
    try {
      const uploadedImage = await uploadHomeworkImage(file);
      const nextImages = [...(submission?.submissionImages || [])];
      nextImages[imageIndex] = uploadedImage;
      await saveAdminSubmissionImages(student._id, nextImages, 'Đổi ảnh thành công');
    } catch (err) {
      console.error('Replace submission image error:', err);
      toast.error(err.response?.data?.message || 'Lỗi đổi ảnh');
    }
  };

  const handleRemoveSubmissionImage = async (student, submission, imageIndex) => {
    const nextImages = (submission?.submissionImages || []).filter((_, idx) => idx !== imageIndex);
    await saveAdminSubmissionImages(student._id, nextImages, 'Xóa ảnh thành công');
  };

  const handleAdminSubmitHomework = async (studentId) => {
    if (adminUploadImages.length === 0) {
      return toast.error('Vui lòng upload ít nhất một ảnh');
    }

    try {
      await api.post(`/homeworks/${selectedHomework._id}/submissions/admin-submit`, {
        studentId,
        submissionImages: adminUploadImages
      });
      toast.success('Tạo bài làm thành công');
      setAdminUploadingStudent(null);
      setAdminUploadImages([]);
      loadSubmissions(selectedHomework._id);
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err.response?.data?.message || 'Lỗi tạo bài làm');
    }
  };

  const toggleSubmissionExpand = (studentId) => {
    setExpandedSubmissions(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const classMap = classes.reduce((acc, c) => ({ ...acc, [c._id]: c }), {});
  const lessonMap = lessons.reduce((acc, l) => ({ ...acc, [l._id]: l }), {});

  // Filter homeworks by class
  const filteredHomeworks = filterClass
    ? homeworks.filter(hw => hw.class?._id === filterClass)
    : homeworks;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FiBook className="text-blue-600" /> Quản lý bài tập về nhà
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <FiPlus /> Tạo bài tập
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Lọc theo lớp học</label>
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tất cả lớp</option>
          {classes.map(c => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Homework List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải...</div>
        ) : filteredHomeworks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Chưa có bài tập nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tên bài tập</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Lớp học</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Hạn chót</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Điểm tối đa</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredHomeworks.map((hw) => (
                  <tr key={hw._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{hw.title}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{hw.class?.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {hw.dueDate ? new Date(hw.dueDate).toLocaleDateString('vi-VN') : 'Không có'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{hw.maxScore}</td>
                    <td className="px-6 py-4 text-sm space-x-2 flex">
                      <button
                        onClick={() => {
                          setSelectedHomework(hw);
                          loadSubmissions(hw._id);
                        }}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        title="Xem bài làm"
                      >
                        <FiList size={16} /> Bài làm
                      </button>
                      <button
                        onClick={() => openEdit(hw)}
                        className="text-green-600 hover:text-green-800"
                        title="Chỉnh sửa"
                      >
                        <FiEdit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(hw._id)}
                        className="text-red-600 hover:text-red-800"
                        title="Xóa"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {editId ? 'Chỉnh sửa bài tập' : 'Tạo bài tập mới'}
              </h2>
              <button onClick={() => setModal(false)} className="text-gray-500 hover:text-gray-700">
                <FiX size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên bài tập *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lớp học *</label>
                  <select
                    value={form.classId}
                    onChange={(e) => setForm(f => ({ ...f, classId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">-- Chọn lớp --</option>
                    {classes.map(c => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bài học</label>
                  <select
                    value={form.lessonId}
                    onChange={(e) => setForm(f => ({ ...f, lessonId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chọn bài --</option>
                    {lessons.map(l => (
                      <option key={l._id} value={l._id}>{l.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chọn từ ngân hàng đề</label>
                <select
                  value={form.sourceExam || ''}
                  onChange={(e) => handleSelectExamFromBank(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Không chọn --</option>
                  {examBank.map(exam => (
                    <option key={exam._id} value={exam._id}>{exam.title}</option>
                  ))}
                </select>
                {form.sourceExam && (
                  <p className="text-xs text-emerald-600 mt-1">Đã lấy nội dung đề từ ngân hàng đề.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh đề bài</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-500">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    id="image-upload"
                    disabled={uploading}
                  />
                  <label htmlFor="image-upload" className="cursor-pointer block">
                    {uploading ? (
                      <div className="text-gray-500">Đang tải...</div>
                    ) : form.questionImage?.url ? (
                      <div className="space-y-2">
                        <img
                          src={getUploadUrl(form.questionImage.url)}
                          alt="Question preview"
                          className="max-h-40 mx-auto rounded"
                        />
                     
                        <p className="text-sm text-gray-600">Nhấp để đổi ảnh</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <FiImage size={32} className="mx-auto text-gray-400" />
                        <p className="text-sm text-gray-600">Tải lên ảnh đề bài</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đáp án tham khảo</label>
                <textarea
                  value={form.answerKey}
                  onChange={(e) => setForm(f => ({ ...f, answerKey: e.target.value }))}
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Để AI tự động chấm điểm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh lời giải mẫu</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <label className="flex items-center justify-center gap-2 text-sm text-blue-700 cursor-pointer hover:text-blue-800">
                    <FiUpload />
                    Tải ảnh lời giải
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleSolutionImageUpload(Array.from(e.target.files || []));
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {form.solutionImages?.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                      {form.solutionImages.map((img, index) => (
                        <div key={`${img.url}-${index}`} className="relative group">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(getUploadUrl(img.url))}
                            className="w-full"
                          >
                            <img
                              src={getUploadUrl(img.url)}
                              alt={`Lời giải ${index + 1}`}
                              className="w-full h-28 object-cover rounded-lg border border-gray-200"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSolutionImage(index)}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100"
                            title="Xóa ảnh"
                          >
                            <FiX size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Điểm tối đa</label>
                  <input
                    type="number"
                    value={form.maxScore}
                    onChange={(e) => setForm(f => ({ ...f, maxScore: parseInt(e.target.value) || 10 }))}
                    min="1"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hạn chót</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editId ? 'Cập nhật' : 'Tạo bài tập'}
                </button>
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submissions Modal */}
      {selectedHomework && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                Quản lý bài làm: {selectedHomework.title}
              </h2>
              <button
                onClick={() => {
                  setSelectedHomework(null);
                  setClassStudents([]);
                  setSubmissions([]);
                  setGradingStudent(null);
                  setGradingError('');
                  setAdminUploadingStudent(null);
                  setAdminUploadImages([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <FiX size={24} />
              </button>
            </div>

            <div className="p-6">
              {submissionsLoading ? (
                <div className="text-center text-gray-500">Đang tải...</div>
              ) : classStudents.length === 0 ? (
                <div className="text-center text-gray-500">Lớp này không có học sinh</div>
              ) : (
                <div className="space-y-4">
                  {classStudents.map((student) => {
                    const submission = submissions.find(s => s.student._id === student._id);
                    
                    return (
                      <div
                        key={student._id}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => toggleSubmissionExpand(student._id)}
                        >
                          <div className="flex items-center gap-3">
                            {expandedSubmissions[student._id] ? (
                              <FiChevronUp size={20} />
                            ) : (
                              <FiChevronDown size={20} />
                            )}
                            <div>
                              <p className="font-medium text-gray-900">{student.name}</p>
                              <p className="text-xs text-gray-500">{student.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {submission?.status === 'graded' ? (
                              <span className="flex items-center gap-1 text-green-600 font-semibold">
                                <FiCheckCircle /> {submission.score}/{selectedHomework.maxScore}
                              </span>
                            ) : submission?.status === 'pending' ? (
                              <span className="flex items-center gap-1 text-yellow-600">
                                <FiClock /> Chưa chấm
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-gray-500">
                                <FiUpload /> Chưa nộp
                              </span>
                            )}
                          </div>
                        </div>

                        {expandedSubmissions[student._id] && (
                          <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
                            {submission ? (
                              <>
                                {/* Submission images */}
                                {submission.submissionImages && submission.submissionImages.length > 0 && (
                                  <div
                                    tabIndex={0}
                                    onPaste={(event) => handlePasteSubmissionImages(event, student, submission)}
                                    className="rounded-lg outline-none focus:ring-2 focus:ring-green-300"
                                  >
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                      <div>
                                        <p className="font-medium text-gray-700">Bài làm:</p>
                                        <p className="text-xs text-gray-400">Bấm vào vùng này rồi Ctrl+V để dán ảnh</p>
                                      </div>
                                      <label className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 cursor-pointer">
                                        <FiUpload size={14} /> Thêm ảnh
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          onChange={(e) => {
                                            handleAddSubmissionImages(Array.from(e.target.files || []), student, submission);
                                            e.target.value = '';
                                          }}
                                          className="hidden"
                                        />
                                      </label>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                      {submission.submissionImages.map((img, idx) => (
                                        <div key={idx} className="relative group">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewImage(getUploadUrl(img.url))}
                                            className="w-full block"
                                          >
                                            <img
                                              src={getUploadUrl(img.url)}
                                              alt={`Submission ${idx + 1}`}
                                              className="w-full h-32 object-cover rounded border border-gray-200"
                                            />
                                            <span className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                              <FiEye className="text-white" size={20} />
                                            </span>
                                          </button>
                                          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                            <label className="bg-white text-blue-600 rounded-full p-1 shadow cursor-pointer hover:bg-blue-50" title="Đổi ảnh">
                                              <FiEdit2 size={14} />
                                              <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => {
                                                  handleReplaceSubmissionImage(e.target.files?.[0], student, submission, idx);
                                                  e.target.value = '';
                                                }}
                                                className="hidden"
                                              />
                                            </label>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveSubmissionImage(student, submission, idx)}
                                              className="bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600"
                                              title="Xóa ảnh"
                                            >
                                              <FiX size={14} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {(!submission.submissionImages || submission.submissionImages.length === 0) && (
                                  <div
                                    tabIndex={0}
                                    onPaste={(event) => handlePasteSubmissionImages(event, student, submission)}
                                    className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center outline-none focus:ring-2 focus:ring-green-300"
                                  >
                                    <FiImage size={28} className="mx-auto text-gray-400 mb-2" />
                                    <p className="text-sm text-gray-600 mb-3">Bài làm chưa có ảnh</p>
                                    <p className="mb-3 text-xs text-gray-400">Bấm vào khung rồi Ctrl+V để dán ảnh</p>
                                    <label className="inline-flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 cursor-pointer">
                                      <FiUpload /> Thêm ảnh
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={(e) => {
                                          handleAddSubmissionImages(Array.from(e.target.files || []), student, submission);
                                          e.target.value = '';
                                        }}
                                        className="hidden"
                                      />
                                    </label>
                                  </div>
                                )}

                                {/* Feedback */}
                                {submission.feedback && (
                                  <div>
                                    <p className="font-medium text-gray-700 mb-1">Nhận xét:</p>
                                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                                      {submission.feedback}
                                    </p>
                                  </div>
                                )}

                                {/* Grading Form */}
                                {(!gradingStudent || gradingStudent._id !== student._id) && (
                                  <button
                                    onClick={() => {
                                      setGradingStudent(student);
                                      setGradingError('');
                                      setGradingForm({
                                        score: submission.score ?? '',
                                        feedback: submission.feedback || '',
                                        aiModel: 'manual'
                                      });
                                    }}
                                    className="w-full px-3 py-2 bg-blue-50 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-2"
                                  >
                                    <FiEdit3 /> {submission.status === 'graded' ? 'Chấm lại / sửa điểm' : 'Chấm điểm'}
                                  </button>
                                )}

                                {gradingStudent && gradingStudent._id === student._id && (
                                  <form onSubmit={handleGradeSubmit} className="bg-blue-50 p-4 rounded-lg space-y-3">
                                    {/* AI Model Selection */}
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Cách chấm
                                      </label>
                                      <div className="space-y-2">
                                        <label className="flex items-center gap-2 p-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-white">
                                          <input
                                            type="radio"
                                            value="manual"
                                            checked={gradingForm.aiModel === 'manual'}
                                            onChange={(e) =>
                                              setGradingForm(f => ({ ...f, aiModel: e.target.value }))
                                            }
                                            disabled={gradingLoading}
                                          />
                                          <span className="text-sm font-medium">Chấm thủ công</span>
                                        </label>
                                        <label className="flex items-center gap-2 p-2 border border-blue-300 bg-blue-100 rounded-lg cursor-pointer hover:bg-blue-50">
                                          <input
                                            type="radio"
                                            value="gemini"
                                            checked={gradingForm.aiModel === 'gemini'}
                                            onChange={(e) =>
                                              setGradingForm(f => ({ ...f, aiModel: e.target.value }))
                                            }
                                            disabled={gradingLoading}
                                          />
                                          <div className="flex-1">
                                            <span className="text-sm font-medium block">Dùng Gemini AI</span>
                                            <span className="text-xs text-gray-600">AI sẽ tự động chấm và viết nhận xét</span>
                                          </div>
                                        </label>
                                        <label className="flex items-center gap-2 p-2 border border-emerald-300 bg-emerald-50 rounded-lg cursor-pointer hover:bg-emerald-100">
                                          <input
                                            type="radio"
                                            value="chatgpt"
                                            checked={gradingForm.aiModel === 'chatgpt'}
                                            onChange={(e) =>
                                              setGradingForm(f => ({ ...f, aiModel: e.target.value }))
                                            }
                                            disabled={gradingLoading}
                                          />
                                          <div className="flex-1">
                                            <span className="text-sm font-medium block">Dùng ChatGPT AI</span>
                                            <span className="text-xs text-gray-600">Cần cấu hình OPENAI_API_KEY ở backend</span>
                                          </div>
                                        </label>
                                      </div>
                                    </div>

                                    {/* Score Input - Only for manual grading */}
                                    {gradingForm.aiModel === 'manual' && (
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          Điểm (0-{selectedHomework.maxScore}) *
                                        </label>
                                        <input
                                          type="number"
                                          value={gradingForm.score}
                                          onChange={(e) =>
                                            setGradingForm(f => ({ ...f, score: e.target.value }))
                                          }
                                          min="0"
                                          max={selectedHomework.maxScore}
                                          step="0.1"
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                          required={gradingForm.aiModel === 'manual'}
                                          disabled={gradingLoading}
                                        />
                                      </div>
                                    )}

                                    {/* Feedback - Only for manual grading */}
                                    {gradingForm.aiModel === 'manual' && (
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          Nhận xét
                                        </label>
                                        <textarea
                                          value={gradingForm.feedback}
                                          onChange={(e) =>
                                            setGradingForm(f => ({ ...f, feedback: e.target.value }))
                                          }
                                          rows="2"
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                          placeholder="Viết nhận xét cho học sinh (tùy chọn)"
                                          disabled={gradingLoading}
                                        />
                                      </div>
                                    )}

                                    {/* AI Mode Info */}
                                    {gradingForm.aiModel !== 'manual' && (
                                      <div className="bg-white border border-blue-300 rounded-lg p-3 text-sm text-blue-700">
                                        <p className="font-semibold mb-1">
                                          Chế độ {gradingForm.aiModel === 'chatgpt' ? 'ChatGPT' : 'Gemini'} AI
                                        </p>
                                        <ul className="list-disc list-inside space-y-1 text-xs">
                                          <li>AI sẽ tự động tạo đáp án nếu chưa có</li>
                                          <li>AI sẽ chấm điểm dựa vào bài làm của học sinh</li>
                                          <li>AI sẽ viết nhận xét tích cực, động viên</li>
                                          <li>Bạn có thể sửa điểm/nhận xét sau</li>
                                        </ul>
                                      </div>
                                    )}

                                    {gradingError && (
                                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                                        {gradingError}
                                      </div>
                                    )}

                                    <div className="flex gap-2">
                                      <button
                                        type="submit"
                                        disabled={gradingLoading}
                                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                      >
                                        {gradingLoading ? (
                                          <div className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            {gradingForm.aiModel !== 'manual' ? 'Đang chấm...' : 'Đang lưu...'}
                                          </div>
                                        ) : (
                                          'Lưu'
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setGradingStudent(null);
                                          setGradingError('');
                                        }}
                                        className="flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50"
                                        disabled={gradingLoading}
                                      >
                                        Hủy
                                      </button>
                                    </div>
                                  </form>
                                )}

                                {submission.status === 'graded' && (
                                  <div className="bg-green-50 p-3 rounded text-sm text-green-700">
                                    Đã chấm bởi {submission.gradedBy?.name} lúc{' '}
                                    {new Date(submission.gradedAt).toLocaleString('vi-VN')}
                                    <span className="ml-2 text-xs text-green-600">
                                      ({submission.aiModel === 'manual' ? 'thủ công' : submission.aiModel})
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {/* Admin upload for students without submission */}
                                {adminUploadingStudent?._id === student._id ? (
                                  <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                                    <p className="font-medium text-gray-700">Upload bài làm cho {student.name}</p>
                                    
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Ảnh bài làm *
                                      </label>
                                      <div
                                        tabIndex={0}
                                        onPaste={handlePasteAdminUploadImages}
                                        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-500 outline-none focus:ring-2 focus:ring-blue-300"
                                      >
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          onChange={(e) => {
                                            const files = e.target.files;
                                            if (files) {
                                              Array.from(files).forEach(file => {
                                                handleAdminImageUpload(file);
                                              });
                                            }
                                          }}
                                          className="hidden"
                                          id={`admin-upload-${student._id}`}
                                        />
                                        <label htmlFor={`admin-upload-${student._id}`} className="cursor-pointer block">
                                          <FiImage size={32} className="mx-auto text-gray-400 mb-2" />
                                          <p className="text-sm text-gray-600">Tải lên ảnh bài làm</p>
                                          <p className="mt-1 text-xs text-gray-400">Hoặc bấm vào khung rồi Ctrl+V để dán ảnh</p>
                                        </label>
                                      </div>
                                    </div>

                                    {adminUploadImages.length > 0 && (
                                      <div>
                                        <p className="font-medium text-gray-700 mb-2">Ảnh đã chọn ({adminUploadImages.length}):</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                          {adminUploadImages.map((img, idx) => (
                                            <div key={idx} className="relative group">
                                              <button
                                                type="button"
                                                onClick={() => setPreviewImage(getUploadUrl(img.url))}
                                                className="w-full block"
                                              >
                                                <img
                                                  src={getUploadUrl(img.url)}
                                                  alt={`Upload ${idx + 1}`}
                                                  className="w-full h-24 object-cover rounded border border-gray-200"
                                                />
                                                <span className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                  <FiEye className="text-white" size={18} />
                                                </span>
                                              </button>
                                                
                                              <button
                                                type="button"
                                                onClick={() => setAdminUploadImages(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                                              >
                                                <FiX size={14} />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleAdminSubmitHomework(student._id)}
                                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                      >
                                        Lưu bài làm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAdminUploadingStudent(null);
                                          setAdminUploadImages([]);
                                        }}
                                        className="flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                                      >
                                        Hủy
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setAdminUploadingStudent(student);
                                      setAdminUploadImages([]);
                                    }}
                                    className="w-full px-3 py-2 bg-green-50 text-green-600 border border-green-300 rounded-lg hover:bg-green-100 flex items-center justify-center gap-2"
                                  >
                                    <FiUpload /> Upload bài làm
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-2 hover:bg-gray-100 shadow"
              title="Đóng"
            >
              <FiX size={22} />
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
