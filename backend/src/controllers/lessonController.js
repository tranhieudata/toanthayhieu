const Lesson = require('../models/Lesson');
const Course = require('../models/Course');
const { hasAccessToCourse } = require('../utils/accessControl');

// GET /api/lessons?course=:courseId  (học sinh - bắt buộc có course)
// GET /api/lessons                    (admin - xem tất cả)
const getLessons = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    // Admin có thể lấy tất cả hoặc lọc theo course
    if (isAdmin) {
      const filter = {};
      if (req.query.course) filter.course = req.query.course;
      const lessons = await Lesson.find(filter)
        .populate('course', 'title')
        .sort({ course: 1, order: 1 });
      return res.json(lessons);
    }

    // Học sinh bắt buộc phải có courseId
    if (!req.query.course) return res.status(400).json({ message: 'Vui lòng cung cấp courseId' });

    const access = await hasAccessToCourse(req.user._id, req.query.course);
    if (!access) {
      return res.status(403).json({ message: 'Bạn chưa được duyệt vào lớp học chứa khóa học này' });
    }

    const lessons = await Lesson.find({ course: req.query.course, isPublished: true }).sort({ order: 1 });
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/lessons/:id
const getLessonById = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id).populate('course', 'title');
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      const courseId = lesson.course?._id || lesson.course;
      const access = await hasAccessToCourse(req.user._id, courseId);
      if (!access) {
        return res.status(403).json({ message: 'Bạn chưa được duyệt vào lớp học chứa khóa học này' });
      }
    }

    res.json(lesson);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/lessons (admin)
const createLesson = async (req, res) => {
  try {
    const lesson = await Lesson.create(req.body);
    await Course.findByIdAndUpdate(lesson.course, { $inc: { totalLessons: 1 } });
    res.status(201).json(lesson);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/lessons/:id (admin)
const updateLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/lessons/:id (admin)
const deleteLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndDelete(req.params.id);
    if (lesson) await Course.findByIdAndUpdate(lesson.course, { $inc: { totalLessons: -1 } });
    res.json({ message: 'Xóa bài học thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLessons, getLessonById, createLesson, updateLesson, deleteLesson };
