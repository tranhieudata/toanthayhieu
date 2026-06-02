const Lesson = require('../models/Lesson');
const Course = require('../models/Course');
const ClassEnrollment = require('../models/ClassEnrollment');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const ExamResult = require('../models/ExamResult');
const { hasAccessToCourse } = require('../utils/accessControl');

function isLessonOpenForClass(lessonSetting, now = new Date()) {
  if (!lessonSetting) return false;
  if (lessonSetting.isVisible) return true;
  if (!lessonSetting.autoOpenAt) return false;
  return new Date(lessonSetting.autoOpenAt) <= now;
}

function isPassingExamResult(result) {
  if (!result || result.status !== 'graded') return false;
  if (result.maxScore > 0) {
    return (result.totalScore / result.maxScore) * 10 > 5;
  }
  return result.totalScore > 5;
}

async function getStudentLessonAccess(studentId, courseId) {
  const enrollments = await ClassEnrollment.find({ student: studentId, status: 'approved' }).select('class');
  const classIds = enrollments.map((enrollment) => enrollment.class);
  const studentClass = await Class.findOne({ _id: { $in: classIds }, courses: courseId })
    .select('lessonVisibility');

  if (!studentClass) {
    return { error: { status: 403, message: 'Bạn chưa được duyệt vào lớp học chứa khóa học này' } };
  }

  const lessons = await Lesson.find({ course: courseId, isPublished: true })
    .select('_id order')
    .sort({ order: 1, createdAt: 1 });

  const lessonIds = lessons.map((lesson) => lesson._id);
  const exams = await Exam.find({
    lesson: { $in: lessonIds },
    'classSchedules.class': studentClass._id,
  }).select('_id lesson');

  const examIds = exams.map((exam) => exam._id);
  const results = examIds.length > 0
    ? await ExamResult.find({
        exam: { $in: examIds },
        student: studentId,
      }).select('exam totalScore maxScore status')
    : [];

  const resultMap = new Map(results.map((result) => [result.exam.toString(), result]));
  const examMapByLesson = exams.reduce((map, exam) => {
    const lessonId = exam.lesson.toString();
    if (!map.has(lessonId)) map.set(lessonId, []);
    map.get(lessonId).push(exam._id.toString());
    return map;
  }, new Map());

  const settingsMap = new Map(
    (studentClass.lessonVisibility || []).map((setting) => [setting.lesson.toString(), setting])
  );

  const lessonAccessMap = {};
  const accessibleLessonIds = [];
  let progressionUnlocked = true;

  lessons.forEach((lesson) => {
    const lessonId = lesson._id.toString();
    const lessonSetting = settingsMap.get(lessonId);
    const openedForClass = isLessonOpenForClass(lessonSetting);
    const accessible = progressionUnlocked && openedForClass;

    lessonAccessMap[lessonId] = {
      accessible,
      reason: progressionUnlocked ? 'visibility' : 'exam',
    };

    if (accessible) accessibleLessonIds.push(lessonId);

    const lessonExamIds = examMapByLesson.get(lessonId) || [];
    if (lessonExamIds.length > 0) {
      progressionUnlocked = progressionUnlocked && lessonExamIds.some((examId) =>
        isPassingExamResult(resultMap.get(examId))
      );
    }
  });

  return { studentClass, lessonAccessMap, accessibleLessonIds };
}

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

    const access = await getStudentLessonAccess(req.user._id, req.query.course);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const lessons = await Lesson.find({
      course: req.query.course,
      isPublished: true,
      _id: { $in: access.accessibleLessonIds },
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
      const access = await getStudentLessonAccess(req.user._id, courseId);
      if (access.error) {
        return res.status(access.error.status).json({ message: access.error.message });
      }

      const lessonAccess = access.lessonAccessMap[req.params.id];
      if (!lessonAccess?.accessible) {
        if (lessonAccess?.reason === 'exam') {
          return res.status(403).json({ message: 'Bạn cần hoàn thành bài kiểm tra của bài trước với điểm trên 5 để mở bài này' });
        }
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
    const { course, title, content, videoUrl, order, duration, isPublished, pdfAttachments, criteria } = req.body;
    
    if (!course) {
      return res.status(400).json({ message: 'Khóa học là bắt buộc' });
    }
    
    if (!title) {
      return res.status(400).json({ message: 'Tiêu đề là bắt buộc' });
    }

    const updateFields = { course, title, content, videoUrl, order, duration, isPublished, pdfAttachments };
    if (criteria !== undefined) updateFields.criteria = criteria;

    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      updateFields,
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

// POST /api/lessons/:id/criteria  (thêm tiêu chí đánh giá)
const addCriteria = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Tên tiêu chí là bắt buộc' });
    lesson.criteria.push({ name: name.trim(), description: description || '' });
    await lesson.save();
    res.json(lesson.criteria);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/lessons/:id/criteria/:criteriaId  (cập nhật tiêu chí)
const updateCriteria = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });
    const crit = lesson.criteria.id(req.params.criteriaId);
    if (!crit) return res.status(404).json({ message: 'Không tìm thấy tiêu chí' });
    const { name, description } = req.body;
    if (name?.trim()) crit.name = name.trim();
    if (description !== undefined) crit.description = description;
    await lesson.save();
    res.json(lesson.criteria);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/lessons/:id/criteria/:criteriaId
const deleteCriteria = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });
    lesson.criteria = lesson.criteria.filter((c) => c._id.toString() !== req.params.criteriaId);
    await lesson.save();
    res.json(lesson.criteria);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLessons, getLessonById, createLesson, updateLesson, deleteLesson, toggleLessonStatus, addCriteria, updateCriteria, deleteCriteria };
