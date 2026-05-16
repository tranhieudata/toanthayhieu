import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { getUploadUrl } from '../../api/axios';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiSave, FiUser, FiCheckCircle, FiClock, FiInfo } from 'react-icons/fi';

const LEVEL_COLORS = {
  'Nhận biết': { bg: 'bg-green-50', badge: 'bg-green-100 text-green-700', border: 'border-green-200' },
  'Thông hiểu': { bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700', border: 'border-blue-200' },
  'Vận dụng cao': { bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200' },
};

function getLevelForQuestion(q, levels) {
  return levels.find(l => q >= l.fromQuestion && q <= l.toQuestion);
}

function ScoreInput({ value, onChange, maxScore }) {
  return (
    <input
      type="number"
      min="0"
      step="0.25"
      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24 text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
      value={value}
      onChange={e => onChange(Math.min(Number(e.target.value) || 0, maxScore))}
    />
  );
}

export default function AdminExamGrade() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [exam, setExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [results, setResults] = useState({});            // { studentId: ExamResult }
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [scores, setScores] = useState({});              // { questionOrder: score }
  const [teacherNote, setTeacherNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load exam + students + existing results
  useEffect(() => {
    const loadAll = async () => {
      try {
        const { data: examData } = await api.get(`/exams/${id}`);
        setExam(examData);

        // Load students from class
        if (examData.class?._id) {
          const { data: cls } = await api.get(`/classes/${examData.class._id}`);
          setStudents(cls.students || []);
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

  const maxScorePerQuestion = useCallback((qOrder) => {
    if (!exam) return 0;
    const level = getLevelForQuestion(qOrder, exam.levels);
    if (!level) return 0;
    const count = level.toQuestion - level.fromQuestion + 1;
    return count > 0 ? level.totalPoints / count : 0;
  }, [exam]);

  const selectStudent = (student) => {
    setSelectedStudent(student);
    const existing = results[student._id];
    if (existing) {
      const scoreMap = {};
      existing.scores.forEach(s => { scoreMap[s.questionOrder] = s.score; });
      setScores(scoreMap);
      setTeacherNote(existing.teacherNote || '');
    } else {
      // Initialize all questions to 0
      const scoreMap = {};
      for (let q = 1; q <= (exam?.totalQuestions || 0); q++) {
        scoreMap[q] = 0;
      }
      setScores(scoreMap);
      setTeacherNote('');
    }
  };

  const totalScore = Object.values(scores).reduce((s, v) => s + v, 0);
  const maxScore = exam?.levels.reduce((s, l) => s + l.totalPoints, 0) || 0;

  const handleSave = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const scoreArr = Object.entries(scores).map(([q, s]) => ({ questionOrder: Number(q), score: s }));
      const { data: result } = await api.post(`/exams/${id}/results`, {
        studentId: selectedStudent._id,
        scores: scoreArr,
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  if (!exam) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/exams')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm">
          <FiArrowLeft size={16} /> Quay lại
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{exam.title}</h1>
          <p className="text-sm text-gray-500">
            {exam.lesson?.title && `Bài: ${exam.lesson.title} · `}
            {exam.class?.name && `Lớp: ${exam.class.name} · `}
            {exam.totalQuestions} câu · {maxScore} điểm
          </p>
        </div>
      </div>

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
                {/* Ảnh bài làm học sinh */}
                {results[selectedStudent._id]?.submissionImages?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2 font-medium">
                      Bài làm học sinh ({results[selectedStudent._id].submissionImages.length} ảnh):
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {results[selectedStudent._id].submissionImages.map((img, i) => (
                        <a key={i} href={getUploadUrl(img.url)} target="_blank" rel="noopener noreferrer">
                          <img
                            src={getUploadUrl(img.url)}
                            alt={`Bài làm ${i + 1}`}
                            className="w-full h-28 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Per-question scoring grouped by level */}
              {exam.levels.map((level) => {
                const colors = LEVEL_COLORS[level.name] || { bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-700', border: 'border-gray-200' };
                const levelQuestions = [];
                for (let q = level.fromQuestion; q <= level.toQuestion; q++) levelQuestions.push(q);
                const levelTotal = levelQuestions.reduce((s, q) => s + (scores[q] || 0), 0);

                return (
                  <div key={level.name} className={`bg-white rounded-xl shadow-sm p-4 border ${colors.border}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>{level.name}</span>
                        <span className="text-xs text-gray-500">Câu {level.fromQuestion} → {level.toQuestion}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">
                        {levelTotal.toFixed(2)} / {level.totalPoints} điểm
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {levelQuestions.map(q => {
                        const maxQ = maxScorePerQuestion(q);
                        return (
                          <div key={q} className={`${colors.bg} rounded-lg p-2.5 text-center`}>
                            <div className="text-xs text-gray-500 mb-1.5">Câu {q}</div>
                            <ScoreInput
                              value={scores[q] || 0}
                              onChange={v => setScores(prev => ({ ...prev, [q]: v }))}
                              maxScore={maxQ}
                            />
                            <div className="text-xs text-gray-400 mt-1">/ {maxQ.toFixed(2)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Teacher note */}
              <div className="bg-white rounded-xl shadow-sm p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nhận xét của giáo viên
                </label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Nhập nhận xét riêng cho học sinh (tuỳ chọn, sẽ thay thế nhận xét tự động)..."
                  value={teacherNote}
                  onChange={e => setTeacherNote(e.target.value)}
                />
              </div>

              {/* Auto-feedback preview (if already graded) */}
              {results[selectedStudent._id]?.autoFeedback && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2 text-yellow-800 font-medium text-sm">
                    <FiInfo /> Nhận xét tự động (lần chấm trước)
                  </div>
                  <pre className="text-sm text-yellow-700 whitespace-pre-wrap font-sans">{results[selectedStudent._id].autoFeedback}</pre>
                </div>
              )}

              {/* Save */}
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-60 text-sm"
                >
                  <FiSave size={15} />
                  {saving ? 'Đang lưu...' : results[selectedStudent._id] ? 'Cập nhật điểm' : 'Lưu điểm'}
                </button>
              </div>

              {/* Show auto feedback after save */}
              {results[selectedStudent._id]?.status === 'graded' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2 text-blue-800 font-semibold text-sm">
                    <FiCheckCircle /> Nhận xét tự động hệ thống
                  </div>
                  <pre className="text-sm text-blue-700 whitespace-pre-wrap font-sans">{results[selectedStudent._id].autoFeedback}</pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
