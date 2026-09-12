const ClassEnrollment = require('../models/ClassEnrollment');
const Class = require('../models/Class');
const User = require('../models/User');

// POST /api/class-enrollments — học sinh đăng ký tham gia lớp
const applyToClass = async (req, res) => {
  try {
    const { classId, message } = req.body;
    if (!classId) return res.status(400).json({ message: 'Thiếu classId' });

    const cls = await Class.findById(classId);
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    if (!cls.isActive) return res.status(400).json({ message: 'Lớp học này không còn nhận học sinh' });

    const existing = await ClassEnrollment.findOne({ student: req.user._id, class: classId });
    if (existing) {
      const statusMsg = {
        pending: 'đang chờ xét duyệt',
        approved: 'đã được duyệt vào',
        rejected: 'đã bị từ chối – hãy liên hệ admin để biết thêm',
      };
      return res.status(400).json({ message: `Yêu cầu tham gia lớp của bạn ${statusMsg[existing.status]}` });
    }

    const enrollment = await ClassEnrollment.create({
      student: req.user._id,
      class: classId,
      message: message || '',
    });

    await enrollment.populate('class', 'name');
    res.status(201).json(enrollment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/class-enrollments — admin xem tất cả yêu cầu
const getAllEnrollments = async (req, res) => {
  try {
    const { status, classId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (classId) filter.class = classId;

    const total = await ClassEnrollment.countDocuments(filter);
    const enrollments = await ClassEnrollment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const studentIds = enrollments.map((enrollment) => enrollment.student).filter(Boolean);
    const classIds = enrollments.map((enrollment) => enrollment.class).filter(Boolean);
    const reviewerIds = enrollments.map((enrollment) => enrollment.reviewedBy).filter(Boolean);
    const [students, classes, reviewers] = await Promise.all([
      User.find({ _id: { $in: studentIds } }).select('name email avatar').lean(),
      Class.find({ _id: { $in: classIds } }).select('name').lean(),
      User.find({ _id: { $in: reviewerIds } }).select('name').lean(),
    ]);
    const studentMap = new Map(students.map((student) => [String(student._id), student]));
    const classMap = new Map(classes.map((cls) => [String(cls._id), cls]));
    const reviewerMap = new Map(reviewers.map((reviewer) => [String(reviewer._id), reviewer]));

    const normalizedEnrollments = enrollments.map((enrollment) => {
      const student = studentMap.get(String(enrollment.student));
      return {
        ...enrollment,
        student: student || enrollment.student,
        studentName: enrollment.studentName || student?.name || '',
        studentEmail: enrollment.studentEmail || student?.email || '',
        class: classMap.get(String(enrollment.class)) || enrollment.class,
        reviewedBy: reviewerMap.get(String(enrollment.reviewedBy)) || enrollment.reviewedBy,
      };
    });

    res.json({ enrollments: normalizedEnrollments, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/class-enrollments/my — học sinh xem danh sách đăng ký của mình
const getMyClassEnrollments = async (req, res) => {
  try {
    const enrollments = await ClassEnrollment.find({ student: req.user._id })
      .populate({
        path: 'class',
        select: 'name description schedules isActive',
        populate: { path: 'courses', select: 'title thumbnail category totalLessons' },
      })
      .sort({ createdAt: -1 });
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/class-enrollments/:id/approve — admin duyệt
const approveEnrollment = async (req, res) => {
  try {
    const enrollment = await ClassEnrollment.findById(req.params.id);
    if (!enrollment) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
    if (enrollment.status === 'approved') return res.status(400).json({ message: 'Yêu cầu đã được duyệt rồi' });

    enrollment.status = 'approved';
    enrollment.reviewedBy = req.user._id;
    enrollment.reviewedAt = new Date();
    enrollment.adminNote = req.body.adminNote || '';
    await enrollment.save();

    // Thêm học sinh vào danh sách lớp
    await Class.findByIdAndUpdate(enrollment.class, { $addToSet: { students: enrollment.student } });

    await enrollment.populate([
      { path: 'student', select: 'name email avatar' },
      { path: 'class', select: 'name' },
    ]);
    res.json(enrollment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/class-enrollments/:id/reject — admin từ chối
const rejectEnrollment = async (req, res) => {
  try {
    const enrollment = await ClassEnrollment.findById(req.params.id);
    if (!enrollment) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });

    enrollment.status = 'rejected';
    enrollment.reviewedBy = req.user._id;
    enrollment.reviewedAt = new Date();
    enrollment.adminNote = req.body.adminNote || '';
    await enrollment.save();

    // Xóa học sinh khỏi lớp nếu trước đó đã được duyệt
    await Class.findByIdAndUpdate(enrollment.class, { $pull: { students: enrollment.student } });

    await enrollment.populate([
      { path: 'student', select: 'name email avatar' },
      { path: 'class', select: 'name' },
    ]);
    res.json(enrollment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/class-enrollments/:id — học sinh rút yêu cầu (chỉ khi đang pending)
const cancelEnrollment = async (req, res) => {
  try {
    const enrollment = await ClassEnrollment.findOne({ _id: req.params.id, student: req.user._id });
    if (!enrollment) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
    if (enrollment.status !== 'pending') return res.status(400).json({ message: 'Chỉ có thể rút yêu cầu đang chờ duyệt' });

    await enrollment.deleteOne();
    res.json({ message: 'Đã rút yêu cầu tham gia lớp' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/class-enrollments/admin-add — admin thêm học sinh vào lớp trực tiếp
const adminAddStudent = async (req, res) => {
  try {
    const { classId, studentId } = req.body;
    if (!classId || !studentId) return res.status(400).json({ message: 'Thiếu classId hoặc studentId' });

    const cls = await Class.findById(classId);
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });

    const student = await User.findById(studentId).select('name email');
    if (!student) return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y há»c sinh' });

    const enrollment = await ClassEnrollment.findOneAndUpdate(
      { student: studentId, class: classId },
      { student: studentId, class: classId, status: 'approved', reviewedBy: req.user._id, reviewedAt: new Date(), adminNote: 'Thêm trực tiếp bởi admin' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    enrollment.studentName = student.name || '';
    enrollment.studentEmail = student.email || '';
    await enrollment.save();
    await Class.findByIdAndUpdate(classId, { $addToSet: { students: studentId } });
    await enrollment.populate('student', 'name email avatar');
    res.status(201).json(enrollment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/class-enrollments/admin-remove — admin xóa học sinh khỏi lớp
const adminRemoveStudent = async (req, res) => {
  try {
    const { classId, studentId } = req.body;
    if (!classId || !studentId) return res.status(400).json({ message: 'Thiếu classId hoặc studentId' });
    await ClassEnrollment.findOneAndDelete({ student: studentId, class: classId });
    await Class.findByIdAndUpdate(classId, { $pull: { students: studentId } });
    res.json({ message: 'Đã xóa học sinh khỏi lớp' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { applyToClass, getAllEnrollments, getMyClassEnrollments, approveEnrollment, rejectEnrollment, cancelEnrollment, adminAddStudent, adminRemoveStudent };
