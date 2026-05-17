import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { FiArrowLeft, FiFileText, FiCheckCircle, FiClock, FiLock, FiMenu, FiX } from 'react-icons/fi';
import 'katex/dist/katex.min.css';
import 'quill/dist/quill.snow.css';
import katex from 'katex';

export default function LessonDetailPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('class');
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [siblings, setSiblings] = useState([]); // danh sách bài học cùng khóa
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile sidebar toggle

  useEffect(() => {
    const loadLesson = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/lessons/${lessonId}`);
        setLesson(res.data);
        // Load danh sách bài học cùng khóa
        const courseId = res.data.course?._id || res.data.course;
        if (courseId) {
          const siblingsRes = await api.get(`/lessons?course=${courseId}`);
          setSiblings(siblingsRes.data);
        }
      } catch (err) {
        toast.error('Không tải được bài học');
        navigate('/classes');
      } finally {
        setLoading(false);
      }
    };
    loadLesson();
  }, [lessonId, navigate]);

  // Render LaTeX trong content sau khi DOM được mount
  useEffect(() => {
    if (!lesson?.content) return;
    // Dùng setTimeout để đảm bảo dangerouslySetInnerHTML đã render xong
    const timer = setTimeout(() => {
      try { renderLaTeXInContent(); } catch (e) { console.error(e); }
    }, 50);
    return () => clearTimeout(timer);
  }, [lesson]);

  // Xử lý LaTeX bằng TreeWalker - chỉ chạm vào text nodes, không phá HTML tags
  const renderLaTeXInContent = () => {
    const rootEl = document.querySelector('.lesson-content');
    if (!rootEl) return;

    // 1. Re-render mọi ql-formula từ data-value (tránh lỗi khi KaTeX chưa render)
    rootEl.querySelectorAll('.ql-formula').forEach(span => {
      const formula = span.getAttribute('data-value');
      if (!formula) return;
      try {
        span.innerHTML = katex.renderToString(formula.trim(), { throwOnError: false });
      } catch {}
    });

    // 2. Walk text nodes tìm $...$ / $$...$$ trong phần còn lại
    const contentEl = rootEl.querySelector('.ql-editor') || rootEl;

    // Thu thập tất cả text nodes, bỏ qua nodes trong ql-formula / katex đã render
    const walker = document.createTreeWalker(
      contentEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          let el = node.parentElement;
          while (el && el !== contentEl) {
            if (
              el.classList.contains('ql-formula') ||
              el.classList.contains('katex') ||
              el.classList.contains('katex-display')
            ) {
              return NodeFilter.FILTER_REJECT;
            }
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

      // Xử lý $$ trước rồi mới $
      let html = text
        .replace(/\$\$([^$]+?)\$\$/g, (match, formula) => {
          try {
            return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false });
          } catch { return match; }
        })
        .replace(/\$([^$\n]+?)\$/g, (match, formula) => {
          // Bỏ qua nếu formula trống hoặc chỉ có khoảng trắng
          if (!formula.trim()) return match;
          try {
            return katex.renderToString(formula.trim(), { throwOnError: false });
          } catch { return match; }
        });

      // Chỉ thay thế nếu thực sự có thay đổi
      if (html !== text) {
        const span = document.createElement('span');
        span.innerHTML = html;
        textNode.parentNode.replaceChild(span, textNode);
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="text-center py-20 text-gray-500">Không tìm thấy bài học</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 lg:py-8 flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Mobile: top bar with back + sidebar toggle */}
        <div className="flex items-center justify-between lg:hidden mb-1">
          <button
            onClick={() => classId ? navigate(`/class/${classId}`) : navigate(-1)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            <FiArrowLeft size={16} /> Quay lại
          </button>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex items-center gap-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm"
          >
            {sidebarOpen ? <FiX size={15} /> : <FiMenu size={15} />}
            <span>Mục lục ({siblings.findIndex(s => s._id === lessonId) + 1}/{siblings.length})</span>
          </button>
        </div>

        {/* Sidebar - danh sách bài học */}
        <aside className={`lg:w-72 lg:flex-shrink-0 ${sidebarOpen ? 'block' : 'hidden'} lg:block`}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 lg:sticky lg:top-6">
            {/* Course name */}
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900 text-sm leading-snug">
                {lesson.course?.title || 'Khóa học'}
              </h2>
              {lesson.course?.category && (
                <div className="flex gap-2 mt-2">
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">📁 {lesson.course.category}</span>
                  {lesson.course?.level && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">📊 {lesson.course.level}</span>}
                </div>
              )}
            </div>

            {/* Lesson list */}
            <nav className="py-2 lg:max-h-[calc(100vh-220px)] max-h-64 overflow-y-auto">
              {siblings.map((s, idx) => {
                const isActive = s._id === lessonId;
                return (
                  <button
                    key={s._id}
                    onClick={() => { navigate(`/lesson/${s._id}${classId ? `?class=${classId}` : ''}`); setSidebarOpen(false); }}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-l-2 ${
                      isActive
                        ? 'bg-blue-50 border-l-blue-600 text-blue-700'
                        : 'border-l-transparent hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className={`mt-0.5 flex-shrink-0 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                        {s.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {s.duration && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <FiClock size={10} /> {s.duration} phút
                          </span>
                        )}
                        {s.isPublished
                          ? <FiCheckCircle size={10} className="text-green-500" />
                          : <FiLock size={10} className="text-gray-400" />
                        }
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Desktop back button */}
          <button
            onClick={() => classId ? navigate(`/class/${classId}`) : navigate(-1)}
            className="hidden lg:flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-6"
          >
            <FiArrowLeft size={18} /> Quay lại danh sách bài học
          </button>

          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-8">
            {/* Header */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-3">{lesson.title}</h1>
              <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                {lesson.duration && <span>⏱️ {lesson.duration} phút</span>}
                <span>{lesson.isPublished ? '✅ Đã đăng' : '🔒 Nháp'}</span>
              </div>
            </div>

            {/* Video */}
            {lesson.videoUrl && (
              <div className="mb-8 aspect-video bg-black rounded-lg overflow-hidden">
                <iframe
                  width="100%"
                  height="100%"
                  src={lesson.videoUrl}
                  title={lesson.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            )}

            {/* Content */}
            {lesson.content && (
              <div className="lesson-content mb-8">
                <div
                  className="ql-editor"
                  dangerouslySetInnerHTML={{ __html: lesson.content }}
                />
              </div>
            )}

            {/* PDF Attachments */}
            {lesson.pdfAttachments && lesson.pdfAttachments.length > 0 && (
              <div className="pt-8 border-t border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">📎 Tài liệu đính kèm</h2>
                <div className="space-y-3">
                  {lesson.pdfAttachments.map((pdf, idx) => (
                    <a
                      key={idx}
                      href={pdf.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    >
                      <FiFileText size={24} className="text-red-500" />
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{pdf.filename}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Tải lên: {new Date(pdf.uploadedAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Prev / Next navigation */}
            {siblings.length > 1 && (() => {
              const currentIdx = siblings.findIndex(s => s._id === lessonId);
              const prev = siblings[currentIdx - 1];
              const next = siblings[currentIdx + 1];
              return (
                <div className="flex justify-between gap-4 mt-10 pt-6 border-t border-gray-200">
                  {prev ? (
                    <button onClick={() => navigate(`/lesson/${prev._id}${classId ? `?class=${classId}` : ''}`)} className="flex-1 flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 p-3 rounded-lg hover:bg-blue-50 transition-colors">
                      <FiArrowLeft size={16} />
                      <div className="text-left">
                        <p className="text-xs text-gray-400">Bài trước</p>
                        <p className="font-medium line-clamp-1">{prev.title}</p>
                      </div>
                    </button>
                  ) : <div className="flex-1" />}
                  {next && (
                    <button onClick={() => navigate(`/lesson/${next._id}${classId ? `?class=${classId}` : ''}`)} className="flex-1 flex items-center justify-end gap-2 text-sm text-gray-600 hover:text-blue-600 p-3 rounded-lg hover:bg-blue-50 transition-colors">
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Bài tiếp theo</p>
                        <p className="font-medium line-clamp-1">{next.title}</p>
                      </div>
                      <FiArrowLeft size={16} className="rotate-180" />
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <style>{`
        .katex-inline {
          display: inline;
          white-space: normal;
          margin: 0 2px;
        }
        .katex-display {
          display: flex;
          justify-content: center;
          margin: 1.5em 0;
          overflow-x: auto;
        }
        .ql-editor {
          padding: 0;
          border: none;
          font-family: inherit;
          font-size: 1rem;
          line-height: 1.7;
        }
        .ql-editor h1 { font-size: 1.75em; font-weight: bold; margin: 1em 0 0.5em; }
        .ql-editor h2 { font-size: 1.4em; font-weight: bold; margin: 0.75em 0 0.4em; }
        .ql-editor h3 { font-size: 1.2em; font-weight: bold; margin: 0.6em 0 0.3em; }
        .ql-editor p { margin: 0.8em 0; }
        .ql-editor ul { margin: 1em 0; padding-left: 2em; list-style-type: disc; }
        .ql-editor ol { margin: 1em 0; padding-left: 2em; list-style-type: decimal; }
        .ql-editor li { margin: 0.4em 0; }
        .ql-editor blockquote { 
          border-left: 4px solid #3b82f6; 
          margin: 1em 0; 
          padding: 0.5em 1em; 
          background: #f0f9ff; 
          color: #1e40af;
        }
        .ql-editor code { 
          background: #f3f4f6; 
          padding: 2px 6px; 
          border-radius: 3px; 
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
        }
        .ql-editor pre { 
          background: #1f2937; 
          color: #f3f4f6;
          padding: 1em; 
          border-radius: 4px; 
          overflow-x: auto;
          margin: 1em 0;
        }
        .ql-editor pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
        .ql-editor a { 
          color: #0066cc; 
          text-decoration: underline;
          cursor: pointer;
        }
        .ql-editor a:hover { 
          color: #0052a3; 
        }
        .ql-editor img { 
          max-width: 100%; 
          height: auto;
          margin: 1em 0;
          border-radius: 4px;
        }
        .ql-editor strong { font-weight: bold; }
        .ql-editor em { font-style: italic; }
        .ql-editor u { text-decoration: underline; }
        .ql-editor s { text-decoration: line-through; }
        .ql-editor table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }
        .ql-editor table td, .ql-editor table th {
          border: 1px solid #d1d5db;
          padding: 8px 12px;
        }
        .ql-editor table th {
          background: #f3f4f6;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
