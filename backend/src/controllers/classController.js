const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Exam = require('../models/Exam');
const ExamResult = require('../models/ExamResult');

// GET /api/classes
const getClasses = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const filter = isAdmin ? {} : { isActive: true };

    const classes = await Class.find(filter)
      .populate('courses', 'title thumbnail category totalLessons')
      .populate('teacher', 'name avatar')
      .sort({ createdAt: -1 });

    if (!req.user) {
      // Public access - return only active classes without enrollment status
      return res.json(
        classes.map((cls) => {
          const obj = cls.toObject();
          return {
            ...obj,
            studentCount: obj.students.length,
            students: undefined,
            myEnrollmentStatus: null,
          };
        })
      );
    }

    if (!isAdmin) {
      // Logged-in student - gắn trạng thái đăng ký của học sinh vào từng lớp
      const myEnrollments = await ClassEnrollment.find({ student: req.user._id }).select('class status');
      const enrollmentMap = {};
      myEnrollments.forEach((e) => { enrollmentMap[e.class.toString()] = e.status; });

      return res.json(
        classes.map((cls) => {
          const obj = cls.toObject();
          return {
            ...obj,
            studentCount: obj.students.length,
            students: undefined,
            myEnrollmentStatus: enrollmentMap[cls._id.toString()] || null,
          };
        })
      );
    }

    res.json(classes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/classes/:id
const getClassById = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    
    let query = Class.findById(req.params.id)
      .populate('courses', 'title thumbnail category level totalLessons')
      .populate('teacher', 'name avatar');
    
    // Populate students only for admin
    if (isAdmin) {
      query = query.populate('students', 'name email avatar');
    }

    const cls = await query;

    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });

    if (isAdmin) {
      return res.json(cls);
    }

    const obj = cls.toObject();
    
    if (!req.user) {
      // Public access
      return res.json({
        ...obj,
        studentCount: obj.students.length,
        students: undefined,
        myEnrollmentStatus: null,
      });
    }

    const myEnrollment = await ClassEnrollment.findOne({
      student: req.user._id,
      class: req.params.id,
    });

    res.json({
      ...obj,
      studentCount: obj.students.length,
      students: undefined,
      myEnrollmentStatus: myEnrollment?.status || null,
      myEnrollmentId: myEnrollment?._id || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/classes/:id/stats (admin)
const getClassStats = async (req, res) => {
  try {
    const classId = req.params.id;
    const cls = await Class.findById(classId).populate('students', 'name email avatar');
    if (!cls) return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y lá»›p há»c' });

    const students = cls.students || [];
    const studentIds = students.map(student => student._id);

    const [homeworks, exams] = await Promise.all([
      Homework.find({ class: classId })
        .select('title maxScore dueDate createdAt')
        .sort({ dueDate: 1, createdAt: 1 }),
      Exam.find({ 'classSchedules.class': classId })
        .select('title levels createdAt')
        .sort({ createdAt: 1 }),
    ]);

    const homeworkIds = homeworks.map(hw => hw._id);
    const examIds = exams.map(exam => exam._id);

    const [homeworkSubmissions, examResults] = await Promise.all([
      homeworkIds.length
        ? HomeworkSubmission.find({ homework: { $in: homeworkIds }, student: { $in: studentIds } })
          .select('homework student score maxScore status gradedAt submittedAt')
        : [],
      examIds.length
        ? ExamResult.find({ exam: { $in: examIds }, student: { $in: studentIds } })
          .select('exam student totalScore maxScore status gradedAt submittedAt')
        : [],
    ]);

    const homeworkSubmissionMap = new Map(
      homeworkSubmissions.map(sub => [`${sub.student}:${sub.homework}`, sub])
    );
    const examResultMap = new Map(
      examResults.map(result => [`${result.student}:${result.exam}`, result])
    );

    const homeworkItems = homeworks.map(hw => ({
      _id: hw._id,
      title: hw.title,
      maxScore: hw.maxScore || 10,
      date: hw.dueDate || hw.createdAt,
    }));

    const examItems = exams.map(exam => ({
      _id: exam._id,
      title: exam.title,
      maxScore: (exam.levels || []).reduce((sum, level) => sum + (Number(level.totalPoints) || 0), 0) || 10,
      date: exam.createdAt,
    }));

    const normalizeAverage = (items) => {
      const graded = items.filter(item => item.score != null && item.maxScore > 0);
      if (!graded.length) return null;
      const total = graded.reduce((sum, item) => sum + (Number(item.score) / Number(item.maxScore)) * 10, 0);
      return Math.round((total / graded.length) * 10) / 10;
    };

    const statsStudents = students.map(student => {
      const homeworkScores = homeworkItems.map(hw => {
        const submission = homeworkSubmissionMap.get(`${student._id}:${hw._id}`);
        return {
          homework: hw._id,
          title: hw.title,
          score: submission?.status === 'graded' ? submission.score : null,
          maxScore: submission?.maxScore || hw.maxScore,
          status: submission?.status || 'missing',
          gradedAt: submission?.gradedAt || null,
          submittedAt: submission?.submittedAt || null,
        };
      });

      const examScores = examItems.map(exam => {
        const result = examResultMap.get(`${student._id}:${exam._id}`);
        return {
          exam: exam._id,
          title: exam.title,
          score: result?.status === 'graded' ? result.totalScore : null,
          maxScore: result?.maxScore || exam.maxScore,
          status: result?.status || 'missing',
          gradedAt: result?.gradedAt || null,
          submittedAt: result?.submittedAt || null,
        };
      });

      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        avatar: student.avatar,
        homeworkScores,
        examScores,
        averageHomework: normalizeAverage(homeworkScores),
        averageExam: normalizeAverage(examScores),
      };
    });

    res.json({
      class: { _id: cls._id, name: cls.name },
      homeworks: homeworkItems,
      exams: examItems,
      students: statsStudents,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/classes (admin)
const createClass = async (req, res) => {
  try {
    const cls = await Class.create(req.body);
    res.status(201).json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/classes/:id (admin)
const updateClass = async (req, res) => {
  try {
    const cls = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    res.json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/classes/:id (admin)
const deleteClass = async (req, res) => {
  try {
    await Class.findByIdAndDelete(req.params.id);
    res.json({ message: 'Xóa lớp học thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/classes/:id/students (add student)
const addStudentToClass = async (req, res) => {
  try {
    const { studentId } = req.body;
    const cls = await Class.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { students: studentId } },
      { new: true }
    ).populate('students', 'name email');
    res.json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/classes/:id/students/:studentId
const removeStudentFromClass = async (req, res) => {
  try {
    const cls = await Class.findByIdAndUpdate(
      req.params.id,
      { $pull: { students: req.params.studentId } },
      { new: true }
    );
    res.json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/classes/:id/lessons/:lessonId/toggle (admin)
const toggleClassLesson = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });

    const lessonId = req.params.lessonId.toString();
    const { isVisible, autoOpenAt } = req.body || {};
    
    
    let idx = cls.lessonVisibility.findIndex(lv => lv.lesson.toString() === lessonId);

    if (idx < 0) {
      cls.lessonVisibility.push({ lesson: lessonId, isVisible: false, autoOpenAt: null });
      idx = cls.lessonVisibility.length - 1;
    }

    if (autoOpenAt !== undefined) {
      if (!autoOpenAt) {
        cls.lessonVisibility[idx].autoOpenAt = null;
      } else {
        const parsedAutoOpenAt = new Date(autoOpenAt);
        if (Number.isNaN(parsedAutoOpenAt.getTime())) {
          return res.status(400).json({ message: 'Ngày giờ tự động mở không hợp lệ' });
        }
        cls.lessonVisibility[idx].autoOpenAt = parsedAutoOpenAt;
        console.log(`[toggleClassLesson] Set autoOpenAt=${parsedAutoOpenAt.toISOString()} for lesson ${lessonId}`);
        // Khi đặt lịch mở, mặc định chuyển về chế độ chờ mở theo giờ.
        if (typeof isVisible !== 'boolean') {
          cls.lessonVisibility[idx].isVisible = false;
        }
      }
    }

    if (typeof isVisible === 'boolean') {
      cls.lessonVisibility[idx].isVisible = isVisible;
    } else if (autoOpenAt === undefined) {
      cls.lessonVisibility[idx].isVisible = !cls.lessonVisibility[idx].isVisible;
    }

    cls.markModified('lessonVisibility');
    const savedCls = await cls.save();
    
    res.json({
      lessonId,
      isVisible: savedCls.lessonVisibility[idx].isVisible,
      autoOpenAt: savedCls.lessonVisibility[idx].autoOpenAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getClasses, getClassById, getClassStats, createClass, updateClass, deleteClass, addStudentToClass, removeStudentFromClass, toggleClassLesson };
