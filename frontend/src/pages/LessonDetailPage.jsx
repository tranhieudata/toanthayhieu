import { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api, { getUploadUrl } from '../api/axios';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiDownload, FiFileText, FiCheckCircle, FiClock, FiLock, FiMaximize2, FiMenu, FiMinimize2, FiX } from 'react-icons/fi';
import 'katex/dist/katex.min.css';
import 'quill/dist/quill.snow.css';
import katex from 'katex';
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

function hasVisibleLessonNode(element) {
  return element.textContent.trim()
    || element.querySelector('img, iframe, video, table, .katex, .katex-display, .ql-formula');
}

function buildLessonSlides(html) {
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks = Array.from(doc.body.children).filter(hasVisibleLessonNode);
    if (!blocks.length) return [];

    const hasMajorHeadings = blocks.some((block) => ['H1', 'H2'].includes(block.tagName));
    if (!hasMajorHeadings) {
      const slides = [];
      for (let i = 0; i < blocks.length; i += 4) {
        slides.push({ blocks: blocks.slice(i, i + 4).map((block) => block.outerHTML) });
      }
      return slides;
    }

    const slides = [];
    let current = [];
    blocks.forEach((block) => {
      const startsNewSlide = ['H1', 'H2'].includes(block.tagName);
      if (startsNewSlide && current.length) {
        slides.push({ blocks: current.map((item) => item.outerHTML) });
        current = [];
      }
      current.push(block);
    });
    if (current.length) slides.push({ blocks: current.map((item) => item.outerHTML) });
    return slides;
  } catch {
    return [{ blocks: [html] }];
  }
}

