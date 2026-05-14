const Lesson = require('../models/Lesson');
const Course = require('../models/Course');
const ClassEnrollment = require('../models/ClassEnrollment');
const Class = require('../models/Class');
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

    // Tìm lớp học của học sinh cho khóa học này
    const enrollments = await ClassEnrollment.find({ student: req.user._id, status: 'approved' }).select('class');
    const classIds = enrollments.map(e => e.class);
    const studentClass = await Class.findOne({ _id: { $in: classIds }, courses: req.query.course }).select('lessonVisibility');

    if (!studentClass) {
      return res.status(403).json({ message: 'Bạn chưa được duyệt vào lớp học chứa khóa học này' });
    }

    const visibleIds = studentClass.lessonVisibility
      .filter(lv => lv.isVisible)
      .map(lv => lv.lesson);

    const lessons = await Lesson.find({
      course: req.query.course,
      isPublished: true,
      _id: { $in: visibleIds },
    }).sort({ order: 1 });
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
      if (!lesson.isPublished) {
        return res.status(403).json({ message: 'Bài học này chưa được mở' });
      }
      const courseId = lesson.course?._id || lesson.course;
      const enrollments = await ClassEnrollment.find({ student: req.user._id, status: 'approved' }).select('class');
      const classIds = enrollments.map(e => e.class);
      const studentClass = await Class.findOne({ _id: { $in: classIds }, courses: courseId }).select('lessonVisibility');
      if (!studentClass) {
        return res.status(403).json({ message: 'Bạn chưa được duyệt vào lớp học chứa khóa học này' });
      }
      const visEntry = studentClass.lessonVisibility.find(lv => lv.lesson.toString() === req.params.id);
      if (!visEntry || !visEntry.isVisible) {
        return res.status(403).json({ message: 'Bài học này chưa được mở cho lớp của bạn' });
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
    const { course, title, content, videoUrl, order, duration, isPublished, pdfAttachments } = req.body;
    
    if (!course) {
      return res.status(400).json({ message: 'Khóa học là bắt buộc' });
    }
    
    if (!title) {
      return res.status(400).json({ message: 'Tiêu đề là bắt buộc' });
    }

    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      { course, title, content, videoUrl, order, duration, isPublished, pdfAttachments },
      { new: true, runValidators: true }
    );
    
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

// PATCH /api/lessons/:id/toggle (admin) - bật/tắt hiển thị bài học
const toggleLessonStatus = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });
    lesson.isPublished = !lesson.isPublished;
    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLessons, getLessonById, createLesson, updateLesson, deleteLesson, toggleLessonStatus };
