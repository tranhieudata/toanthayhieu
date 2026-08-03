const Lesson = require('../models/Lesson');
const Course = require('../models/Course');
const ClassEnrollment = require('../models/ClassEnrollment');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const ExamResult = require('../models/ExamResult');
const Homework = require('../models/Homework');
const TeachingSession = require('../models/TeachingSession');
const { hasAccessToCourse } = require('../utils/accessControl');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

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

async function ensureHomeworkPrintShare(homework) {
  if (!homework?.printShareToken) {
    homework.printShareToken = crypto.randomBytes(18).toString('hex');
    if (homework.printShareEnabled === undefined) homework.printShareEnabled = true;
    await homework.save();
  }
  const obj = homework.toObject ? homework.toObject() : homework;
  return {
    ...obj,
    parentPrintUrl: obj.printShareToken ? `/print/homework/${obj.printShareToken}` : '',
  };
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

// GET /api/lessons/:id/bundle
// Gom nội dung bài học + bài tập về nhà + đề kiểm tra + tiến độ buổi dạy.
const getLessonBundle = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id).populate('course', 'title');
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });

    const isAdmin = req.user.role === 'admin';
    let classIds = [];
    if (!isAdmin) {
      const enrollments = await ClassEnrollment.find({ student: req.user._id, status: 'approved' }).select('class');
      const enrolledClassIds = enrollments.map((enrollment) => enrollment.class.toString());
      classIds = req.query.classId && enrolledClassIds.includes(req.query.classId)
        ? [req.query.classId]
        : enrolledClassIds;
    } else if (req.query.classId) {
      classIds = [req.query.classId];
    }

    if (!isAdmin) {
      if (!lesson.isPublished) {
        return res.status(403).json({ message: 'Bài học này chưa được mở' });
      }
      const access = await getStudentLessonAccess(req.user._id, lesson.course?._id || lesson.course);
      if (access.error) return res.status(access.error.status).json({ message: access.error.message });
      if (!access.lessonAccessMap[req.params.id]?.accessible) {
        return res.status(403).json({ message: 'Bài học này chưa được mở cho lớp của bạn' });
      }
    }

    const homeworkFilter = { lesson: req.params.id };
    const sessionFilter = {
      $or: [{ plannedLesson: req.params.id }, { actualLesson: req.params.id }],
    };

    if (classIds.length > 0) {
      homeworkFilter.class = { $in: classIds };
      sessionFilter.class = { $in: classIds };
    }

    if (!isAdmin) {
      homeworkFilter.isPublished = true;
    }

    const [homeworkDocs, sessions] = await Promise.all([
      Homework.find(homeworkFilter)
        .populate('class', 'name')
        .populate('sourceExam', 'title')
        .sort({ createdAt: -1 }),
      TeachingSession.find(sessionFilter)
        .populate('class', 'name')
        .populate('plannedLesson', 'title order course')
        .populate('actualLesson', 'title order course')
        .populate('homeworks', 'title dueDate pdfAttachments')
        .populate('exams', 'title pdfAttachments')
        .populate('nextRecommendation.lesson', 'title order course')
        .sort({ date: -1, createdAt: -1 }),
    ]);

    const homeworks = [];
    for (const homework of homeworkDocs) {
      homeworks.push(await ensureHomeworkPrintShare(homework));
    }

    const printablePdfs = homeworks.flatMap((homework) =>
      (homework.pdfAttachments || []).map((pdf) => ({
        ...(pdf.toObject?.() || pdf),
        sourceType: 'homework',
        sourceId: homework._id,
        parentPrintUrl: homework.parentPrintUrl,
      }))
    ).filter((pdf) => pdf?.url);

    res.json({ lesson, homeworks, sessions, printablePdfs });
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

