import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { getUploadUrl } from '../api/axios';
import { FiDownload, FiEdit3, FiFileText, FiMinusCircle, FiPrinter, FiTrash2 } from 'react-icons/fi';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('vi-VN');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function hasHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''));
}

function renderMathHtml(value) {
  const source = String(value || '');
  const parts = source.split(/(\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return parts.map((part) => {
    const displayDollar = part.startsWith('$$') && part.endsWith('$$');
    const displayBracket = part.startsWith('\\[') && part.endsWith('\\]');
    const inlineParen = part.startsWith('\\(') && part.endsWith('\\)');
    const inlineDollar = part.startsWith('$') && part.endsWith('$') && !displayDollar;
    if (!displayDollar && !displayBracket && !inlineParen && !inlineDollar) return escapeHtml(part);

    const tex = (displayDollar || displayBracket || inlineParen) ? part.slice(2, -2) : part.slice(1, -1);
    try {
      return katex.renderToString(tex.trim(), {
        displayMode: displayDollar || displayBracket,
        throwOnError: false,
      });
    } catch {
      return escapeHtml(part);
    }
  }).join('');
}

function renderStoredHtmlWithMath(html) {
  if (!html || typeof document === 'undefined') return html || '';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  wrapper.querySelectorAll('.ql-formula').forEach((span) => {
    const formula = span.getAttribute('data-value') || span.textContent;
    if (!formula) return;
    try {
      span.outerHTML = katex.renderToString(formula.trim(), { throwOnError: false });
    } catch {}
  });

  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let el = node.parentElement;
      while (el && el !== wrapper) {
        if (
          el.classList.contains('katex') ||
          el.classList.contains('katex-display') ||
          ['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(el.tagName)
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        el = el.parentElement;
      }
      return /\$|\\\(|\\\[/.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);
  textNodes.forEach((textNode) => {
    const span = document.createElement('span');
    span.innerHTML = renderMathHtml(textNode.textContent);
    textNode.parentNode.replaceChild(span, textNode);
  });

  return wrapper.innerHTML;
}

function examPackageHtml(paper) {
  if (!paper) return '';
  const mc = paper.questions?.multipleChoice || [];
  const essay = paper.questions?.essay || [];
  return `
    ${paper.title ? `<h2>${escapeHtml(paper.title)}</h2>` : ''}
    ${mc.length ? '<h3>I. Phần trắc nghiệm</h3>' : ''}
    ${mc.map((q, index) => `
      <div class="print-question">
        <p><strong>Câu ${escapeHtml(q.number || index + 1)}.</strong> ${renderMathHtml(q.question)}</p>
        <div class="print-options">
          ${['A', 'B', 'C', 'D'].map((key) => `<p>${key}. ${renderMathHtml(q.options?.[key])}</p>`).join('')}
        </div>
      </div>
    `).join('')}
    ${essay.length ? '<h3>II. Phần tự luận</h3>' : ''}
    ${essay.map((q, index) => `
      <div class="print-question">
        <p><strong>Bài ${index + 1}.</strong> ${renderMathHtml(q.question)}</p>
      </div>
    `).join('')}
  `;
}

function hasExamPackageQuestions(paper) {
  return Boolean(
    (paper?.questions?.multipleChoice || []).length ||
    (paper?.questions?.essay || []).length
  );
}

function homeworkContentHtml(homework) {
  if (hasExamPackageQuestions(homework?.examPackage)) return examPackageHtml(homework.examPackage);
  if (hasHtml(homework?.description)) return renderStoredHtmlWithMath(homework.description);
  return renderMathHtml(homework?.description || '').replace(/\n/g, '<br />');
}

function answerContentHtml(homework) {
  const parts = [];
  if (homework?.adminSolutionContent?.trim()) {
    parts.push(
      hasHtml(homework.adminSolutionContent)
        ? renderStoredHtmlWithMath(homework.adminSolutionContent)
        : renderMathHtml(homework.adminSolutionContent).replace(/\n/g, '<br />')
    );
  }
  if (homework?.adminAnswerKey?.trim()) {
    parts.push(
      hasHtml(homework.adminAnswerKey)
        ? renderStoredHtmlWithMath(homework.adminAnswerKey)
        : renderMathHtml(homework.adminAnswerKey).replace(/\n/g, '<br />')
    );
  }
  return parts.join('<hr class="answer-divider" />');
}

function hasAdminAnswers(homework) {
  return Boolean(
    homework?.canViewAnswers &&
    (
      homework.adminSolutionContent?.trim() ||
      homework.adminAnswerKey?.trim() ||
      homework.solutionImages?.length ||
      homework.solutionPdfAttachments?.length
    )
  );
}

const INK_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#111827'];

export default function PublicHomeworkPrintPage() {
  const { token } = useParams();
  const printPageRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastInkPointRef = useRef(null);
  const [homework, setHomework] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isInkMode, setIsInkMode] = useState(false);
  const [inkTool, setInkTool] = useState('pen');
  const [inkColor, setInkColor] = useState(INK_COLORS[0]);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    api.get(`/homeworks/public-print/${token}`)
      .then(async (res) => {
        let nextHomework = res.data;
        if (localStorage.getItem('token')) {
          const answersRes = await api.get(`/homeworks/public-print/${token}/answers`, {
            validateStatus: status => status < 500,
          });
          if (answersRes.status === 200) {
            nextHomework = { ...nextHomework, ...answersRes.data };
          }
        }
        setHomework(nextHomework);
      })
      .catch((err) => setError(err.response?.data?.message || 'Link bài tập không tồn tại'))
      .finally(() => setLoading(false));
  }, [token]);

  const resizeInkCanvas = () => {
    const canvas = inkCanvasRef.current;
    const page = printPageRef.current;
    if (!canvas || !page) return;

    const scale = window.devicePixelRatio || 1;
    const width = page.offsetWidth;
    const height = page.offsetHeight;
    const nextWidth = Math.max(1, Math.floor(width * scale));
    const nextHeight = Math.max(1, Math.floor(height * scale));

    if (canvas.width === nextWidth && canvas.height === nextHeight) return;
    const previousCanvas = document.createElement('canvas');
    previousCanvas.width = canvas.width;
    previousCanvas.height = canvas.height;
    if (canvas.width && canvas.height) {
      previousCanvas.getContext('2d').drawImage(canvas, 0, 0);
    }

    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (previousCanvas.width && previousCanvas.height) {
      context.drawImage(previousCanvas, 0, 0, previousCanvas.width, previousCanvas.height, 0, 0, nextWidth, nextHeight);
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
  };

  useLayoutEffect(() => {
    if (!homework) return undefined;

    let frameId = window.requestAnimationFrame(resizeInkCanvas);
    const handleResize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(resizeInkCanvas);
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    if (printPageRef.current) resizeObserver.observe(printPageRef.current);
    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [homework]);

  const handleClearInk = () => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSelectInkTool = (tool) => {
    setInkTool(tool);
    setIsInkMode((currentMode) => (currentMode && inkTool === tool ? false : true));
  };

  const getInkPoint = (event) => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const drawInkSegment = (fromPoint, toPoint) => {
    const context = inkCanvasRef.current?.getContext('2d');
    if (!fromPoint || !toPoint || !context) return;

    context.globalCompositeOperation = inkTool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = inkTool === 'eraser' ? 'rgba(0, 0, 0, 1)' : inkColor;
    context.fillStyle = inkTool === 'eraser' ? 'rgba(0, 0, 0, 1)' : inkColor;
    context.lineWidth = inkTool === 'eraser' ? 22 : 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (fromPoint.x === toPoint.x && fromPoint.y === toPoint.y) {
      context.beginPath();
      context.arc(fromPoint.x, fromPoint.y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(fromPoint.x, fromPoint.y);
      context.lineTo(toPoint.x, toPoint.y);
      context.stroke();
    }
    context.globalCompositeOperation = 'source-over';
  };

  const canDrawWithPointer = (event) => event.pointerType !== 'touch';

  const handleInkPointerDown = (event) => {
    if (!isInkMode) return;
    event.preventDefault();
    if (!canDrawWithPointer(event)) return;
    resizeInkCanvas();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    isDrawingRef.current = true;
    const startPoint = getInkPoint(event);
    lastInkPointRef.current = startPoint;
    if (startPoint) drawInkSegment(startPoint, startPoint);
  };

  const handleInkPointerMove = (event) => {
    if (!isInkMode) return;
    event.preventDefault();
    if (!isDrawingRef.current || !canDrawWithPointer(event)) return;
    const nextPoint = getInkPoint(event);
    drawInkSegment(lastInkPointRef.current, nextPoint);
    lastInkPointRef.current = nextPoint;
  };

  const handleInkPointerUp = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    isDrawingRef.current = false;
    lastInkPointRef.current = null;
  };

  useEffect(() => {
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handlePrint = () => {
    setIsPrinting(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
        window.setTimeout(() => setIsPrinting(false), 800);
      });
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md rounded-lg border border-red-100 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className={`print-ink-toolbar print:hidden ${isPrinting ? 'is-printing' : ''}`}>
        <button
          type="button"
          onClick={() => handleSelectInkTool('pen')}
          className={`print-ink-button ${isInkMode && inkTool === 'pen' ? 'is-active' : ''}`}
          title={isInkMode && inkTool === 'pen' ? 'Tắt viết lên bài' : 'Viết lên bài'}
          aria-label={isInkMode && inkTool === 'pen' ? 'Tắt viết lên bài' : 'Viết lên bài'}
        >
          <FiEdit3 size={18} />
        </button>
        <button
          type="button"
          onClick={() => handleSelectInkTool('eraser')}
          className={`print-ink-button ${isInkMode && inkTool === 'eraser' ? 'is-active is-eraser' : ''}`}
          title={isInkMode && inkTool === 'eraser' ? 'Tắt tẩy chi tiết' : 'Tẩy chi tiết'}
          aria-label={isInkMode && inkTool === 'eraser' ? 'Tắt tẩy chi tiết' : 'Tẩy chi tiết'}
        >
          <FiMinusCircle size={18} />
        </button>
        <div className="print-ink-colors" aria-label="Chọn màu bút">
          {INK_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                setInkColor(color);
                setInkTool('pen');
                setIsInkMode(true);
              }}
              className={`print-ink-color ${inkColor === color ? 'is-active' : ''}`}
              style={{ backgroundColor: color }}
              title="Chọn màu bút"
              aria-label="Chọn màu bút"
            />
          ))}
        </div>
        <button
          type="button"
          onClick={handleClearInk}
          className="print-ink-button"
          title="Xóa toàn bộ nét viết"
          aria-label="Xóa toàn bộ nét viết"
        >
          <FiTrash2 size={18} />
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="print-ink-print-button"
        >
          <FiPrinter /> In bài
        </button>
      </div>

      <main ref={printPageRef} className="print-page mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
        <div className="border-b border-gray-200 pb-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 print:hidden">
            <FiFileText size={22} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="text-2xl font-bold text-gray-900">{homework.title}</h1>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 print:hidden"
            >
              <FiPrinter /> In bài
            </button>
          </div>
          <div className="mt-2 space-y-1 text-sm text-gray-500">
            <p>Toán Thầy Hiếu - Học Là Hiểu - 038.2468.988</p>
            {/* hiển thị ngày dạng 20-08-2026 */}
            
            {homework.class?.name && <p>Lớp: {homework.class.name}</p>}
            {homework.lesson?.title && <p>Bài học: {homework.lesson.title}</p>}
            
            

          </div>
        </div>

        <section className="print-content pt-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 print:hidden">
            <FiPrinter className="text-red-500" /> Nội dung bài tập
          </h2>
          <div
            className="prose max-w-none rounded-lg border border-gray-100 bg-white p-4 text-gray-900 print:border-0 print:p-0"
            dangerouslySetInnerHTML={{ __html: homeworkContentHtml(homework) }}
          />
        </section>

        {hasAdminAnswers(homework) && (
          <section className="answer-content pt-5">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-emerald-800">
                <FiFileText className="text-emerald-600" /> Đáp án / lời giải
              </h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 print:hidden">
                Chỉ admin nhìn thấy
              </span>
            </div>
            {(homework.adminSolutionContent?.trim() || homework.adminAnswerKey?.trim()) && (
              <div
                className="prose max-w-none rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 text-gray-900 print:border-0 print:bg-white print:p-0"
                dangerouslySetInnerHTML={{ __html: answerContentHtml(homework) }}
              />
            )}
            {homework.solutionImages?.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 print:grid-cols-1">
                {homework.solutionImages.map((img, index) => (
                  <a
                    key={`${img.url}-${index}`}
                    href={getUploadUrl(img.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-emerald-100 bg-white p-2 hover:bg-emerald-50"
                  >
                    <img src={getUploadUrl(img.url)} alt={`Đáp án ${index + 1}`} className="w-full rounded object-contain" />
                  </a>
                ))}
              </div>
            )}
            {homework.solutionPdfAttachments?.length > 0 && (
              <div className="mt-4 space-y-3 print:hidden">
                {homework.solutionPdfAttachments.map((file, index) => (
                  <a
                    key={`${file.url}-${index}`}
                    href={getUploadUrl(file.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-700 hover:bg-emerald-100"
                  >
                    <span className="min-w-0 truncate">{file.filename || `Đáp án ${index + 1}.pdf`}</span>
                    <FiDownload className="shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="pt-5 print:hidden">
          {homework.pdfAttachments?.length ? (
            <>
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
                <FiDownload className="text-blue-600" /> File PDF đính kèm
              </h2>
              <div className="space-y-3">
                {homework.pdfAttachments.map((file, index) => (
                  <a
                    key={`${file.url}-${index}`}
                    href={getUploadUrl(file.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-blue-700 hover:bg-blue-100"
                  >
                    <span className="min-w-0 truncate">{file.filename || `Bai tap ${index + 1}.pdf`}</span>
                    <FiDownload className="shrink-0" />
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </section>
        <canvas
          ref={inkCanvasRef}
          className={`print-ink-canvas ${isInkMode ? 'is-active' : ''} ${inkTool === 'eraser' ? 'is-eraser' : ''}`}
          onPointerDown={handleInkPointerDown}
          onPointerMove={handleInkPointerMove}
          onPointerUp={handleInkPointerUp}
          onPointerCancel={handleInkPointerUp}
          onContextMenu={(event) => isInkMode && event.preventDefault()}
          aria-hidden="true"
        />
      </main>
      <style>{`
        .print-ink-toolbar {
          position: sticky;
          top: 12px;
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          width: fit-content;
          max-width: min(100%, 48rem);
          margin: 0 auto 12px;
          padding: 8px;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
          backdrop-filter: blur(8px);
        }
        .print-ink-toolbar.is-printing {
          display: none;
        }
        .print-ink-button,
        .print-ink-print-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 38px;
          border-radius: 8px;
          color: #334155;
          font-weight: 600;
          transition: background 150ms ease, color 150ms ease;
        }
        .print-ink-button {
          width: 38px;
        }
        .print-ink-button:hover,
        .print-ink-print-button:hover {
          background: #e0f2fe;
          color: #1d4ed8;
        }
        .print-ink-button.is-active {
          background: #fee2e2;
          color: #dc2626;
        }
        .print-ink-button.is-eraser {
          background: #e0f2fe;
          color: #0369a1;
        }
        .print-ink-print-button {
          padding: 0 12px;
          background: #2563eb;
          color: #ffffff;
        }
        .print-ink-print-button:hover {
          background: #1d4ed8;
          color: #ffffff;
        }
        .print-ink-colors {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0 4px;
        }
        .print-ink-color {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          box-shadow: 0 0 0 1px #cbd5e1;
        }
        .print-ink-color.is-active {
          box-shadow: 0 0 0 3px #93c5fd;
        }
        .print-page {
          position: relative;
        }
        .print-ink-canvas {
          position: absolute;
          inset: 0;
          z-index: 20;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .print-ink-canvas.is-active {
          cursor: crosshair;
          pointer-events: auto;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
        }
        .print-ink-canvas.is-eraser {
          cursor: cell;
        }
        .print-content h2 { font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .print-content h3 { font-size: 1.05rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .print-content p { margin: 0.4rem 0; }
        .print-question { break-inside: avoid; margin-bottom: 0.9rem; }
        .print-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.15rem 1.25rem; }
        .answer-content { break-inside: auto; }
        .answer-divider { border: 0; border-top: 1px solid #d1fae5; margin: 1rem 0; }
        .katex { font-size: 1.04em; }
        .katex-display { overflow-x: auto; overflow-y: hidden; }
        @media print {
          body { background: white; }
          .print-ink-canvas {
            display: block;
            pointer-events: none;
          }
          @page { margin: 16mm 14mm; }
        }
      `}</style>
    </div>
  );
}
