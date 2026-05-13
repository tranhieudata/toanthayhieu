import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { FiArrowLeft, FiBook, FiLayers, FiChevronDown, FiChevronUp } from 'react-icons/fi';

export default function ClassDetailPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [expandedLesson, setExpandedLesson] = useState(null);
  const [lessons, setLessons] = useState({});
  const [exercises, setExercises] = useState({});

  useEffect(() => {
    const loadClassDetail = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/classes/${classId}`);
        setClassData(res.data);
      } catch (err) {
        toast.error('Không tải được thông tin lớp học');
        navigate('/classes');
      } finally {
        setLoading(false);
      }
    };
    loadClassDetail();
  }, [classId, navigate]);

  // Load lessons khi expand course
  const handleExpandCourse = async (courseId) => {
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
      return;
    }
    setExpandedCourse(courseId);

    if (!lessons[courseId]) {
      try {
        const res = await api.get(`/lessons?course=${courseId}`);
        setLessons(prev => ({ ...prev, [courseId]: res.data }));
      } catch {
        toast.error('Không tải được danh sách bài học');
      }
    }
  };

  // Load exercises khi expand lesson
  const handleExpandLesson = async (lessonId) => {
    if (expandedLesson === lessonId) {
      setExpandedLesson(null);
      return;
    }
    setExpandedLesson(lessonId);

    if (!exercises[lessonId]) {
      try {
        const res = await api.get(`/exercises?lesson=${lessonId}`);
        setExercises(prev => ({ ...prev, [lessonId]: res.data }));
      } catch {
        toast.error('Không tải được danh sách bài tập');
      }
    }
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

  if (!classData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="text-center py-20 text-gray-500">Không tìm thấy lớp học</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <button
          onClick={() => navigate('/classes')}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
        >
          <FiArrowLeft size={18} /> Quay lại
        </button>

        <div className="card p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{classData.name}</h1>
          {classData.description && (
            <p className="text-gray-600 mb-4">{classData.description}</p>
          )}
          <div className="flex flex-wrap gap-6 text-sm text-gray-600">
            <span>👥 {classData.studentCount || 0} học sinh</span>
            <span>📚 {classData.courses?.length || 0} khóa học</span>
            {classData.maxStudents && <span>📋 Tối đa {classData.maxStudents} học sinh</span>}
          </div>
        </div>

        {/* Courses list */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FiBook size={24} /> Khóa học trong lớp ({classData.courses?.length || 0})
          </h2>

          {classData.courses && classData.courses.length > 0 ? (
            <div className="space-y-3">
              {classData.courses.map(course => (
                <div key={course._id} className="card">
                  {/* Course header */}
                  <button
                    onClick={() => handleExpandCourse(course._id)}
                    className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-left flex-1">
                      <h3 className="font-bold text-gray-900">{course.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{course.description}</p>
                      <div className="flex gap-3 mt-2 text-xs text-gray-500">
                        <span>📁 {course.category}</span>
                        <span>📊 {course.level}</span>
                        {course.duration && <span>⏱️ {course.duration}</span>}
                      </div>
                    </div>
                    {expandedCourse === course._id ? (
                      <FiChevronUp size={20} className="text-gray-600" />
                    ) : (
                      <FiChevronDown size={20} className="text-gray-600" />
                    )}
                  </button>

                  {/* Lessons list */}
                  {expandedCourse === course._id && (
                    <div className="border-t border-gray-200 p-4 space-y-2 bg-gray-50">
                      {lessons[course._id] && lessons[course._id].length > 0 ? (
                        lessons[course._id].map(lesson => (
                          <div key={lesson._id}>
                            {/* Lesson header */}
                            <div className="p-3 flex justify-between items-center hover:bg-blue-50 transition-colors rounded-lg border border-gray-200 cursor-pointer" onClick={() => navigate(`/lesson/${lesson._id}?class=${classId}`)}>
                              <div className="flex-1 text-left">
                                <p className="font-semibold text-gray-900 text-blue-600 hover:underline">{lesson.title}</p>
                                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                                  <span>⏱️ {lesson.duration || '—'} phút</span>
                                  <span>{lesson.isPublished ? '✅ Đã đăng' : '🔒 Nháp'}</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExpandLesson(lesson._id);
                                }}
                                className="p-2"
                              >
                                {expandedLesson === lesson._id ? (
                                  <FiChevronUp size={18} className="text-gray-600" />
                                ) : (
                                  <FiChevronDown size={18} className="text-gray-600" />
                                )}
                              </button>
                            </div>

                            {/* Exercises list */}
                            {expandedLesson === lesson._id && (
                              <div className="mt-2 ml-4 space-y-2">
                                {exercises[lesson._id] && exercises[lesson._id].length > 0 ? (
                                  exercises[lesson._id].map(exercise => (
                                    <div
                                      key={exercise._id}
                                      className="p-3 bg-white rounded-lg border border-gray-100 hover:border-blue-300 hover:shadow-sm transition-all"
                                    >
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                          <p className="font-semibold text-gray-900 flex items-center gap-2">
                                            <FiLayers size={14} /> {exercise.title}
                                          </p>
                                          <p className="text-xs text-gray-500 mt-1">
                                            {exercise.questions?.length || 0} câu • {exercise.timeLimit} phút • Đạt {exercise.passingScore}%
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="p-3 text-center text-gray-400 text-sm">
                                    Chưa có bài tập nào
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-center text-gray-400">Chưa có bài học nào</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-12 text-center text-gray-500">
              <FiBook size={48} className="mx-auto mb-4 text-gray-300" />
              <p>Lớp học này chưa có khóa học nào</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

