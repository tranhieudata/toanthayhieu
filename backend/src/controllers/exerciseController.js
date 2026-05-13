const Exercise = require('../models/Exercise');
const Lesson = require('../models/Lesson');
const { hasAccessToCourse } = require('../utils/accessControl');

// GET /api/exercises?lesson=:lessonId  (học sinh)
// GET /api/exercises                    (admin — xem tất cả)
const getExercises = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    if (req.query.lesson) {
      const lesson = await Lesson.findById(req.query.lesson);
      if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });

      if (!isAdmin) {
        const access = await hasAccessToCourse(req.user._id, lesson.course);
        if (!access) return res.status(403).json({ message: 'Bạn chưa được duyệt vào lớp học chứa khóa học này' });
      }

      const filter = { lesson: req.query.lesson };
      if (!isAdmin) filter.isPublished = true;
      const exercises = await Exercise.find(filter).sort({ createdAt: 1 });
      return res.json(exercises);
    }

    // Không có lesson param → chỉ admin
    if (!isAdmin) return res.status(400).json({ message: 'Vui lòng cung cấp lessonId' });

    const exercises = await Exercise.find()
      .populate('lesson', 'title')
      .populate('course', 'title')
      .sort({ createdAt: -1 });
    res.json(exercises);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exercises/:id
const getExerciseById = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id)
      .populate({ path: 'lesson', select: 'title course' });
    if (!exercise) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      const courseId = exercise.course || exercise.lesson?.course;
      const access = await hasAccessToCourse(req.user._id, courseId);
      if (!access) return res.status(403).json({ message: 'Bạn chưa được duyệt vào lớp học chứa khóa học này' });
    }

    res.json(exercise);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exercises (admin) — bài tập thuộc về một bài học
const createExercise = async (req, res) => {
  try {
    const { lesson: lessonId } = req.body;
    if (!lessonId) return res.status(400).json({ message: 'Vui lòng chọn bài học cho bài tập' });

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });

    // Tự động điền course từ lesson
    const exercise = await Exercise.create({ ...req.body, course: lesson.course });
    res.status(201).json(exercise);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/exercises/:id (admin)
const updateExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!exercise) return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    res.json(exercise);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/exercises/:id (admin)
const deleteExercise = async (req, res) => {
  try {
    await Exercise.findByIdAndDelete(req.params.id);
    res.json({ message: 'Xóa bài tập thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exercises/:id/submit
const submitExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    if (req.user.role !== 'admin') {
      const access = await hasAccessToCourse(req.user._id, exercise.course);
      if (!access) return res.status(403).json({ message: 'Bạn chưa được duyệt vào lớp học chứa khóa học này' });
    }

    const { answers } = req.body;
    let correct = 0;
    exercise.questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) correct++;
    });
    const score = Math.round((correct / exercise.questions.length) * 100);
    const passed = score >= exercise.passingScore;
    res.json({ score, passed, correct, total: exercise.questions.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getExercises, getExerciseById, createExercise, updateExercise, deleteExercise, submitExercise };
