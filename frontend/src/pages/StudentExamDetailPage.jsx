import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiCheckCircle, FiClock, FiAward, FiCamera, FiX, FiUpload, FiImage, FiLock, FiBookOpen, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import 'katex/dist/katex.min.css';
import 'quill/dist/quill.snow.css';
import katex from 'katex';
import { getUploadUrl } from '../api/axios';

// Xử lý LaTeX đồng bộ trước khi render (tránh race condition với setTimeout)
function processLatexContent(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;
    const ownerDoc = body.ownerDocument;

    // Bước 1: Re-render ql-formula từ data-value
    body.querySelectorAll('.ql-formula').forEach(span => {
      const formula = span.getAttribute('data-value');
      if (!formula) return;
      try { span.innerHTML = katex.renderToString(formula.trim(), { throwOnError: false }); } catch {}
    });

    // Bước 2: Walk text nodes tìm $...$ / $$...$$
    const walker = ownerDoc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el && el !== body) {
          if (el.classList.contains('ql-formula') || el.classList.contains('katex') || el.classList.contains('katex-display'))
            return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (/\$/.test(node.textContent)) textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      if (!/\$/.test(text)) return;
      const rendered = text
        .replace(/\$\$([^$]+?)\$\$/g, (m, f) => {
          try { return katex.renderToString(f.trim(), { displayMode: true, throwOnError: false }); } catch { return m; }
        })
        .replace(/\$([^$\n]+?)\$/g, (m, f) => {
          if (!f.trim()) return m;
          try { return katex.renderToString(f.trim(), { throwOnError: false }); } catch { return m; }
        });
      if (rendered !== text) {
        const span = ownerDoc.createElement('span');
        span.innerHTML = rendered;
        textNode.parentNode.replaceChild(span, textNode);
      }
    });

    return body.innerHTML;
  } catch {
    return html;
  }
}