export default function LessonDetailPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('class');
  const [lesson, setLesson] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [bundle, setBundle] = useState({ homeworks: [] });
  const slideRef = useRef(null);
  const [contentMode, setContentMode] = useState('slide');
  const [slideIndex, setSlideIndex] = useState(0);
  const [visibleBlockCount, setVisibleBlockCount] = useState(1);
  const [isSlideFullscreen, setIsSlideFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [siblings, setSiblings] = useState([]); // danh sách bài học cùng khóa
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile sidebar toggle

  useEffect(() => {
    const loadLesson = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/lessons/${lessonId}/bundle`, {
          params: classId ? { classId } : {},
        });
        setLesson(res.data.lesson);
        setBundle({
          homeworks: res.data.homeworks || [],
        });
        // Load danh sách bài học cùng khóa
        const courseId = res.data.lesson?.course?._id || res.data.lesson?.course;
        if (courseId) {
          const siblingsRes = await api.get(`/lessons?course=${courseId}`);
          setSiblings(siblingsRes.data);
        }

        // Load bài tập thuộc bài học hiện tại
        try {
          const exercisesRes = await api.get(`/exercises?lesson=${lessonId}`);
          setExercises(exercisesRes.data || []);
        } catch {
          setExercises([]);
        }
      } catch (err) {
        toast.error('Không tải được bài học');
        navigate('/classes');
      } finally {
        setLoading(false);
      }
    };
    loadLesson();
  }, [lessonId, navigate, classId]);

  // Xử lý LaTeX đồng bộ bằng useMemo (không cần setTimeout, tránh race condition)
  const processedContent = useMemo(() => processLatexContent(lesson?.content), [lesson?.content]);
  const lessonSlides = useMemo(() => buildLessonSlides(processedContent), [processedContent]);
  const currentSlide = lessonSlides[slideIndex] || null;
  const totalSlideBlocks = currentSlide?.blocks?.length || 0;
  const canRevealMore = visibleBlockCount < totalSlideBlocks;
  const canGoBack = slideIndex > 0 || visibleBlockCount > 1;

  useEffect(() => {
    setSlideIndex(0);
    setVisibleBlockCount(1);
  }, [lessonId, processedContent]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsSlideFullscreen(document.fullscreenElement === slideRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handlePreviousSlideStep = () => {
    if (visibleBlockCount > 1) {
      setVisibleBlockCount((count) => Math.max(1, count - 1));
      return;
    }
    if (slideIndex <= 0) return;
    setSlideIndex((index) => {
      const previousIndex = Math.max(0, index - 1);
      const previousSlideBlocks = lessonSlides[previousIndex]?.blocks?.length || 1;
      setVisibleBlockCount(previousSlideBlocks);
      return previousIndex;
    });
  };

  const handleNextSlideStep = () => {
    if (canRevealMore) {
      setVisibleBlockCount((count) => Math.min(totalSlideBlocks, count + 1));
      return;
    }
    if (slideIndex < lessonSlides.length - 1) {
      setSlideIndex((index) => index + 1);
      setVisibleBlockCount(1);
    }
  };

  const handleToggleSlideFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await slideRef.current?.requestFullscreen();
    } catch {
      toast.error('Không thể bật toàn màn hình');
    }
  };

  const handleSetContentMode = async (mode) => {
    if (mode === 'normal' && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    setContentMode(mode);
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
              {/* <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                {lesson.duration && <span>⏱️ {lesson.duration} phút</span>}
                <span>{lesson.isPublished ? '✅ Đã đăng' : '🔒 Nháp'}</span>
              </div> */}
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
                <div className="lesson-content-modebar">
                  <button
                    type="button"
                    onClick={() => handleSetContentMode('normal')}
                    className={`lesson-mode-button ${contentMode === 'normal' ? 'is-active' : ''}`}
                  >
                    Nội dung
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetContentMode('slide')}
                    className={`lesson-mode-button ${contentMode === 'slide' ? 'is-active' : ''}`}
                    disabled={!lessonSlides.length}
                  >
                    Slide
                  </button>
                </div>
                {contentMode === 'slide' && lessonSlides.length ? (
                  <div ref={slideRef} className="lesson-slide">
                    <div className="lesson-slide-topbar">
                      <span className="lesson-slide-count">Slide {slideIndex + 1}/{lessonSlides.length}</span>
                      <button
                        type="button"
                        onClick={handleToggleSlideFullscreen}
                        className="lesson-slide-icon-button"
                        title={isSlideFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                        aria-label={isSlideFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                      >
                        {isSlideFullscreen ? <FiMinimize2 size={18} /> : <FiMaximize2 size={18} />}
                      </button>
                      <span className="lesson-slide-count">Ý {Math.min(visibleBlockCount, totalSlideBlocks)}/{totalSlideBlocks || 1}</span>
                    </div>
                    <div className="lesson-slide-progress" aria-hidden="true">
                      <div
                        className="lesson-slide-progress-bar"
                        style={{
                          width: `${lessonSlides.length
                            ? (((slideIndex + (totalSlideBlocks ? visibleBlockCount / totalSlideBlocks : 1)) / lessonSlides.length) * 100)
                            : 0}%`,
                        }}
                      />
                    </div>
                    <div className="ql-editor lesson-slide-content">
                      {currentSlide?.blocks?.slice(0, visibleBlockCount).map((blockHtml, blockIndex) => (
                        <div
                          key={`${slideIndex}-${blockIndex}`}
                          className="lesson-slide-block"
                          dangerouslySetInnerHTML={{ __html: blockHtml }}
                        />
                      ))}
                    </div>
                    <div className="lesson-slide-controls">
                      <button
                        type="button"
                        onClick={handlePreviousSlideStep}
                        disabled={!canGoBack}
                        className="lesson-slide-button"
                      >
                        <FiChevronLeft size={18} /> Trước
                      </button>
                      <button
                        type="button"
                        onClick={handleNextSlideStep}
                        disabled={!canRevealMore && slideIndex >= lessonSlides.length - 1}
                        className="lesson-slide-button lesson-slide-button-primary"
                      >
                        Tiếp <FiChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="ql-editor"
                    dangerouslySetInnerHTML={{ __html: processedContent }}
                  />
                )}
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
                      href={getUploadUrl(pdf.url)}
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
            {bundle.homeworks?.length > 0 && (
              <div className="pt-8 border-t border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Bài tập</h2>
                <div className="space-y-3">
                  {bundle.homeworks.map((homework) => (
                    <div key={homework._id} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{homework.title}</p>
                          <p className="mt-1 text-sm text-gray-500">Mở trong mục Bài tập để xem và nộp bài.</p>
                        </div>
                        {homework.dueDate && (
                          <span className="text-xs text-gray-500">Hạn: {new Date(homework.dueDate).toLocaleDateString('vi-VN')}</span>
                        )}
                      </div>
                      {homework.sourceExam?.title && (
                        <p className="mt-2 text-xs text-emerald-600">Gắn từ đề: {homework.sourceExam.title}</p>
                      )}
                      <Link
                        to="/homeworks"
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Mở bài tập
                      </Link>
                      {homework.pdfAttachments?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {homework.pdfAttachments.map((file, index) => (
                            <a
                              key={`${file.url}-${index}`}
                              href={getUploadUrl(file.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
                            >
                              <FiDownload size={14} /> {file.filename || `Bai tap ${index + 1}.pdf`}
                            </a>
                          ))}
                        </div>
                      )}
                      {homework.parentPrintUrl && (
                        <a
                          href={homework.parentPrintUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
                        >
                          <FiDownload size={14} /> Link in/tải PDF cho phụ huynh
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Bài tập của bài học */}
            {exercises.length > 0 && (
              <div className="pt-8 border-t border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">📝 Bài tập</h2>
                <div className="space-y-3">
                  {exercises.map((exercise) => (
                    <Link
                      key={exercise._id}
                      to={`/exercises/${exercise._id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{exercise.title || 'Bài tập'}</p>
                        <p className="mt-1 text-sm text-gray-500">
                          {exercise.questions?.length || 0} câu
                          {exercise.timeLimit ? ` · ${exercise.timeLimit} phút` : ''}
                          {exercise.passingScore ? ` · Đạt ${exercise.passingScore}%` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-blue-600">Làm bài</span>
                    </Link>
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
        .lesson-content-modebar {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          margin-bottom: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #f8fafc;
        }
        .lesson-mode-button {
          min-height: 34px;
          padding: 0 14px;
          border-radius: 6px;
          color: #475569;
          font-weight: 600;
          font-size: 0.875rem;
          transition: background 150ms ease, color 150ms ease;
        }
        .lesson-mode-button:hover:not(:disabled) {
          background: #e0f2fe;
          color: #1d4ed8;
        }
        .lesson-mode-button.is-active {
          background: #2563eb;
          color: #ffffff;
        }
        .lesson-mode-button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
        .lesson-slide {
          border: 1px solid #dbeafe;
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
        }
        .lesson-slide:fullscreen {
          width: 100vw;
          height: 100vh;
          border: none;
          border-radius: 0;
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }
        .lesson-slide-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
          background: #f8fafc;
        }
        .lesson-slide-count {
          color: #475569;
          font-size: 0.875rem;
          font-weight: 600;
          white-space: nowrap;
        }
        .lesson-slide-icon-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          color: #334155;
        }
        .lesson-slide-icon-button:hover {
          background: #e0f2fe;
          color: #1d4ed8;
        }
        .lesson-slide-progress {
          height: 4px;
          background: #e2e8f0;
          overflow: hidden;
        }
        .lesson-slide-progress-bar {
          height: 100%;
          background: #2563eb;
          transition: width 180ms ease;
        }
        .lesson-slide-content {
          min-height: min(52vh, 520px);
          padding: 18px 18px 8px;
        }
        .lesson-slide:fullscreen .lesson-slide-content {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 32px clamp(24px, 6vw, 80px);
          font-size: 1.25rem;
        }
        .lesson-slide-block {
          animation: lessonSlideReveal 160ms ease-out;
        }
        .lesson-slide-controls {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-top: 1px solid #e5e7eb;
          background: #f8fafc;
        }
        .lesson-slide-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-width: 112px;
          min-height: 40px;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #374151;
          font-weight: 600;
          transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
        }
        .lesson-slide-button:hover:not(:disabled) {
          border-color: #93c5fd;
          color: #1d4ed8;
          background: #eff6ff;
        }
        .lesson-slide-button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
        .lesson-slide-button-primary {
          border-color: #2563eb;
          background: #2563eb;
          color: #ffffff;
        }
        .lesson-slide-button-primary:hover:not(:disabled) {
          border-color: #1d4ed8;
          background: #1d4ed8;
          color: #ffffff;
        }
        @keyframes lessonSlideReveal {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
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
