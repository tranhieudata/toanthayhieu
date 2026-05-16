import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { FiClipboard, FiCheckCircle, FiClock, FiAward } from 'react-icons/fi';

const STATUS_CONFIG = {
  graded: { label: 'Đã chấm', color: 'bg-green-100 text-green-700', icon: <FiCheckCircle className="inline mr-1" /> },
  pending: { label: 'Chờ chấm', color: 'bg-yellow-100 text-yellow-700', icon: <FiClock className="inline mr-1" /> },
};

function ScoreBadge({ result }) {
  if (!result) return <span className="text-xs text-gray-400">Chưa nộp</span>;
  if (result.status === 'graded') {
    const pct = result.maxScore > 0 ? result.totalScore / result.maxScore : 0;
    const color = pct >= 0.8 ? 'text-green-600' : pct >= 0.5 ? 'text-yellow-600' : 'text-red-500';
    return (
      <span className={`font-bold text-lg ${color}`}>
        {result.totalScore}<span className="text-sm text-gray-400">/{result.maxScore}</span>
      </span>
    );
  }
  return <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">Chờ chấm</span>;
}

export default function StudentExamsPage() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/exams/student')
      .then(r => setExams(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Nhóm theo lớp
  const grouped = exams.reduce((acc, exam) => {
    const className = exam.class?.name || 'Không có lớp';
    if (!acc[className]) acc[className] = [];
    acc[className].push(exam);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <FiClipboard className="text-blue-600 text-2xl" />
          <h1 className="text-2xl font-bold text-gray-900">Đề kiểm tra của tôi</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : exams.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FiClipboard className="mx-auto text-4xl mb-3 opacity-40" />
            <p>Chưa có đề kiểm tra nào</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([className, classExams]) => (
              <div key={className}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="w-4 h-px bg-gray-300 inline-block" />
                  {className}
                  <span className="w-4 h-px bg-gray-300 inline-block" />
                </h2>
                <div className="space-y-3">
                  {classExams.map(exam => {
                    const result = exam.myResult;
                    const statusCfg = result ? STATUS_CONFIG[result.status] || STATUS_CONFIG.pending : null;
                    return (
                      <Link
                        key={exam._id}
                        to={`/exams/${exam._id}`}
                        className="block bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{exam.title}</h3>
                            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                              {exam.lesson && <span>📚 {exam.lesson.title}</span>}
                              <span>📝 {exam.totalQuestions} câu</span>
                              <span>💯 {exam.levels?.reduce((s, l) => s + (l.totalPoints || 0), 0)} điểm</span>
                            </div>
                            {exam.note && <p className="text-xs text-gray-400 mt-1 italic">{exam.note}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <ScoreBadge result={result} />
                            {statusCfg && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                                {statusCfg.icon}{statusCfg.label}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Progress bar nếu đã chấm */}
                        {result?.status === 'graded' && result.maxScore > 0 && (
                          <div className="mt-3">
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  result.totalScore / result.maxScore >= 0.8 ? 'bg-green-500' :
                                  result.totalScore / result.maxScore >= 0.5 ? 'bg-yellow-500' : 'bg-red-400'
                                }`}
                                style={{ width: `${Math.min(100, (result.totalScore / result.maxScore) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
