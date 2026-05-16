import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiCheckCircle, FiClock, FiAward, FiCamera, FiX, FiUpload, FiImage } from 'react-icons/fi';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import { getUploadUrl } from '../api/axios';

const LEVEL_COLOR = {
  'Nhận biết': 'text-green-700 bg-green-50 border-green-200',
  'Thông hiểu': 'text-blue-700 bg-blue-50 border-blue-200',
  'Vận dụng cao': 'text-orange-700 bg-orange-50 border-orange-200',
};

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

export default function StudentExamDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingImages, setPendingImages] = useState([]); // { file, previewUrl }
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.get(`/exams/student/${id}`)
      .then(r => setExam(r.data))
      .catch(err => setError(err.response?.data?.message || 'Không tải được đề'))
      .finally(() => setLoading(false));
  }, [id]);

  // Render LaTeX sau khi content mount
  useEffect(() => {
    if (!exam?.content) return;
    const timer = setTimeout(() => {
      try { renderLaTeX(); } catch (e) { console.error(e); }
    }, 50);
    return () => clearTimeout(timer);
  }, [exam]);

  const renderLaTeX = () => {
    const contentEl = document.querySelector('.exam-content .ql-editor');
    if (!contentEl) return;

    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el && el !== contentEl) {
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
      const html = text
        .replace(/\$\$([^$]+?)\$\$/g, (match, f) => {
          try { return katex.renderToString(f.trim(), { displayMode: true, throwOnError: false }); } catch { return match; }
        })
        .replace(/\$([^$\n]+?)\$/g, (match, f) => {
          if (!f.trim()) return match;
          try { return katex.renderToString(f.trim(), { throwOnError: false }); } catch { return match; }
        });
      if (html !== text) {
        const span = document.createElement('span');
        span.innerHTML = html;
        textNode.parentNode.replaceChild(span, textNode);
      }
    });
  };

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
                  return (
                    <div key={level.name} className={`rounded-lg border px-3 py-2 text-center text-sm ${LEVEL_COLOR[level.name] || 'bg-gray-50 border-gray-200'}`}>
                      <div className="font-medium">{level.name}</div>
                      <div className="text-lg font-bold mt-0.5">{earned}<span className="text-xs font-normal opacity-70">/{level.totalPoints}</span></div>
                      <div className="text-xs opacity-70">Câu {level.fromQuestion}–{level.toQuestion}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Nhận xét tự động */}
            {result.autoFeedback && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-xs font-semibold text-blue-700 mb-2">Nhận xét tự động:</p>
                <p className="text-sm text-blue-800 whitespace-pre-line">{result.autoFeedback}</p>
              </div>
            )}

            {/* Nhận xét giáo viên */}
            {result.teacherNote && (
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                <p className="text-xs font-semibold text-purple-700 mb-2">Nhận xét của giáo viên:</p>
                <p className="text-sm text-purple-800 whitespace-pre-line">{result.teacherNote}</p>
              </div>
            )}
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
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <FiCamera className="text-blue-500" /> Nộp bài làm
          </h2>

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
        </div>

        {/* Nội dung đề */}
        {exam.content ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-500 mb-4 pb-2 border-b border-gray-100 italic text-xs">Toán Thầy Hiếu - 038.2468.988</h2>
            <div className="exam-content">
              <div
                className="ql-editor"
                dangerouslySetInnerHTML={{ __html: exam.content }}
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
