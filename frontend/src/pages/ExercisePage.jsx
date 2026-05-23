import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiCheckCircle, FiXCircle } from 'react-icons/fi';

export default function ExercisePage({ exerciseId = null, embedded = false }) {
  const { id: routeExerciseId } = useParams();
  const id = exerciseId || routeExerciseId;
  const [exercise, setExercise] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) {
      setExercise(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setResult(null);
    setAnswers({});
    api.get(`/exercises/${id}`).then((res) => setExercise(res.data)).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    if (Object.keys(answers).length < exercise.questions.length) {
      toast.error('Vui lòng trả lời tất cả câu hỏi'); return;
    }
    setSubmitting(true);
    try {
      const answersArr = exercise.questions.map((_, i) => Number(answers[i]));
      const res = await api.post(`/exercises/${id}/submit`, { answers: answersArr });
      setResult(res.data);
    } catch (err) {
      toast.error('Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={`${embedded ? 'py-6' : 'min-h-screen'} flex items-center justify-center`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className={`${embedded ? 'py-2' : 'min-h-screen flex items-center justify-center'} text-gray-500`}>
        Không tìm thấy bài tập
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'min-h-screen'}>
      {!embedded && <Navbar />}
      <div className={embedded ? '' : 'max-w-3xl mx-auto px-4 py-8'}>
        {!embedded && (
          <Link to={`/courses/${exercise.course?._id}`} className="flex items-center gap-2 text-blue-600 hover:underline mb-6 text-sm">
            <FiArrowLeft /> Quay lại khóa học
          </Link>
        )}

        <div className={embedded ? '' : 'card p-6 md:p-8'}>
          <h1 className={`${embedded ? 'text-xl' : 'text-2xl'} font-bold text-gray-900 mb-2`}>{exercise.title}</h1>
          <p className="text-gray-500 mb-6">{exercise.description} · Thời gian: {exercise.timeLimit} phút · Điểm đạt: {exercise.passingScore}%</p>

          {result ? (
            <div className={`text-center py-10 ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
              {result.passed ? <FiCheckCircle className="text-5xl mx-auto mb-3" /> : <FiXCircle className="text-5xl mx-auto mb-3" />}
              <div className="text-4xl font-bold mb-2">{result.score}%</div>
              <div className="text-lg font-medium mb-1">{result.passed ? 'Chúc mừng bạn đã vượt qua!' : 'Chưa đạt. Hãy thử lại!'}</div>
              <div className="text-sm text-gray-500">{result.correct}/{result.total} câu đúng</div>
              <button onClick={() => { setResult(null); setAnswers({}); }} className="btn-secondary mt-6">Làm lại</button>
            </div>
          ) : (
            <div className="space-y-6">
              {exercise.questions.map((q, qi) => (
                <div key={qi} className="border border-gray-200 rounded-lg p-4">
                  <p className="font-medium text-gray-900 mb-3"><span className="text-blue-600 font-bold">Câu {qi + 1}:</span> {q.question}</p>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${answers[qi] === oi ? 'bg-blue-50 border border-blue-300' : 'border border-gray-100 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name={`q_${qi}`}
                          checked={answers[qi] === oi}
                          onChange={() => setAnswers({ ...answers, [qi]: oi })}
                          className="text-blue-600"
                        />
                        <span className="text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={handleSubmit} disabled={submitting} className="btn-primary w-full">
                {submitting ? 'Đang nộp...' : 'Nộp bài'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