function stripCodeFence(text = '') {
  return text
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeLessonHtml(html = '') {
  return stripCodeFence(html)
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/<div>(?:\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, '')
    .replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildLessonPrompt({ title, description, courseTitle, courseDescription, grade, chapter, topic }) {
  return `
Bạn là giáo viên Toán Việt Nam giàu kinh nghiệm. Hãy soạn nội dung bài học dạng HTML để nhúng vào trình soạn thảo rich text.

Thông tin bài học:
- Tiêu đề: ${title}
- Mô tả chuyên đề học: ${description || 'Không có'}
- Khóa học: ${courseTitle || 'Không rõ'}
- Mô tả khóa học: ${courseDescription || 'Không có'}
- Lớp: ${grade}
- Phụ lục/chương: ${chapter}
- Chủ đề: ${topic}

Yêu cầu nội dung:
1. Chỉ trả về HTML hợp lệ, không dùng Markdown, không bọc trong \`\`\`.
2. Có các thẻ h2, h3, p, ul/ol phù hợp với Quill editor.
3. Gồm phần mục tiêu, lý thuyết trọng tâm, ví dụ mẫu có lời giải, lỗi sai thường gặp.
4. Trong phần lý thuyết phải có một mục "Luyện tập nhỏ" gồm 3-5 câu hỏi ngắn kèm đáp án/hướng dẫn ngay dưới mỗi câu.
5. Công thức toán viết bằng LaTeX trong dấu $...$ hoặc $$...$$.
6. Văn phong rõ ràng, phù hợp học sinh lớp ${grade}, không quá dài, ưu tiên tính sư phạm, khoảng cách dòng sát nhau. Những công thức căn vào giữa trang.
7.Phần I: Kiến thức cần nhớ, Phần II : Dạng bài tập. 
Phần II có ít nhất 3 dạng bài tập đủ dạng từ cơ bản đến nâng cao, mỗi dạng có 2 ví dụ mẫu kèm lời giải chi tiết. Mỗi ví dụ mẫu có 1 câu hỏi và 1 lời giải. Nội dung phải phù hợp với chủ đề ${topic} trong chương ${chapter} của lớp ${grade}
Phần III : Bài Tập Về Nhà.
`.trim();
}

async function generateWithGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('Chưa cấu hình GEMINI_API_KEY');
    error.status = 400;
    throw error;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 5000,
    },
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function generateWithOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('Chưa cấu hình OPENAI_API_KEY');
    error.status = 400;
    throw error;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: 'Bạn chỉ trả về HTML hợp lệ để nhúng vào trình soạn thảo bài học.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    let message = 'Không thể gọi OpenAI';
    try {
      const errorBody = await response.json();
      message = errorBody.error?.message || message;
    } catch {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// POST /api/lessons/generate-content (admin)
const generateLessonContent = async (req, res) => {
  try {
    const { provider, title, description, course, grade, chapter, topic } = req.body;
    if (!['gemini', 'openai'].includes(provider)) {
      return res.status(400).json({ message: 'Vui lòng chọn Gemini hoặc ChatGPT' });
    }
    if (!title?.trim()) return res.status(400).json({ message: 'Tiêu đề bài học là bắt buộc' });
    if (!grade || !chapter || !topic) {
      return res.status(400).json({ message: 'Vui lòng chọn lớp, phụ lục và chủ đề' });
    }

    let courseDoc = null;
    if (course) {
      courseDoc = await Course.findById(course).select('title description').lean();
    }

    const prompt = buildLessonPrompt({
      title: title.trim(),
      description,
      courseTitle: courseDoc?.title,
      courseDescription: courseDoc?.description,
      grade,
      chapter,
      topic,
    });

    const rawContent = provider === 'gemini'
      ? await generateWithGemini(prompt)
      : await generateWithOpenAI(prompt);

    const content = normalizeLessonHtml(rawContent);
    if (!content) return res.status(502).json({ message: 'AI chưa trả về nội dung phù hợp' });

    res.json({ content });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Lỗi khi sinh nội dung AI' });
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

module.exports = { getLessons, getLessonById, getLessonBundle, createLesson, updateLesson, deleteLesson, toggleLessonStatus, generateLessonContent, addCriteria, updateCriteria, deleteCriteria };
