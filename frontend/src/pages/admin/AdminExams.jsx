import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getUploadUrl } from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiBook, FiArchive, FiCalendar, FiLayers, FiClock, FiEye, FiDownload, FiPrinter, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import AdminExamComposer from './AdminExamComposer';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function getExamTimeStatus(exam) {
  const now = new Date();
  if (exam.startDate && new Date(exam.startDate) > now) return 'upcoming';
  if (exam.endDate && new Date(exam.endDate) < now) return 'ended';
  if (exam.startDate || exam.endDate) return 'active';
  return null; // không giới hạn
}

const TIME_STATUS = {
  upcoming: { label: 'Chưa mở', cls: 'bg-yellow-100 text-yellow-700' },
  active:   { label: 'Đang mở', cls: 'bg-green-100 text-green-700' },
  ended:    { label: 'Đã đóng', cls: 'bg-red-100 text-red-600' },
};

const EXAMS_PER_PAGE = 36;

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function examPackageToPlainText(paper) {
  if (!paper) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => {
    const options = ['A', 'B', 'C', 'D'].map(key => `${key}. ${q.options?.[key] || ''}`).join('\n');
    return `Câu ${q.number || index + 1}. ${q.question || ''}\n${options}`;
  });
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}. ${q.question || ''}`);
  return [
    paper.title || 'ĐỀ KIỂM TRA',
    paper.meta?.schoolName || '',
    paper.meta ? `Năm học: ${paper.meta.schoolYear || ''} | Môn Toán - Lớp ${paper.meta.grade || ''} | Thời gian: ${paper.meta.duration || ''} phút` : '',
    mc.length ? `I. Phần trắc nghiệm\n${mc.join('\n\n')}` : '',
    essay.length ? `II. Phần tự luận\n${essay.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function hasMeaningfulHtml(html) {
  if (!html) return false;
  const text = String(html)
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return Boolean(text || /<(img|iframe|table|span|math)\b/i.test(html));
}

function renderStoredExamContentHtml(content) {
  if (typeof document === 'undefined') return content || '';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = content || '';

  wrapper.querySelectorAll('.ql-formula').forEach(span => {
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
          ['CODE', 'PRE'].includes(el.tagName)
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
  textNodes.forEach(textNode => {
    const rendered = renderMathHtml(textNode.textContent);
    if (rendered === escapeHtml(textNode.textContent)) return;
    const span = document.createElement('span');
    span.innerHTML = rendered;
    textNode.parentNode.replaceChild(span, textNode);
  });

  return wrapper.innerHTML;
}

function pointText(value) {
  return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function getPaperLevels(paper) {
  return (paper?.cognitiveLevels?.length ? paper.cognitiveLevels : [
    { key: 'NB', name: 'Nhận biết' },
    { key: 'TH', name: 'Thông hiểu' },
    { key: 'VD', name: 'Vận dụng' },
    { key: 'VDC', name: 'Vận dụng cao' },
  ]).map((level, index) => ({
    key: level.key || level.name || `L${index + 1}`,
    name: level.name || level.key || `Mức ${index + 1}`,
  }));
}

function renderMathText(text) {
  const source = String(text || '');
  const parts = source.split(/(\\\(.+?\\\)|\\\[.+?\\\]|\$\$.+?\$\$|\$.+?\$)/g);
  return parts.map((part, idx) => {
    const display = part.startsWith('$$') && part.endsWith('$$');
    const displayBracket = part.startsWith('\\[') && part.endsWith('\\]');
    const inlineParen = part.startsWith('\\(') && part.endsWith('\\)');
    const inlineDollar = part.startsWith('$') && part.endsWith('$') && !display;
    if (!display && !displayBracket && !inlineParen && !inlineDollar) return <span key={idx}>{part}</span>;
    const tex = (display || displayBracket || inlineParen) ? part.slice(2, -2) : part.slice(1, -1);
    try {
      return <span key={idx} dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { displayMode: display || displayBracket, throwOnError: false }) }} />;
    } catch {
      return <span key={idx}>{part}</span>;
    }
  });
}

function renderMathHtml(text) {
  const source = String(text || '');
  const parts = source.split(/(\\\(.+?\\\)|\\\[.+?\\\]|\$\$.+?\$\$|\$.+?\$)/g);
  return parts.map((part) => {
    const display = part.startsWith('$$') && part.endsWith('$$');
    const displayBracket = part.startsWith('\\[') && part.endsWith('\\]');
    const inlineParen = part.startsWith('\\(') && part.endsWith('\\)');
    const inlineDollar = part.startsWith('$') && part.endsWith('$') && !display;
    if (!display && !displayBracket && !inlineParen && !inlineDollar) return escapeHtml(part);
    const tex = (display || displayBracket || inlineParen) ? part.slice(2, -2) : part.slice(1, -1);
    try {
      return katex.renderToString(tex, { displayMode: display || displayBracket, throwOnError: false });
    } catch {
      return escapeHtml(part);
    }
  }).join('');
}

function buildPrintableExamHtml(paper) {
  const mc = paper.questions?.multipleChoice || [];
  const essay = paper.questions?.essay || [];
  return `
    <section class="header">
      <p><strong>${escapeHtml(paper.meta?.schoolName)}</strong></p>
      <h2>${escapeHtml(paper.meta?.examName || paper.title || 'ĐỀ KIỂM TRA')}</h2>
      <p>Năm học: ${escapeHtml(paper.meta?.schoolYear)} - Môn Toán - Lớp ${escapeHtml(paper.meta?.grade)}</p>
      ${paper.meta?.duration ? `<p>Thời gian: ${escapeHtml(paper.meta.duration)} phút</p>` : ''}
    </section>
    <section>
      <h3>I. Phần trắc nghiệm (${escapeHtml(paper.meta?.mcPoints)} điểm)</h3>
      ${mc.map(q => `
        <div class="question">
          <p><strong>Câu ${escapeHtml(q.number)}.</strong> ${renderMathHtml(q.question)}</p>
          <div class="options">
            ${['A', 'B', 'C', 'D'].map(opt => `<p>${opt}. ${renderMathHtml(q.options?.[opt])}</p>`).join('')}
          </div>
        </div>
      `).join('')}
    </section>
    <section>
      <h3>II. Phần tự luận (${escapeHtml(paper.meta?.essayPoints)} điểm)</h3>
      ${essay.map((q, index) => `
        <p class="question"><strong>Bài ${index + 1}. (${pointText(q.points)} điểm)</strong> ${renderMathHtml(q.question)}</p>
      `).join('')}
    </section>
  `;
}

function printExamContent(exam) {
  const html = hasMeaningfulHtml(exam.content)
    ? renderStoredExamContentHtml(exam.content)
    : exam.examPackage
      ? buildPrintableExamHtml(exam.examPackage)
      : '';
  if (!html) return toast.error('Đề này chưa có nội dung để in');
  const inheritedStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(node => node.outerHTML)
    .join('\n');
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentDocument.write(`
    <html>
      <head>
        <title>${exam.title}</title>
        ${inheritedStyles}
        <style>
          @page { margin: 18mm 14mm 14mm; }
          body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.45; color: #111; }
          .header { text-align: center; border-bottom: 1px solid #ddd; padding-bottom: 12px; margin-bottom: 18px; }
          .header h2 { font-size: 16pt; margin: 8px 0; }
          h3 { font-size: 13pt; margin: 16px 0 8px; }
          .question { margin: 0 0 10px; break-inside: avoid; }
          .options { display: grid; grid-template-columns: 1fr 1fr; column-gap: 32px; font-size: 12pt; }
          .options p { margin: 2px 0; }
          .katex { font-size: 1em; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  iframe.contentDocument.close();
  iframe.onload = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 500);
  };
}

function PaperPreview({ paper }) {
  const levels = getPaperLevels(paper);
  return (
    <div className="space-y-8 font-serif text-[15px] leading-7 text-gray-900">
      <section className="text-center border-b pb-4">
        <p className="font-bold">{paper.meta?.schoolName}</p>
        <h2 className="mt-2 text-xl font-bold">{paper.meta?.examName}</h2>
        <p>Năm học: {paper.meta?.schoolYear} - Môn Toán - Lớp {paper.meta?.grade}</p>
        {paper.meta?.duration && <p>Thời gian: {paper.meta.duration} phút</p>}
      </section>

      <section>
        <h3 className="font-bold mb-2">Ma trận đề kiểm tra</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-xs font-sans">
            <thead className="bg-blue-50">
              <tr>
                <th className="border px-2 py-1">Chủ đề</th>
                <th className="border px-2 py-1">Nội dung</th>
                {levels.map(level => <th key={`tn-${level.key}`} className="border px-2 py-1">TN {level.name}</th>)}
                {levels.map(level => <th key={`tl-${level.key}`} className="border px-2 py-1">TL {level.name}</th>)}
                <th className="border px-2 py-1">Tổng câu</th>
                <th className="border px-2 py-1">Tổng điểm</th>
                <th className="border px-2 py-1">%</th>
              </tr>
            </thead>
            <tbody>
              {(paper.matrix || []).map((row, index) => (
                <tr key={`${row.unit}-${index}`}>
                  <td className="border px-2 py-1">{row.topic}</td>
                  <td className="border px-2 py-1">{row.unit}</td>
                  {levels.map(level => <td key={`tn-${level.key}`} className="border px-2 py-1 text-center">{row.tn?.[level.key]?.count || 0} ({pointText(row.tn?.[level.key]?.points || 0)}đ)</td>)}
                  {levels.map(level => <td key={`tl-${level.key}`} className="border px-2 py-1 text-center">{row.tl?.[level.key]?.count || 0} ({pointText(row.tl?.[level.key]?.points || 0)}đ)</td>)}
                  <td className="border px-2 py-1 text-center">{row.totalQuestions || 0}</td>
                  <td className="border px-2 py-1 text-center">{pointText(row.totalPoints || 0)}đ</td>
                  <td className="border px-2 py-1 text-center">{pointText(row.ratio || 0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-bold mb-2">Bản đặc tả đề kiểm tra</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-xs font-sans">
            <thead className="bg-emerald-50">
              <tr>
                <th className="border px-2 py-1">Nội dung</th>
                <th className="border px-2 py-1">Yêu cầu cần đạt</th>
                {levels.map(level => <th key={`spec-tn-${level.key}`} className="border px-2 py-1">TN {level.name}</th>)}
                {levels.map(level => <th key={`spec-tl-${level.key}`} className="border px-2 py-1">TL {level.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {(paper.specification || []).map((row, index) => (
                <tr key={`${row.unit}-${index}`}>
                  <td className="border px-2 py-1">{row.unit}</td>
                  <td className="border px-2 py-1">{row.requirement}</td>
                  {levels.map(level => <td key={`spec-tn-${level.key}`} className="border px-2 py-1 text-center">{row.tn?.[level.key]?.count ?? row.tn?.[level.key] ?? 0}</td>)}
                  {levels.map(level => <td key={`spec-tl-${level.key}`} className="border px-2 py-1 text-center">{row.tl?.[level.key]?.count ?? row.tl?.[level.key] ?? 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-bold mb-2">I. Phần trắc nghiệm ({paper.meta?.mcPoints} điểm)</h3>
        <div className="space-y-3">
          {(paper.questions?.multipleChoice || []).map(q => (
            <div key={q.number}>
              <p><strong>Câu {q.number}.</strong> {renderMathText(q.question)}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 text-sm">
                {['A', 'B', 'C', 'D'].map(opt => <p key={opt}>{opt}. {renderMathText(q.options?.[opt])}</p>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-bold mb-2">II. Phần tự luận ({paper.meta?.essayPoints} điểm)</h3>
        <div className="space-y-3">
          {(paper.questions?.essay || []).map((q, index) => (
            <p key={q.number}><strong>Bài {index + 1}. ({pointText(q.points)} điểm)</strong> {renderMathText(q.question)}</p>
          ))}
        </div>
      </section>

      <section className="border-t pt-4">
        <h3 className="font-bold mb-2">Đáp án và hướng dẫn chấm</h3>
        <p><strong>Trắc nghiệm:</strong> {(paper.questions?.multipleChoice || []).map(q => `${q.number}${q.answer}`).join(' - ')}</p>
        <div className="mt-3 space-y-2">
          {(paper.questions?.essay || []).map((q, index) => (
            <div key={q.number}>
              <p className="font-bold">Bài {index + 1}. ({pointText(q.points)} điểm)</p>
              <p>{renderMathText(q.solution)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function AdminExams() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTemplate, setFilterTemplate] = useState('all'); // 'all' | 'true' | 'false'
  const [classes, setClasses] = useState([]);
  const [filterClass, setFilterClass] = useState('');
  const [lessons, setLessons] = useState([]);
  const [filterLesson, setFilterLesson] = useState('');
  const [classLevels, setClassLevels] = useState([]);
  const [filterLevel, setFilterLevel] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [levelColors, setLevelColors] = useState({});
  const [activeTab, setActiveTab] = useState('list');
  const [previewExam, setPreviewExam] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const loadExams = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterTemplate !== 'all') params.isTemplate = filterTemplate;
      if (filterClass) params.classId = filterClass;
      if (filterLesson) params.lessonId = filterLesson;
      if (filterLevel) params.levelId = filterLevel;
      const { data } = await api.get('/exams', { params });
      setExams(data);
      setCurrentPage(1);
    } catch {
      toast.error('Không tải được danh sách đề');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/classes').then(r => setClasses(r.data || [])).catch(() => {});
    api.get('/lessons').then(r => setLessons(r.data || [])).catch(() => {});
    api.get('/levels').then(r => setClassLevels(r.data || [])).catch(() => {});
    // Load difficulty levels colors
    api.get('/settings')
      .then(r => {
        const colorMap = {};
        (r.data.difficultyLevels || []).forEach(level => {
          colorMap[level.name] = `${level.bgColor} ${level.textColor}`;
        });
        setLevelColors(colorMap);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadExams(); }, [filterTemplate, filterClass, filterLesson, filterLevel]); // eslint-disable-line

  const handleDelete = async (examId) => {
    if (!window.confirm('Xóa đề kiểm tra này? Tất cả kết quả liên quan cũng sẽ bị xóa.')) return;
    setDeleting(examId);
    try {
      await api.delete(`/exams/${examId}`);
      toast.success('Đã xóa đề kiểm tra');
      loadExams();
    } catch {
      toast.error('Lỗi xóa đề');
    } finally {
      setDeleting(null);
    }
  };

  const totalPoints = (exam) => exam.levels?.reduce((s, l) => s + l.totalPoints, 0) ?? 0;
  const totalPages = Math.max(1, Math.ceil(exams.length / EXAMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const pageStart = (page - 1) * EXAMS_PER_PAGE;
  const pageEnd = Math.min(pageStart + EXAMS_PER_PAGE, exams.length);
  const paginatedExams = exams.slice(pageStart, pageEnd);

  const openPreview = async (examId) => {
    setPreviewLoading(true);
    try {
      const { data } = await api.get(`/exams/${examId}`);
      setPreviewExam(data);
    } catch {
      toast.error('Không tải được đề');
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadWord = async (exam) => {
    if (!exam?.examPackage) {
      return toast.error('Đề này chưa có gói Word từ tab soạn đề AI');
    }
    try {
      const res = await api.post('/exams/paper/export', { paper: exam.examPackage }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${exam.title || 'de-kiem-tra'}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Không tải được file Word');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FiBook className="text-blue-600" /> Quản lý đề kiểm tra
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('compose')}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm font-medium"
          >
            <FiPlus /> Soạn đề AI
          </button>
        <button
          onClick={() => navigate('/admin/exams/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <FiPlus /> Tạo đề mới
        </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-1 inline-flex gap-1">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Ngân hàng đề
        </button>
        <button
          onClick={() => setActiveTab('compose')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'compose' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Soạn đề
        </button>
      </div>

      {activeTab === 'compose' && (
        <AdminExamComposer
          onSaved={() => {
            setActiveTab('list');
            setFilterTemplate('true');
            loadExams();
          }}
        />
      )}

      {activeTab === 'list' && (
        <>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-4 items-center">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Loại đề</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterTemplate}
            onChange={e => setFilterTemplate(e.target.value)}
          >
            <option value="all">Tất cả</option>
            <option value="false">Đề thường</option>
            <option value="true">Ngân hàng đề</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Lớp Học</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
          >
            <option value="">Tất cả lớp</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Bài học</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterLesson}
            onChange={e => setFilterLesson(e.target.value)}
          >
            <option value="">Tất cả bài học</option>
            {lessons.map(l => <option key={l._id} value={l._id}>{l.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Cấp độ Lớp</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterLevel}
            onChange={e => setFilterLevel(e.target.value)}
          >
            <option value="">Tất cả cấp độ</option>
            {classLevels.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {exams.length ? `${pageStart + 1}-${pageEnd} / ${exams.length} đề` : '0 đề'}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <FiBook className="mx-auto text-4xl mb-3 text-gray-300" />
          <p>Chưa có đề kiểm tra nào</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            {paginatedExams.map((exam, index) => (
              <div
                key={exam._id}
                onClick={() => openPreview(exam._id)}
                className="group flex items-center gap-3 px-3 py-2 hover:bg-blue-50/60 cursor-pointer"
              >
                <span className="w-9 shrink-0 text-right text-xs text-gray-400">{pageStart + index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 group-hover:text-blue-700">
                  {exam.title || 'Đề kiểm tra'}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); openPreview(exam._id); }} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded" title="Xem đề"><FiEye size={15} /></button>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/exams/${exam._id}/edit`); }} className="p-1.5 text-blue-500 hover:bg-blue-100 rounded" title="Sửa"><FiEdit2 size={15} /></button>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/exams/${exam._id}/grade`); }} className="p-1.5 text-green-600 hover:bg-green-100 rounded" title="Chấm điểm"><FiLayers size={15} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(exam._id); }} disabled={deleting === exam._id} className="p-1.5 text-red-400 hover:bg-red-100 rounded disabled:opacity-40" title="Xóa"><FiTrash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!loading && exams.length > EXAMS_PER_PAGE && (
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm px-4 py-3">
          <span className="text-sm text-gray-500">Trang {page} / {totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              title="Trang trước"
            >
              <FiChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && p - arr[idx - 1] > 1 && <span className="px-2 text-gray-400">...</span>}
                  <button
                    onClick={() => setCurrentPage(p)}
                    className={`min-w-9 rounded-lg px-3 py-1.5 text-sm font-medium ${p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              title="Trang sau"
            >
              <FiChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {(previewExam || previewLoading) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-200">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">
                  {previewLoading ? 'Đang tải đề...' : previewExam?.title}
                </h2>
                {previewExam?.examPackage?.meta && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Lớp {previewExam.examPackage.meta.grade} · {previewExam.examPackage.meta.schoolYear} · {previewExam.examPackage.meta.duration} phút
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => previewExam && printExamContent(previewExam)}
                  disabled={!previewExam}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 text-sm"
                >
                  <FiPrinter size={15} /> In
                </button>
                <button
                  onClick={() => downloadWord(previewExam)}
                  disabled={!previewExam}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  <FiDownload size={15} /> Word
                </button>
                <button
                  onClick={() => { setPreviewExam(null); setPreviewLoading(false); }}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                  title="Đóng"
                >
                  <FiX size={18} />
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto">
              {previewLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                </div>
              ) : previewExam?.examPackage || hasMeaningfulHtml(previewExam?.content) || previewExam?.pdfAttachments?.length ? (
                <div className="space-y-5">
                  {previewExam?.pdfAttachments?.length > 0 && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-blue-900">File PDF đề bài</p>
                      <div className="space-y-2">
                        {previewExam.pdfAttachments.map((file, index) => (
                          <a
                            key={`${file.url}-${index}`}
                            href={getUploadUrl(file.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-700 hover:underline"
                          >
                            <FiDownload size={14} />
                            {file.filename || `De bai ${index + 1}.pdf`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {hasMeaningfulHtml(previewExam?.content) ? (
                    <div
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderStoredExamContentHtml(previewExam.content) }}
                    />
                  ) : previewExam?.examPackage ? (
                    <PaperPreview paper={previewExam.examPackage} />
                  ) : null}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">
                  Đề này chưa có nội dung để hiển thị.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
