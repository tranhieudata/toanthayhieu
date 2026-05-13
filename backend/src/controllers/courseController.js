const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');

// GET /api/courses
const getCourses = async (req, res) => {
  try {
    const { category, level, search, page = 1, limit = 12 } = req.query;
    const filter = { isPublished: true };
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (search) filter.title = { $regex: search, $options: 'i' };

    const total = await Course.countDocuments(filter);
    const courses = await Course.find(filter)
      .populate('instructor', 'name avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ courses, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/courses/:id
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('instructor', 'name avatar');
    if (!course) return res.status(404).json({ message: 'Không tìm thấy khóa học' });
    res.json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/courses (admin)
const createCourse = async (req, res) => {
  try {
    const course = await Course.create({ ...req.body, instructor: req.user._id });
    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/courses/:id (admin)
const updateCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!course) return res.status(404).json({ message: 'Không tìm thấy khóa học' });
    res.json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/courses/:id (admin)
const deleteCourse = async (req, res) => {
  try {
    await Course.findByIdAndDelete(req.params.id);
    res.json({ message: 'Xóa khóa học thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/courses/:id/enroll
const enrollCourse = async (req, res) => {
  try {
    const existing = await Enrollment.findOne({ user: req.user._id, course: req.params.id });
    if (existing) return res.status(400).json({ message: 'Bạn đã đăng ký khóa học này' });
    const enrollment = await Enrollment.create({ user: req.user._id, course: req.params.id });
    res.status(201).json(enrollment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/courses/all (admin - includes unpublished)
const getAllCoursesAdmin = async (req, res) => {
  try {
    const courses = await Course.find().populate('instructor', 'name').sort({ createdAt: -1 });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getCourses, getCourseById, createCourse, updateCourse, deleteCourse, enrollCourse, getAllCoursesAdmin };
