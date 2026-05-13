import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { FiArrowLeft, FiBook, FiFileText, FiDownload } from 'react-icons/fi';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'quill/dist/quill.snow.css';

// Chuyển YouTube URL thường → URL embed
function toEmbedUrl(url) {
  if (!url) return '';
  // Đã là embed
  if (url.includes('youtube.com/embed/') || url.includes('player.vimeo.com')) return url;
  // youtube.com/watch?v=ID
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  // youtu.be/ID
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  return url;
}

// Render LaTeX: xử lý $$...$$ (display) và $...$ (inline) trong HTML
function renderLatex(html) {
  if (!html) return html;
  // $$...$$ → display mode (phải xử lý trước $...$)
  let result = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
    } catch { return match; }
  });
  // $...$ → inline mode (tránh khớp bên trong thẻ HTML)
  result = result.replace(/\$([^$\n<>]+?)\$/g, (match, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
    } catch { return match; }
  });
  return result;
}

export default function LessonPage() {
  const { id } = useParams();
  const [lesson, setLesson] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/lessons/${id}`).then((res) => {
      setLesson(res.data);
      return api.get(`/exercises?lesson=${id}`).catch(() => ({ data: [] }));
    }).then((exRes) => {
      setExercises(exRes.data || []);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  if (!lesson) return <div className="min-h-screen flex items-center justify-center text-gray-500">Không tìm thấy bài học</div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link to={`/courses/${lesson.course?._id}`} className="flex items-center gap-2 text-blue-600 hover:underline mb-6 text-sm">
          <FiArrowLeft /> Quay lại khóa học: {lesson.course?.title}
        </Link>

        <div className="card p-6 md:p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">{lesson.title}</h1>

          {lesson.videoUrl && (
            <div className="mb-6 rounded-xl overflow-hidden bg-black aspect-video">
              <iframe
                src={toEmbedUrl(lesson.videoUrl)}
                className="w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                title={lesson.title}
              ></iframe>
            </div>
          )}

          {lesson.content && (
            <div
              className="prose prose-blue max-w-none text-gray-700 leading-relaxed mb-6 lesson-content"
              dangerouslySetInnerHTML={{ __html: renderLatex(lesson.content) }}
            />
          )}

          {lesson.pdfAttachments?.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><FiDownload size={16} /> Tài liệu PDF</h3>
              <ul className="space-y-2">
                {lesson.pdfAttachments.map((att, i) => (
                  <li key={i}>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline text-sm bg-blue-50 px-3 py-2 rounded-lg transition-colors"
                    >
                      <FiDownload size={14} />
                      {att.filename || `Tài liệu ${i + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {exercises.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><FiFileText /> Bài tập của bài học này</h3>
              <div className="space-y-2">
                {exercises.map((ex) => (
                  <Link
                    key={ex._id}
                    to={`/exercises/${ex._id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                  >
                    <div>
                      <p className="font-medium text-sm text-gray-900 group-hover:text-blue-600">{ex.title}</p>
                      <p className="text-xs text-gray-400">{ex.questions?.length || 0} câu · {ex.timeLimit} phút · Đạt {ex.passingScore}%</p>
                    </div>
                    <span className="text-sm text-blue-600 font-medium">Làm bài →</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
