const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');

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
    const cls = await Class.findById(req.params.id)
      .populate('courses', 'title thumbnail category level totalLessons')
      .populate('teacher', 'name avatar');

    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp học' });

    const isAdmin = req.user?.role === 'admin';
    if (isAdmin) {
      await cls.populate('students', 'name email avatar');
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
    const idx = cls.lessonVisibility.findIndex(lv => lv.lesson.toString() === lessonId);

    let isVisible;
    if (idx >= 0) {
      cls.lessonVisibility[idx].isVisible = !cls.lessonVisibility[idx].isVisible;
      isVisible = cls.lessonVisibility[idx].isVisible;
    } else {
      cls.lessonVisibility.push({ lesson: lessonId, isVisible: true });
      isVisible = true;
    }

    await cls.save();
    res.json({ lessonId, isVisible });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getClasses, getClassById, createClass, updateClass, deleteClass, addStudentToClass, removeStudentFromClass, toggleClassLesson };
