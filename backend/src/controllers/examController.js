const Exam = require('../models/Exam');
const ExamResult = require('../models/ExamResult');
const Lesson = require('../models/Lesson');
const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');

// Tự động sinh nhận xét dựa trên điểm từng mức độ
function generateAutoFeedback(exam, scores) {
  const levelResults = exam.levels.map((level) => {
    const levelScores = scores.filter(
      (s) => s.questionOrder >= level.fromQuestion && s.questionOrder <= level.toQuestion
    );
    const actual = levelScores.reduce((sum, s) => sum + (s.score || 0), 0);
    const pct = level.totalPoints > 0 ? actual / level.totalPoints : 0;
    return { name: level.name, actual, max: level.totalPoints, pct };
  });

  const totalActual = levelResults.reduce((s, l) => s + l.actual, 0);
  const totalMax = levelResults.reduce((s, l) => s + l.max, 0);
  const overallPct = totalMax > 0 ? totalActual / totalMax : 0;

  let summary;
  if (overallPct >= 0.9) summary = 'Xuất sắc! Em nắm vững kiến thức và kỹ năng.';
  else if (overallPct >= 0.8) summary = 'Giỏi! Em làm bài rất tốt.';
  else if (overallPct >= 0.65) summary = 'Khá. Em cần luyện tập thêm một số dạng bài.';
  else if (overallPct >= 0.5) summary = 'Trung bình. Em cần ôn tập lại kiến thức.';
  else summary = 'Yếu. Em cần ôn tập toàn bộ nội dung bài học.';

  const details = levelResults.map((l) => {
    const pctStr = (l.pct * 100).toFixed(0) + '%';
    if (l.pct >= 0.9) return `✔ ${l.name}: Tốt (${pctStr} - ${l.actual}/${l.max} điểm)`;
    if (l.pct >= 0.6) return `~ ${l.name}: Cần củng cố thêm (${pctStr} - ${l.actual}/${l.max} điểm)`;
    return `✘ ${l.name}: Cần ôn luyện nhiều hơn (${pctStr} - ${l.actual}/${l.max} điểm)`;
  });

  return summary + '\n' + details.join('\n');
}

// GET /api/exams
const getExams = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.class = req.query.classId;
    if (req.query.lessonId) filter.lesson = req.query.lessonId;
    if (req.query.isTemplate === 'true') filter.isTemplate = true;
    if (req.query.isTemplate === 'false') filter.isTemplate = false;

    const exams = await Exam.find(filter)
      .populate('lesson', 'title criteria')
      .populate('class', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exams/:id
const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('lesson', 'title criteria')
      .populate('class', 'name students')
      .populate('createdBy', 'name');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams
const createExam = async (req, res) => {
  try {
    const exam = await Exam.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(exam);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/exams/:id
const updateExam = async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('lesson', 'title criteria')
      .populate('class', 'name');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });
    res.json(exam);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/exams/:id
const deleteExam = async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    await ExamResult.deleteMany({ exam: req.params.id });
    res.json({ message: 'Đã xóa đề kiểm tra' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exams/:id/results  (lấy kết quả của tất cả học sinh)
const getExamResults = async (req, res) => {
  try {
    const results = await ExamResult.find({ exam: req.params.id })
      .populate('student', 'name email')
      .populate('gradedBy', 'name')
      .sort({ createdAt: 1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams/:id/results  (chấm điểm / cập nhật kết quả)
const saveExamResult = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    const { studentId, scores, teacherNote } = req.body;
    if (!studentId) return res.status(400).json({ message: 'Thiếu studentId' });

    const totalScore = (scores || []).reduce((sum, s) => sum + (s.score || 0), 0);
    const maxScore = exam.levels.reduce((sum, l) => sum + l.totalPoints, 0);
    const autoFeedback = generateAutoFeedback(exam, scores || []);

    const result = await ExamResult.findOneAndUpdate(
      { exam: req.params.id, student: studentId },
      {
        exam: req.params.id,
        student: studentId,
        class: exam.class,
        scores: scores || [],
        totalScore,
        maxScore,
        autoFeedback,
        teacherNote: teacherNote || '',
        gradedBy: req.user._id,
        gradedAt: new Date(),
        status: 'graded',
      },
      { upsert: true, new: true, runValidators: true }
    )
      .populate('student', 'name email')
      .populate('gradedBy', 'name');

    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET /api/exams/:id/results/:studentId
const getStudentResult = async (req, res) => {
  try {
    const result = await ExamResult.findOne({ exam: req.params.id, student: req.params.studentId })
      .populate('student', 'name email')
      .populate('gradedBy', 'name');
    if (!result) return res.status(404).json({ message: 'Chưa có kết quả' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams/student/:id/submit - học sinh nộp ảnh bài làm
const submitExamImages = async (req, res) => {
  try {
    const { imageUrls } = req.body;
    if (!Array.isArray(imageUrls) || imageUrls.length === 0)
      return res.status(400).json({ message: 'Không có ảnh được gửi lên' });

    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    if (exam.class) {
      const enrollment = await ClassEnrollment.findOne({
        student: req.user._id,
        class: exam.class,
        status: 'approved',
      });
      if (!enrollment) return res.status(403).json({ message: 'Bạn không có quyền nộp bài này' });
    }

    const images = imageUrls.map(url => ({ url, uploadedAt: new Date() }));

    let result = await ExamResult.findOne({ exam: req.params.id, student: req.user._id });
    if (result) {
      result.submissionImages = images;
      result.submittedAt = new Date();
      if (result.status !== 'graded') result.status = 'pending';
      await result.save();
    } else {
      result = await ExamResult.create({
        exam: req.params.id,
        student: req.user._id,
        class: exam.class,
        submissionImages: images,
        submittedAt: new Date(),
        status: 'pending',
      });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET /api/exams/student - học sinh xem danh sách đề của lớp mình
const getStudentExams = async (req, res) => {
  try {
    const enrollments = await ClassEnrollment.find({ student: req.user._id, status: 'approved' }).select('class');
    const classIds = enrollments.map(e => e.class);

    const exams = await Exam.find({ class: { $in: classIds } })
      .populate('lesson', 'title')
      .populate('class', 'name')
      .sort({ createdAt: -1 })
      .select('-content'); // không gửi nội dung ở danh sách

    const examIds = exams.map(e => e._id);
    const results = await ExamResult.find({ exam: { $in: examIds }, student: req.user._id }).select('exam totalScore maxScore status');
    const resultMap = {};
    results.forEach(r => { resultMap[r.exam.toString()] = r; });

    const data = exams.map(e => ({
      ...e.toObject(),
      myResult: resultMap[e._id.toString()] || null,
    }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exams/student/:id - học sinh xem chi tiết đề + điểm
const getStudentExamDetail = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('lesson', 'title')
      .populate('class', 'name');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    // Kiểm tra học sinh thuộc lớp này
    if (exam.class) {
      const enrollment = await ClassEnrollment.findOne({
        student: req.user._id,
        class: exam.class._id || exam.class,
        status: 'approved',
      });
      if (!enrollment) return res.status(403).json({ message: 'Bạn không có quyền xem đề này' });
    }

    const result = await ExamResult.findOne({ exam: exam._id, student: req.user._id });
    res.json({ ...exam.toObject(), myResult: result || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getExams, getExamById, createExam, updateExam, deleteExam, getExamResults, saveExamResult, getStudentResult, getStudentExams, getStudentExamDetail, submitExamImages };