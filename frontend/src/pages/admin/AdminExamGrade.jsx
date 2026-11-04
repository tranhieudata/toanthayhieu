import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { getUploadUrl } from '../../api/axios';
import toast from 'react-hot-toast';
import {
  FiArrowLeft, FiSave, FiUser, FiCheckCircle, FiClock,
  FiBarChart2, FiBookOpen, FiRefreshCw, FiAlertCircle,
  FiUpload, FiImage, FiTrash2, FiEye, FiX,
} from 'react-icons/fi';
import ExamGradingReport from '../../components/ExamGradingReport';
import RichTextEditor from '../../components/RichTextEditor';
import { compressImageFile } from '../../utils/imageCompression';

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

/* ─── Tab: Tổng quan ─────────────────────────────────────────────────────── */
function OverviewTab({ students, results, maxScore }) {
  const gradedResults = useMemo(
    () => Object.values(results).filter(r => r.status === 'graded'),
    [results]
  );

  const scores10 = useMemo(
    () => gradedResults.map(r => (r.maxScore || maxScore) > 0 ? (r.totalScore / (r.maxScore || maxScore)) * 10 : 0),
    [gradedResults, maxScore]
  );
  const avgScore10 = scores10.length > 0 ? scores10.reduce((a, b) => a + b, 0) / scores10.length : 0;
  const minScore = scores10.length > 0 ? Math.min(...scores10) : 0;
  const maxScoreVal = scores10.length > 0 ? Math.max(...scores10) : 0;

  const buckets = [
    { label: 'Kém (<4)', min: 0, max: 4, color: 'bg-red-400' },
    { label: 'Yếu (4–5)', min: 4, max: 5, color: 'bg-orange-400' },
    { label: 'TB (5–7)', min: 5, max: 7, color: 'bg-yellow-400' },
    { label: 'Khá (7–8)', min: 7, max: 8, color: 'bg-blue-400' },
    { label: 'Giỏi (8–9)', min: 8, max: 9, color: 'bg-green-400' },
    { label: 'Xuất sắc (≥9)', min: 9, max: 10.1, color: 'bg-purple-400' },
  ].map(b => ({ ...b, count: scores10.filter(s => s >= b.min && s < b.max).length }));

  if (gradedResults.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
        <FiBarChart2 className="mx-auto text-4xl mb-3 text-gray-300" />
        <p>Chưa có học sinh nào được chấm điểm</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Tổng học sinh', value: students.length, sub: `${gradedResults.length} đã chấm`, color: 'text-blue-700' },
          { label: 'Điểm TB (/10)', value: avgScore10.toFixed(2), sub: `${((avgScore10 / 10) * 100).toFixed(0)}%`, color: avgScore10 >= 8 ? 'text-green-600' : avgScore10 >= 5 ? 'text-yellow-600' : 'text-red-500' },
          { label: 'Điểm thấp nhất', value: minScore.toFixed(2), sub: '/10', color: minScore >= 5 ? 'text-gray-700' : 'text-red-500' },
          { label: 'Điểm cao nhất', value: maxScoreVal.toFixed(2), sub: '/10', color: maxScoreVal >= 8 ? 'text-green-600' : 'text-gray-700' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Score distribution */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Phân bố điểm số</h3>
        <div className="space-y-2.5">
          {buckets.map(b => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-28 shrink-0">{b.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className={`h-5 rounded-full transition-all ${b.color}`}
                  style={{ width: gradedResults.length > 0 ? `${(b.count / gradedResults.length) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-700 w-8 text-right">{b.count}</span>
            </div>
          ))}
        </div>
      </div>


    </div>
  );
}

/* ─── Tab: Đề ôn tập ────────────────────────────────────────────────────── */
function PracticeTab({ exam, results, onPracticeGenerated }) {
  const [openHints, setOpenHints] = useState({});

  const practiceData = useMemo(() => {
    if (!exam?.sharedPractice) return null;
    try { return JSON.parse(exam.sharedPractice); } catch { return null; }
  }, [exam]);

  const gradedCount = useMemo(
    () => Object.values(results).filter(r => r.status === 'graded').length,
    [results]
  );

  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post(`/exams/${exam._id}/generate-practice`);
      onPracticeGenerated(data.sharedPractice);
      toast.success('Đã tạo đề ôn tập thành công!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo đề ôn tập');
    } finally {
      setGenerating(false);
    }
  };

  const toggleHint = key => setOpenHints(prev => ({ ...prev, [key]: !prev[key] }));

  const fmtDate = iso => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <FiBookOpen className="text-emerald-600" /> Đề ôn tập dùng chung
            </h3>
            {practiceData?.generatedAt ? (
              <p className="text-xs text-gray-500 mt-1">
                Đã tạo lúc: <span className="font-medium">{fmtDate(practiceData.generatedAt)}</span>
                {' · '}{practiceData.stats?.totalGraded} học sinh đã chấm
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">Chưa tạo đề ôn tập</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {gradedCount === 0 && (
              <span className="text-xs text-orange-600 flex items-center gap-1">
                <FiAlertCircle size={13} /> Cần chấm điểm ít nhất 1 học sinh
              </span>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating || gradedCount === 0}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <FiRefreshCw size={14} className={generating ? 'animate-spin' : ''} />
              {generating ? 'Đang tạo (Gemini AI)...' : practiceData ? 'Tạo lại đề ôn tập' : 'Tạo đề ôn tập'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3 bg-gray-50 rounded-lg p-3">
          💡 Hệ thống phân tích điểm số toàn lớp, xác định các mức độ có điểm trung bình chưa đạt tối đa, rồi dùng
          Gemini AI tạo câu hỏi ôn luyện cho mỗi mức độ đó. Mỗi học sinh chỉ thấy phần ôn tập tương ứng với
          mức độ <em>mình</em> chưa đạt điểm tối đa.
        </p>
      </div>

      {practiceData?.exercises?.length > 0 && (
        <div className="space-y-4">
          {practiceData.exercises.map((section, si) => (
            <div key={si} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="bg-emerald-50 border-b border-emerald-100 px-5 py-3 flex items-center justify-between">
                <span className="font-semibold text-emerald-900 text-sm">{section.level}</span>
                {practiceData.stats?.levelStats && (() => {
                  const ls = practiceData.stats.levelStats.find(l => l.name === section.level);
                  return ls ? (
                    <span className="text-xs text-emerald-700">
                      TB: {ls.avg}/{ls.max} ({(ls.pct * 100).toFixed(0)}%)
                    </span>
                  ) : null;
                })()}
              </div>
              <div className="p-5 space-y-3">
                {section.questions?.map((q, qi) => {
                  const key = `${si}-${qi}`;
                  return (
                    <div key={qi} className="border border-gray-100 rounded-lg p-3.5">
                      <p className="text-sm text-gray-800">
                        <span className="text-gray-400 mr-1.5 font-medium">Câu {qi + 1}.</span>{q.q}
                      </p>
                      {q.hint && (
                        <div className="mt-2">
                          <button
                            onClick={() => toggleHint(key)}
                            className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                          >
                            {openHints[key] ? '▲ Ẩn gợi ý' : '▼ Xem gợi ý'}
                          </button>
                          {openHints[key] && (
                            <p className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1.5 italic">
                              💡 {q.hint}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!practiceData && !generating && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <FiBookOpen className="mx-auto text-4xl mb-3 text-gray-300" />
          <p>Nhấn "Tạo đề ôn tập" để sinh bài tập dựa trên kết quả toàn lớp</p>
        </div>
      )}
    </div>
  );
}

export default function AdminExamGrade() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const requestedStudentId = searchParams.get('studentId');

  const [activeTab, setActiveTab] = useState('grade');
  const [exam, setExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [results, setResults] = useState({});
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [manualScore, setManualScore] = useState('');
  const [answerContent, setAnswerContent] = useState('');
  const [answerImages, setAnswerImages] = useState([]);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [teacherNote, setTeacherNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [uploadingImages, setUploadingImages] = useState(false);
  const [aiGrading, setAiGrading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  // Load exam + students + existing results
  useEffect(() => {
    const loadAll = async () => {
      try {
        const { data: examData } = await api.get(`/exams/${id}`);
        const firstScheduledClass = examData.classSchedules?.find(s => s.class)?.class || null;
        const examClass = examData.class || firstScheduledClass;
        setExam({ ...examData, class: examClass || null });
        setAnswerContent(examData.solutionContent || '');
        setAnswerImages(examData.solutionImages || []);

        // Load students from every class assigned to this exam.
        const classIds = [
          ...(examData.classSchedules || []).map(s => s.class?._id || s.class).filter(Boolean),
          examClass?._id || examClass,
        ].filter(Boolean);
        const uniqueClassIds = [...new Set(classIds.map(String))];
        if (uniqueClassIds.length > 0) {
          const classResponses = await Promise.all(
            uniqueClassIds.map(classId => api.get(`/classes/${classId}`).catch(() => null))
          );
          const studentMap = {};
          classResponses.forEach(response => {
            (response?.data?.students || []).forEach(student => {
              studentMap[student._id] = student;
            });
          });
          setStudents(Object.values(studentMap));
        }

        // Load existing results
        const { data: resultList } = await api.get(`/exams/${id}/results`);
        const resultMap = {};
        resultList.forEach(r => { resultMap[r.student._id || r.student] = r; });
        setResults(resultMap);

      } catch {
        toast.error('Không tải được dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [id]);

  const selectStudent = (student) => {
    if (saving || aiGrading || uploadingImages) return;
    setSelectedStudent(student);
    const existing = results[student._id];
    setManualScore(existing?.status === 'graded' ? existing.totalScore : '');
    setTeacherNote(existing?.teacherNote || '');
  };

  useEffect(() => {
    if (loading || !requestedStudentId) return;
    const student = students.find(item => item._id === requestedStudentId);
    if (!student) return;
    setSelectedStudent(student);
    const result = results[student._id];
    setManualScore(result?.status === 'graded' ? result.totalScore : '');
    setTeacherNote(result?.teacherNote || '');
  }, [loading, students, requestedStudentId]);

  const maxScore = Number(exam?.examPackage?.totals?.totalPoints)
    || [...(exam?.examPackage?.questions?.multipleChoice || []), ...(exam?.examPackage?.questions?.essay || [])].reduce((sum, q) => sum + (Number(q.points) || 0), 0)
    || (exam?.levels || []).reduce((sum, level) => sum + (Number(level.totalPoints) || 0), 0) || 10;
  const totalScore = Number(manualScore) || 0;

  const handleSave = async () => {
    if (!selectedStudent) return;
    if (manualScore === '' || !Number.isFinite(Number(manualScore)) || Number(manualScore) < 0 || Number(manualScore) > maxScore) return toast.error(`Nhập điểm từ 0 đến ${maxScore}`);
    setSaving(true);
    try {
      const { data: result } = await api.post(`/exams/${id}/results`, {
        studentId: selectedStudent._id,
        totalScore: manualScore,
        teacherNote,
      });
      setResults(prev => ({ ...prev, [selectedStudent._id]: result }));
      toast.success(`Đã lưu kết quả cho ${selectedStudent.name}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu kết quả');
    } finally {
      setSaving(false);
    }
  };

  const uploadExamImage = async (file) => {
    const compressedFile = await compressImageFile(file);
    const formData = new FormData();
    formData.append('file', compressedFile);
    const { data } = await api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return { url: data.url, uploadedAt: new Date() };
  };

  const saveSubmissionImages = async (studentId, images, successMessage) => {
    const { data } = await api.post(`/exams/${id}/results/${studentId}/images`, {
      submissionImages: images,
    });
    setResults(prev => ({ ...prev, [studentId]: data }));
    setManualScore('');
    setTeacherNote('');
    toast.success(successMessage);
  };

  const handleAddImages = async (files) => {
    if (!selectedStudent || !files?.length) return;
    setUploadingImages(true);
    try {
      const uploadedImages = [];
      for (const file of files) {
        uploadedImages.push(await uploadExamImage(file));
      }
      const existingImages = results[selectedStudent._id]?.submissionImages || [];
      await saveSubmissionImages(
        selectedStudent._id,
        [...existingImages, ...uploadedImages],
        'Đã tải ảnh bài làm'
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi tải ảnh bài làm');
    } finally {
      setUploadingImages(false);
    }
  };

  const handlePasteImages = async (event) => {
    const files = getClipboardImageFiles(event);
    if (files.length === 0) return;
    event.preventDefault();
    await handleAddImages(files);
  };

  const handleRemoveImage = async (imageIndex) => {
    if (!selectedStudent) return;
    const existingImages = results[selectedStudent._id]?.submissionImages || [];
    await saveSubmissionImages(
      selectedStudent._id,
      existingImages.filter((_, idx) => idx !== imageIndex),
      'Đã xóa ảnh'
    );
  };

  const handleAIGrade = async () => {
    if (!selectedStudent) return;
    const images = results[selectedStudent._id]?.submissionImages || [];
    if (images.length === 0) return toast.error('Cần upload ảnh bài làm trước khi chấm bằng AI');
    setAiGrading(true);
    const loadingToast = toast.loading('AI đang chấm bài từ ảnh...');
    try {
      await api.put(`/exams/${id}`, { solutionContent: answerContent, solutionImages: answerImages });
      const { data } = await api.post(`/exams/${id}/results/${selectedStudent._id}/ai-grade`);
      setResults(prev => ({ ...prev, [selectedStudent._id]: data }));
      setManualScore(data.totalScore);
      setTeacherNote(data.teacherNote || data.autoFeedback || '');
      toast.dismiss(loadingToast);
      toast.success('AI đã chấm xong');
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error(err.response?.data?.message || 'AI chưa chấm được bài này');
    } finally {
      setAiGrading(false);
    }
  };

  const saveAnswers = async () => {
    setSavingAnswers(true);
    try {
      await api.put(`/exams/${id}`, { solutionContent: answerContent, solutionImages: answerImages });
      toast.success('Đã lưu đáp án và hướng dẫn chấm');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không lưu được đáp án');
    } finally { setSavingAnswers(false); }
  };

  const addAnswerImages = async (files) => {
    setSavingAnswers(true);
    try {
      const images = [];
      for (const file of files) images.push(await uploadExamImage(file));
      const nextImages = [...answerImages, ...images];
      await api.put(`/exams/${id}`, { solutionContent: answerContent, solutionImages: nextImages });
      setAnswerImages(nextImages);
      toast.success('Đã lưu ảnh đáp án');
    } catch (err) { toast.error(err.response?.data?.message || 'Không tải được ảnh đáp án'); }
    finally { setSavingAnswers(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  if (!exam) return null;

  const TABS = [
    { key: 'grade', label: 'Chấm điểm', icon: FiUser },
    { key: 'overview', label: 'Tổng quan', icon: FiBarChart2 },
    { key: 'practice', label: 'Đề ôn tập', icon: FiBookOpen },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/exam-grading')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm">
          <FiArrowLeft size={16} /> Danh sách chấm đề
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{exam.title}</h1>
          <p className="text-sm text-gray-500">
            {exam.level && exam.level.name && `Cấp: ${exam.level.name} · `}
            {exam.lesson?.title && `Bài: ${exam.lesson.title} · `}
            {exam.class?.name && `Lớp: ${exam.class.name} · `}
            {exam.totalQuestions} câu · {maxScore} điểm
          </p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1.5 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'grade' && <details className="rounded-xl border border-blue-100 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-blue-900">Đáp án và hướng dẫn chấm của thầy</summary>
        <p className="my-3 text-sm text-gray-500">AI ưu tiên nội dung và ảnh đáp án bên dưới, giữ cách chia câu/ý và thang điểm của thầy. Khi chưa có, AI dùng đáp án đã lưu trong đề; nếu vẫn chưa có thì tự lập đáp án trước khi chấm.</p>
        <RichTextEditor value={answerContent} onChange={setAnswerContent} />
        <div className="my-3 flex flex-wrap gap-2">{answerImages.map((image, index) => <div key={image.url} className="relative">
          <img src={getUploadUrl(image.url)} alt={`Đáp án ${index + 1}`} className="h-28 w-28 rounded border object-cover" />
          <button type="button" disabled={savingAnswers || aiGrading} onClick={() => setAnswerImages(prev => prev.filter((_, i) => i !== index))} className="absolute right-0 top-0 rounded bg-red-600 p-1 text-white" title="Bỏ ảnh đáp án"><FiX /></button>
        </div>)}</div>
        <div className="flex gap-3">
          <label className="cursor-pointer rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">Thêm ảnh đáp án<input type="file" accept="image/*" multiple hidden disabled={savingAnswers || aiGrading} onChange={e => { addAnswerImages(Array.from(e.target.files || [])); e.target.value = ''; }} /></label>
          <button type="button" onClick={saveAnswers} disabled={savingAnswers || aiGrading} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">{savingAnswers ? 'Đang lưu...' : 'Lưu đáp án'}</button>
        </div>
      </details>}

      {/* ── Tab: Chấm điểm ── */}
      {activeTab === 'grade' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student list */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FiUser /> Danh sách học sinh
            {students.length > 0 && <span className="text-xs text-gray-400">({students.length})</span>}
          </h2>

          {students.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {exam.class ? 'Lớp chưa có học sinh' : 'Đề này chưa gắn lớp'}
            </p>
          ) : (
            <div className="space-y-1">
              {students.map(s => {
                const res = results[s._id];
                const isSelected = selectedStudent?._id === s._id;
                return (
                  <button
                    key={s._id}
                    disabled={saving || aiGrading || uploadingImages}
                    onClick={() => selectStudent(s)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                      isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {s.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm truncate">{s.name}</span>
                    </div>
                    {res ? (
                      <span className={`shrink-0 text-xs font-bold ${isSelected ? 'text-white' : 'text-green-600'}`}>
                        {res.totalScore}/{maxScore}
                      </span>
                    ) : (
                      <FiClock size={12} className={`shrink-0 ${isSelected ? 'text-white/70' : 'text-gray-400'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Grading panel */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedStudent ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
              <FiUser className="mx-auto text-4xl mb-3 text-gray-300" />
              <p>Chọn học sinh để chấm điểm</p>
            </div>
          ) : (
            <>
              {/* Student info */}
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedStudent.name}</div>
                    <div className="text-sm text-gray-500">{selectedStudent.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-700">{totalScore.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">/ {maxScore} điểm</div>
                    {maxScore > 0 && (
                      <div className={`text-xs font-medium mt-0.5 ${(totalScore/maxScore) >= 0.8 ? 'text-green-600' : (totalScore/maxScore) >= 0.5 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {((totalScore / maxScore) * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                </div>
                <div
                  tabIndex={0}
                  onPaste={handlePasteImages}
                  className="mt-3 pt-3 border-t border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-xs text-gray-500 font-medium">
                      Bài làm học sinh ({results[selectedStudent._id]?.submissionImages?.length || 0} ảnh)
                    </p>
                    <p className="text-xs text-gray-400">Bấm vào vùng này rồi Ctrl+V để dán ảnh</p>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer text-xs font-medium">
                        <FiUpload size={13} />
                        {uploadingImages ? 'Đang tải...' : 'Thêm ảnh'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={uploadingImages || aiGrading || saving}
                          className="hidden"
                          onChange={(e) => {
                            handleAddImages(Array.from(e.target.files || []));
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        onClick={handleAIGrade}
                        disabled={aiGrading || saving || savingAnswers || uploadingImages || !(results[selectedStudent._id]?.submissionImages?.length)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 text-xs font-medium"
                      >
                        <FiRefreshCw size={13} className={aiGrading ? 'animate-spin' : ''} />
                        Chấm bằng AI
                      </button>
                    </div>
                  </div>

                  {results[selectedStudent._id]?.submissionImages?.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {results[selectedStudent._id].submissionImages.map((img, i) => (
                        <div key={i} className="relative group">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(getUploadUrl(img.url))}
                            className="w-full relative"
                          >
                            <img
                              src={getUploadUrl(img.url)}
                              alt={`Bài làm ${i + 1}`}
                              className="w-full h-28 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                            />
                            <span className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                              <FiEye className="text-white" size={20} />
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(i)}
                            disabled={uploadingImages || aiGrading || saving}
                            className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition"
                            title="Xóa ảnh"
                          >
                            <FiTrash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">
                      <FiImage className="mx-auto mb-1" size={20} />
                      Chưa có ảnh bài làm
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-white p-4 shadow-sm">
                <h2 className="mb-3 font-semibold text-gray-900">Chấm thủ công</h2>
                <label className="flex items-center gap-3 text-sm text-gray-700">Tổng điểm
                  <input type="number" min="0" max={maxScore} step="0.01" value={manualScore} disabled={saving || aiGrading} onChange={e => setManualScore(e.target.value)} className="w-28 rounded-lg border border-gray-300 px-3 py-2" />
                  / {maxScore} điểm
                </label>
                {results[selectedStudent._id]?.gradingReport && <p className="mt-2 text-xs text-gray-500">Lưu điểm thủ công sẽ thay phiếu AI bằng tổng điểm và nhận xét của thầy.</p>}
              </div>

              {/* Teacher note */}
              <div className="bg-white rounded-xl shadow-sm p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nhận xét của giáo viên
                </label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Nhập nhận xét của thầy..."
                  value={teacherNote}
                  onChange={e => setTeacherNote(e.target.value)}
                />
              </div>

              {/* Save */}
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving || aiGrading || uploadingImages || manualScore === ''}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-60 text-sm"
                  >
                    <FiSave size={15} />
                    {saving ? 'Đang lưu...' : 'Lưu điểm thủ công'}
                  </button>
                </div>
              </div>

              <ExamGradingReport result={results[selectedStudent._id]} exam={exam} studentName={selectedStudent.name} showGeneratedAnswer />

            </>
          )}
        </div>
      </div>
      )}

      {/* ── Tab: Tổng quan ── */}
      {activeTab === 'overview' && (
        <OverviewTab
          exam={exam}
          students={students}
          results={results}
          maxScore={maxScore}
        />
      )}

      {/* ── Tab: Đề ôn tập ── */}
      {activeTab === 'practice' && (
        <PracticeTab
          exam={exam}
          results={results}
          onPracticeGenerated={(practice) =>
            setExam(prev => ({ ...prev, sharedPractice: JSON.stringify(practice) }))
          }
        />
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/90 text-gray-700 hover:bg-white"
            title="Đóng"
          >
            <FiX size={20} />
          </button>
          <img
            src={previewImage}
            alt="Bài làm"
            className="max-h-[90vh] max-w-[95vw] rounded-lg bg-white object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