const compressAndWatermark = (file, studentName, maxWidth = 1000, quality = 0.78) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxWidth) {
          if (width >= height) { height = Math.round(height * maxWidth / width); width = maxWidth; }
          else { width = Math.round(width * maxWidth / height); height = maxWidth; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Watermark
        const now = new Date();
        const timeStr = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const label = `${studentName}  •  ${timeStr}`;
        const fontSize = Math.max(16, Math.round(width / 40));
        ctx.font = `bold ${fontSize}px Arial`;
        const textW = ctx.measureText(label).width;
        const padX = 14, padY = 10;
        const bx = width - textW - padX * 2 - 12;
        const by = height - fontSize - padY * 2 - 12;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.roundRect(bx, by, textW + padX * 2, fontSize + padY * 2, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(label, bx + padX, by + padY + fontSize - 2);

        canvas.toBlob((blob) => {
          const out = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(out);
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

function SharedPracticeSection({ exam, result }) {
  const [openHints, setOpenHints] = useState({});

  let practiceData = null;
  try {
    if (exam?.sharedPractice) practiceData = JSON.parse(exam.sharedPractice);
  } catch { }
  if (!practiceData?.exercises?.length) return null;

  // Find which levels this student hasn't maxed
  const weakLevelNames = new Set();
  (exam.levels || []).forEach(level => {
    const levelScores = (result.scores || []).filter(
      s => s.questionOrder >= level.fromQuestion && s.questionOrder <= level.toQuestion
    );
    const earned = levelScores.reduce((sum, s) => sum + (s.score || 0), 0);
    if (earned < level.totalPoints) weakLevelNames.add(level.name);
  });

  const relevantExercises = practiceData.exercises.filter(e => weakLevelNames.has(e.level));
  if (relevantExercises.length === 0) return null;

  const toggleHint = (key) => setOpenHints(prev => ({ ...prev, [key]: !prev[key] }));

  const levelColor = (name) => {
    const n = name?.toLowerCase() || '';
    if (n.includes('vận dụng cao')) return { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' };
    if (n.includes('vận dụng')) return { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' };
    if (n.includes('thông hiểu')) return { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700' };
    return { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FiBookOpen className="text-emerald-600 text-lg" />
        <span className="font-semibold text-emerald-900">Bài tập ôn luyện gợi ý</span>
        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">AI tạo</span>
      </div>
      <p className="text-xs text-emerald-700 bg-emerald-100 rounded-lg px-3 py-2">
        Hệ thống AI phân tích kết quả và tạo các câu hỏi tương tự ở những phần em chưa đạt điểm tối đa. Hãy luyện tập để cải thiện!
      </p>
      {relevantExercises.map((section, si) => {
        const colors = levelColor(section.level);
        return (
          <div key={si} className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden`}>
            <div className={`px-4 py-2.5 flex items-center gap-2`}>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>{section.level}</span>
            </div>
            <div className="px-4 pb-4 space-y-3">
              {section.questions?.map((q, qi) => {
                const key = `${si}-${qi}`;
                const hintOpen = openHints[key];
                return (
                  <div key={qi} className="bg-white rounded-lg border border-white/80 shadow-sm p-3">
                    <p className="text-sm text-gray-800 font-medium">
                      <span className="text-gray-400 mr-1.5">Câu {qi + 1}.</span>{q.q}
                    </p>
                    {q.hint && (
                      <div className="mt-2">
                        <button
                          onClick={() => toggleHint(key)}
                          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium"
                        >
                          {hintOpen ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                          {hintOpen ? 'Ẩn gợi ý' : 'Xem gợi ý'}
                        </button>
                        {hintOpen && (
                          <p className="mt-1.5 text-xs text-teal-700 bg-teal-50 rounded px-2 py-1.5 italic">💡 {q.hint}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StudentExamDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingImages, setPendingImages] = useState([]); // { file, previewUrl }
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [levelColors, setLevelColors] = useState({}); // { levelName: 'text-... bg-... border-...' }

  useEffect(() => {
    api.get(`/exams/student/${id}`)
      .then(r => setExam(r.data))
      .catch(err => setError(err.response?.data?.message || 'Không tải được đề'))
      .finally(() => setLoading(false));

    // Load difficulty levels colors
    api.get('/settings')
      .then(r => {
        const colorMap = {};
        (r.data.difficultyLevels || []).forEach(level => {
          // Combine the bgColor and textColor with a border variant
          const borderClass = level.bgColor?.replace('-100', '-200') || 'border-gray-200';
          colorMap[level.name] = `${level.textColor} ${level.bgColor} border-${borderClass.replace('border-', '')}`;
        });
        setLevelColors(colorMap);
      })
      .catch(() => {});
  }, [id]);

  // Xử lý LaTeX đồng bộ bằng useMemo (không cần setTimeout, tránh race condition)
  const processedExamContent = useMemo(() => processLatexContent(exam?.content), [exam?.content]);

  const handlePickImages = async (e) => {
    const files = Array.from(e.target.files || []);
    const studentName = user?.name || 'Học sinh';
    const newItems = await Promise.all(
      files.map(async (file) => {
        const compressed = await compressAndWatermark(file, studentName);
        return { file: compressed, previewUrl: URL.createObjectURL(compressed) };
      })
    );
    setPendingImages(prev => [...prev, ...newItems]);
    e.target.value = '';
  };

  const removePending = (idx) => {
    setPendingImages(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async () => {
    if (pendingImages.length === 0) return;
    setUploading(true);
    try {
      // Upload từng ảnh
      const uploadedUrls = [];
      for (const item of pendingImages) {
        const formData = new FormData();
        formData.append('file', item.file);
        const { data } = await api.post('/upload/image', formData);
        uploadedUrls.push(data.url);
      }
      // Gửi danh sách URL
      const { data: result } = await api.post(`/exams/student/${id}/submit`, { imageUrls: uploadedUrls });
      setExam(prev => ({ ...prev, myResult: result }));
      setPendingImages([]);
      setSubmitted(true);
      toast.success('Đã nộp bài thành công!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi nộp bài');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 font-medium">{error}</p>
        <Link to="/exams" className="mt-4 inline-block text-sm text-blue-600 hover:underline">← Quay lại</Link>
      </div>
    </div>
  );

  const result = exam?.myResult;
  const maxScore = exam?.levels?.reduce((s, l) => s + (l.totalPoints || 0), 0) || 0;
  const pct = result && maxScore > 0 ? result.totalScore / maxScore : 0;

  const now = new Date();
  const examStarted = !exam.startDate || new Date(exam.startDate) <= now;
  const examEnded = exam.endDate && new Date(exam.endDate) < now;

  const fmtDate = (d) => {
    const dt = new Date(d);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <Link to="/exams" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
            <FiArrowLeft /> Đề kiểm tra của tôi
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
            {exam.class && <span>🏫 {exam.class.name}</span>}
            {exam.lesson && <span>📚 {exam.lesson.title}</span>}
            <span>📝 {exam.totalQuestions} câu</span>
            <span>💯 {maxScore} điểm</span>
          </div>
          {exam.note && <p className="mt-2 text-sm text-gray-500 italic">{exam.note}</p>}
        </div>

        {/* Trạng thái thời gian */}
        {examEnded && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <FiLock className="text-red-500 text-xl shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Đã hết hạn nộp bài</p>
              {exam.endDate && <p className="text-xs text-red-500 mt-0.5">Đề đóng lúc {fmtDate(exam.endDate)}</p>}
            </div>
          </div>
        )}
        {!examEnded && exam.endDate && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
            <FiClock className="text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800">Hạn nộp bài: <span className="font-semibold">{fmtDate(exam.endDate)}</span></p>
          </div>
        )}

        {/* Kết quả nếu đã chấm */}
        {result?.status === 'graded' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <FiAward className="text-yellow-500" /> Kết quả của bạn
            </h2>

            {/* Điểm tổng */}
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className={`text-4xl font-bold ${pct >= 0.8 ? 'text-green-600' : pct >= 0.5 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {result.totalScore}
                </div>
                <div className="text-sm text-gray-400">/ {result.maxScore} điểm</div>
              </div>
              <div className="flex-1">
                <div className="w-full bg-gray-100 rounded-full h-3 mb-1">
                  <div
                    className={`h-3 rounded-full transition-all ${pct >= 0.8 ? 'bg-green-500' : pct >= 0.5 ? 'bg-yellow-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.min(100, pct * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">{(pct * 100).toFixed(0)}% số điểm</p>
              </div>
            </div>

            {/* Điểm từng mức */}
            {exam.levels?.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {exam.levels.map(level => {
                  const levelScores = (result.scores || []).filter(
                    s => s.questionOrder >= level.fromQuestion && s.questionOrder <= level.toQuestion
                  );
                  const earned = levelScores.reduce((s, q) => s + (q.score || 0), 0);
                  const defaultColors = 'bg-gray-50 border-gray-200 text-gray-700';
                  return (
                    <div key={level.name} className={`rounded-lg border px-3 py-2 text-center text-sm ${levelColors[level.name] || defaultColors}`}>
                      <div className="font-medium">{level.name}</div>
                      <div className="text-lg font-bold mt-0.5">{earned}<span className="text-xs font-normal opacity-70">/{level.totalPoints}</span></div>
                      <div className="text-xs opacity-70">Câu {level.fromQuestion}–{level.toQuestion}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Thông tin về Gemini AI Feedback */}
            {/* <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-indigo-900 mb-1">💡 Nhận xét được tạo bởi Gemini AI</p>
              <p className="text-xs text-indigo-800">Hệ thống sử dụng trí tuệ nhân tạo Gemini để phân tích kết quả kiểm tra của em dựa trên điểm số từng mức độ, giúp cung cấp nhận xét chi tiết và hữu ích.</p>
            </div> */}

            {/* Nhận xét từ Gemini AI */}
            {result.autoFeedback && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-300 rounded-lg p-5 shadow-sm">
                <p className="text-xs font-bold text-blue-900 mb-1 flex items-center gap-2">
                  <span className="inline-block px-2 py-1 bg-blue-200 text-blue-900 rounded font-mono text-xs font-bold">ToánThầyHiếu</span>
                  <span>Nhận Xét Kết Quả</span>
                </p>
                <p className="text-sm text-blue-900 whitespace-pre-line leading-relaxed">{result.autoFeedback}</p>
              </div>
            )}

            {/* Nhận xét giáo viên */}
            {result.teacherNote && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-300 rounded-lg p-5 shadow-sm">
                <p className="text-xs font-bold text-purple-900 mb-1 flex items-center gap-2">
                  <span className="inline-block px-2 py-1 bg-purple-200 text-purple-900 rounded font-mono text-xs font-bold">👨‍🏫</span>
                  <span>Nhận xét của giáo viên</span>
                </p>
                <p className="text-sm text-purple-900 whitespace-pre-line leading-relaxed">{result.teacherNote}</p>
              </div>
            )}

            {/* Bài tập ôn luyện */}
            <SharedPracticeSection exam={exam} result={result} />
          </div>
        )}

        {/* Chờ chấm */}
        {result?.status === 'pending' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
            <FiClock className="text-yellow-500 text-xl shrink-0" />
            <p className="text-sm text-yellow-800">Bài làm đang chờ giáo viên chấm điểm.</p>
          </div>
        )}

        {/* Chưa có kết quả */}
        {!result && (
          <div className="bg-gray-100 rounded-xl p-4 flex items-center gap-3">
            <FiClock className="text-gray-400 text-xl shrink-0" />
            <p className="text-sm text-gray-500">Giáo viên chưa nhập điểm cho bài này.</p>
          </div>
        )}

        {/* Nộp bài bằng ảnh */}
        <div className={`bg-white rounded-xl border p-5 space-y-4 ${examEnded ? 'border-red-200 opacity-70' : 'border-gray-200'}`}>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            {examEnded ? <FiLock className="text-red-400" /> : <FiCamera className="text-blue-500" />}
            Nộp bài làm
            {examEnded && <span className="text-xs font-normal text-red-500 ml-1">— đã đóng</span>}
          </h2>

          {examEnded ? (
            <div className="text-sm text-red-500 bg-red-50 rounded-lg p-3 flex items-center gap-2">
              <FiLock size={14} /> Thời gian nộp bài đã kết thúc.
            </div>
          ) : (
            <>
          {/* Ảnh đã nộp trước đó */}
          {result?.submissionImages?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Ảnh đã nộp ({result.submissionImages.length}):</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {result.submissionImages.map((img, i) => (
                  <a key={i} href={getUploadUrl(img.url)} target="_blank" rel="noopener noreferrer">
                    <img
                      src={getUploadUrl(img.url)}
                      alt={`Bài làm ${i + 1}`}
                      className="w-full h-32 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Chọn ảnh mới */}
          <div>
            <p className="text-xs text-gray-500 mb-2">
              {result?.submissionImages?.length > 0 ? 'Nộp lại (sẽ thay thế ảnh cũ):' : 'Chọn ảnh chụp bài làm:'}
            </p>
            <label className="flex items-center gap-2 cursor-pointer w-fit px-4 py-2 border-2 border-dashed border-blue-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-sm text-blue-600 font-medium">
              <FiImage size={16} />
              Chọn ảnh / Chụp ảnh
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={handlePickImages}
              />
            </label>
          </div>

          {/* Preview ảnh chờ upload */}
          {pendingImages.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Ảnh sẽ nộp ({pendingImages.length}):</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {pendingImages.map((item, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={item.previewUrl}
                      alt={`Preview ${i + 1}`}
                      className="w-full h-32 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removePending(i)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <FiX size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={handleSubmit}
                disabled={uploading}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 text-sm font-medium"
              >
                <FiUpload size={15} />
                {uploading ? 'Đang nộp...' : `Nộp ${pendingImages.length} ảnh`}
              </button>
            </div>
          )}

          {submitted && pendingImages.length === 0 && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <FiCheckCircle /> Đã nộp bài thành công!
            </div>
          )}
            </>
          )}
        </div>

        {/* Nội dung đề */}
        {exam.content ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-500 mb-4 pb-2 border-b border-gray-100 italic text-xs">Toán Thầy Hiếu - 038.2468.988</h2>
            <div className="exam-content">
              <div
                className="ql-editor"
                dangerouslySetInnerHTML={{ __html: processedExamContent }}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
            Giáo viên chưa cập nhật nội dung đề
          </div>
        )}
      </div>
    </div>
  );
}
