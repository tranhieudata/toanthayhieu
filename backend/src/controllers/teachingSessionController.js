const TeachingSession = require('../models/TeachingSession');
const Class = require('../models/Class');
const Lesson = require('../models/Lesson');
const Homework = require('../models/Homework');
const Exam = require('../models/Exam');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

function lessonIdOf(session) {
  return session?.actualLesson?._id || session?.actualLesson || session?.plannedLesson?._id || session?.plannedLesson;
}

function lessonSessionFilter(classId, lessonId, excludeId) {
  const filter = {
    class: classId,
    $or: [{ actualLesson: lessonId }, { plannedLesson: lessonId }],
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return filter;
}

function populateTeachingSession(query) {
  return query
    .populate('class', 'name')
    .populate('plannedLesson', 'title order course')
    .populate('actualLesson', 'title order course')
    .populate('previousSession', 'date status summary')
    .populate('homeworks', 'title dueDate pdfAttachments')
    .populate('exams', 'title pdfAttachments')
    .populate('nextRecommendation.lesson', 'title order course');
}

async function findCurrentSession(classId, lessonId, excludeId) {
  if (!classId || !lessonId) return null;
  return TeachingSession.findOne(lessonSessionFilter(classId, lessonId, excludeId)).sort({ updatedAt: -1, createdAt: -1 });
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function generateGeminiContent(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình');

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError;
  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      lastError = error;
      console.warn(`[Teaching summary Gemini] ${modelName} failed: ${error.message}`);
    }
  }
  throw lastError || new Error('Không gọi được Gemini');
}

function lessonSummaryFallback(lessonText, lessonTitle) {
  const cleanText = stripHtml(lessonText || '');
  if (!cleanText) return `Hôm nay lớp học chủ đề ${lessonTitle}.`;

  const sentences = cleanText
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 18 && !/^câu\s+\d+/i.test(item))
    .slice(0, 3);

  if (sentences.length) return sentences.join(' ');
  return cleanText.slice(0, 280);
}

function buildParentSummaryFallback({ lesson, cls, homeworkLinks }) {
  const links = (homeworkLinks || []).filter((item) => item?.url);
  const className = cls?.name || 'lớp';
  const lessonTitle = lesson?.title || 'bài học hôm nay';
  const lessonLine = lessonSummaryFallback(lesson?.content, lessonTitle);
  const homeworkLines = links.length
    ? [
        'Bài tập để phụ huynh cho con làm/in:',
        ...links.map((item, index) => `${index + 1}. ${item.title || 'Bài tập'}: ${item.url}`),
      ].join('\n')
    : 'Hiện chưa có link bài tập để gửi phụ huynh.';

  return [
    `Kính gửi phụ huynh ${className}, hôm nay các con học chủ đề: ${lessonTitle}.`,
    `Nội dung chính: ${lessonLine}`,
    'Phụ huynh nhắc con xem lại kiến thức trọng tâm và hoàn thành phần luyện tập được giao.',
    homeworkLines,
  ].join('\n');
}

async function ensureHomeworkPrintShare(homework) {
  let shouldSave = false;
  if (!homework?.printShareToken || homework.$isDefault?.('printShareToken')) {
    homework.printShareToken = crypto.randomBytes(18).toString('hex');
    shouldSave = true;
  }
  if (homework.printShareEnabled === undefined || homework.$isDefault?.('printShareEnabled')) {
    homework.printShareEnabled = true;
    shouldSave = true;
  }
  if (shouldSave || homework.isModified?.('printShareToken') || homework.isModified?.('printShareEnabled')) await homework.save();
  const obj = homework.toObject ? homework.toObject() : homework;
  return {
    ...obj,
    parentPrintUrl: obj.printShareToken ? `/print/homework/${obj.printShareToken}` : '',
  };
}

function buildPrintablePdfs({ homeworks, manualPdfs }) {
  const items = [];

  (homeworks || []).forEach((homework) => {
    (homework.pdfAttachments || []).forEach((pdf) => {
      if (pdf?.url) {
        items.push({
          ...(pdf.toObject?.() || pdf),
          sourceType: 'homework',
          sourceId: homework._id,
          parentPrintUrl: homework.parentPrintUrl,
        });
      }
    });
  });
  (manualPdfs || []).forEach((pdf) => {
    if (pdf?.url) items.push({ ...pdf, sourceType: pdf.sourceType || 'manual' });
  });

  return items;
}

function examPackageToHomeworkText(paper) {
  if (!paper) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => {
    const options = ['A', 'B', 'C', 'D'].map((key) => `${key}. ${q.options?.[key] || ''}`).join('\n');
    return `Câu ${q.number || index + 1}. ${q.question || ''}\n${options}`;
  });
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}. ${q.question || ''}`);
  return [
    paper.title || '',
    mc.length ? `I. Phần trắc nghiệm\n${mc.join('\n\n')}` : '',
    essay.length ? `II. Phần tự luận\n${essay.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function examPackageToAnswerKey(paper) {
  if (!paper) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => `Câu ${q.number || index + 1}: ${q.answer || ''}`);
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}: ${q.solution || ''}`);
  return [...mc, ...essay].filter(Boolean).join('\n');
}

function examMaxScore(exam) {
  if (exam?.examPackage?.totals?.totalPoints) return Number(exam.examPackage.totals.totalPoints) || 10;
  const levelsTotal = (exam?.levels || []).reduce((sum, level) => sum + (Number(level.totalPoints) || 0), 0);
  return levelsTotal || 10;
}

function examDueDateForClass(exam, classId) {
  const schedule = (exam?.classSchedules || []).find((item) => {
    const scheduleClassId = item.class?._id || item.class;
    return String(scheduleClassId) === String(classId);
  });
  return schedule?.endDate || undefined;
}

async function syncHomeworksFromClassLessonExams({ exams, classId, lessonId, createdBy }) {
  if (!classId || !lessonId || !createdBy || !exams?.length) return;

  await Promise.all(exams.map(async (exam) => {
    const payload = {
      title: exam.title,
      description: examPackageToHomeworkText(exam.examPackage) || exam.content || exam.title,
      lesson: lessonId,
      sourceExam: exam._id,
      examPackage: exam.examPackage || null,
      pdfAttachments: exam.pdfAttachments || [],
      answerKey: examPackageToAnswerKey(exam.examPackage),
      maxScore: examMaxScore(exam),
      dueDate: examDueDateForClass(exam, classId),
      isPublished: true,
    };

    const existing = await Homework.findOne({ class: classId, lesson: lessonId, sourceExam: exam._id });
    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      return;
    }

    await Homework.create({
      ...payload,
      class: classId,
      createdBy,
    });
  }));
}

async function findPreviousSession(classId, beforeDate) {
  return TeachingSession.findOne({
    class: classId,
    date: { $lt: beforeDate || new Date() },
  })
    .populate('plannedLesson', 'title order course')
    .populate('actualLesson', 'title order course')
    .populate('homeworks', 'title dueDate pdfAttachments')
    .populate('exams', 'title pdfAttachments')
    .sort({ date: -1, createdAt: -1 });
}

async function findNextLessonForClass(classId, afterLessonId) {
  const cls = await Class.findById(classId).populate('courses', '_id title');
  if (!cls) return null;

  const courseIds = (cls.courses || []).map((course) => course._id || course);
  if (!courseIds.length) return null;

  const completedSessions = await TeachingSession.find({
    class: classId,
    status: { $in: ['completed', 'skipped'] },
  }).select('actualLesson plannedLesson');
  const completedLessonIds = new Set(
    completedSessions
      .map(lessonIdOf)
      .filter(Boolean)
      .map((id) => id.toString())
  );

  const afterLesson = afterLessonId ? await Lesson.findById(afterLessonId).select('order course') : null;
  const filter = { course: { $in: courseIds }, isPublished: true };
  if (afterLesson?.course) {
    filter.course = afterLesson.course;
    filter.order = { $gt: afterLesson.order || 0 };
  }

  const candidates = await Lesson.find(filter).sort({ course: 1, order: 1, createdAt: 1 }).limit(30);
  return candidates.find((lesson) => !completedLessonIds.has(lesson._id.toString())) || candidates[0] || null;
}

async function markLessonOpenForClass(classId, lessonId) {
  if (!classId || !lessonId) return;
  const cls = await Class.findById(classId);
  if (!cls) return;

  const lessonIdText = lessonId.toString();
  let idx = cls.lessonVisibility.findIndex((item) => item.lesson.toString() === lessonIdText);
  if (idx < 0) {
    cls.lessonVisibility.push({ lesson: lessonId, isVisible: true, autoOpenAt: null });
    idx = cls.lessonVisibility.length - 1;
  } else {
    cls.lessonVisibility[idx].isVisible = true;
  }
  cls.markModified('lessonVisibility');
  await cls.save();
}

async function loadLessonMaterials({ lessonId, classId, createdBy }) {
  if (!lessonId) return { lesson: null, homeworks: [], exams: [] };

  const [lesson, exams] = await Promise.all([
    Lesson.findById(lessonId).populate('course', 'title'),
    Exam.find({
      lesson: lessonId,
      ...(classId ? { 'classSchedules.class': classId } : {}),
    })
      .populate('createdBy', '_id')
      .populate('classSchedules.class', 'name')
      .sort({ createdAt: -1 }),
  ]);

  await syncHomeworksFromClassLessonExams({ exams, classId, lessonId, createdBy });

  const homeworks = await Homework.find({ lesson: lessonId, ...(classId ? { class: classId } : {}) })
    .populate('class', 'name')
    .populate('sourceExam', 'title')
    .sort({ createdAt: -1 });

  const normalizedHomeworks = [];
  for (const homework of homeworks) {
    normalizedHomeworks.push(await ensureHomeworkPrintShare(homework));
  }

  return { lesson, homeworks: normalizedHomeworks, exams };
}

const getTeachingSessions = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.class = req.query.classId;
    if (req.query.lessonId) {
      filter.$or = [{ plannedLesson: req.query.lessonId }, { actualLesson: req.query.lessonId }];
    }

    const sessions = await populateTeachingSession(TeachingSession.find(filter))
      .sort({ updatedAt: -1, createdAt: -1 });

    const uniqueSessionsByLesson = new Map();
    sessions.forEach((session) => {
      const classId = session.class?._id || session.class;
      const lessonId = lessonIdOf(session);
      const key = `${classId || 'no-class'}:${lessonId || session._id}`;
      if (!uniqueSessionsByLesson.has(key)) uniqueSessionsByLesson.set(key, session);
    });

    const uniqueSessions = Array.from(uniqueSessionsByLesson.values()).sort((a, b) => {
      const dateDiff = new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
      if (dateDiff) return dateDiff;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    res.json(uniqueSessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getTeachingSessionById = async (req, res) => {
  try {
    const session = await TeachingSession.findById(req.params.id)
      .populate('class', 'name')
      .populate('plannedLesson', 'title content order course pdfAttachments')
      .populate('actualLesson', 'title content order course pdfAttachments')
      .populate('previousSession')
      .populate('homeworks')
      .populate('exams')
      .populate('nextRecommendation.lesson', 'title order course');
    if (!session) return res.status(404).json({ message: 'Không tìm thấy buổi dạy' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getTeachingPlanner = async (req, res) => {
  try {
    const { classId, lessonId, date } = req.query;
    if (!classId) return res.status(400).json({ message: 'Thiếu classId' });

    const sessionDate = date ? new Date(date) : new Date();
    const previousSession = await findPreviousSession(classId, sessionDate);
    const selectedLessonId = lessonId || lessonIdOf(previousSession);
    const nextLesson = await findNextLessonForClass(classId, selectedLessonId);
    const plannerLessonId = lessonId || nextLesson?._id;
    const [materials, currentSession] = await Promise.all([
      loadLessonMaterials({ lessonId: plannerLessonId, classId, createdBy: req.user._id }),
      findCurrentSession(classId, plannerLessonId),
    ]);
    const populatedCurrentSession = currentSession
      ? await populateTeachingSession(TeachingSession.findById(currentSession._id))
      : null;

    res.json({
      previousSession,
      currentSession: populatedCurrentSession,
      suggestedLesson: nextLesson,
      lesson: materials.lesson,
      homeworks: materials.homeworks,
      exams: materials.exams,
      printablePdfs: buildPrintablePdfs({
        homeworks: materials.homeworks,
      }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createTeachingSession = async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user._id };
    if (!data.class || !data.date) return res.status(400).json({ message: 'Thiếu lớp hoặc ngày dạy' });

    if (!data.previousSession) {
      const previous = await findPreviousSession(data.class, new Date(data.date));
      if (previous) data.previousSession = previous._id;
    }

    const lessonId = data.actualLesson || data.plannedLesson;
    const materials = await loadLessonMaterials({ lessonId, classId: data.class, createdBy: req.user._id });
    data.printablePdfs = buildPrintablePdfs({
      homeworks: materials.homeworks,
      manualPdfs: data.printablePdfs,
    });

    if (!data.nextRecommendation?.lesson) {
      if (['partial', 'rescheduled'].includes(data.status) && lessonId) {
        data.nextRecommendation = {
          lesson: lessonId,
          note: 'Buổi sau nên học tiếp phần còn lại trước khi sang bài mới.',
        };
      } else {
        const nextLesson = await findNextLessonForClass(data.class, lessonId);
        if (nextLesson) {
          data.nextRecommendation = {
            lesson: nextLesson._id,
            note: 'Gợi ý bài kế tiếp theo tiến độ lớp.',
          };
        }
      }
    }

    let session = await findCurrentSession(data.class, lessonId);
    const statusCode = session ? 200 : 201;
    if (session) {
      Object.assign(session, data);
      await session.save();
    } else {
      session = await TeachingSession.create(data);
    }

    if (['completed', 'partial'].includes(data.status)) {
      await markLessonOpenForClass(data.class, lessonId);
    }
    const populated = await populateTeachingSession(TeachingSession.findById(session._id));

    res.status(statusCode).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const updateTeachingSession = async (req, res) => {
  try {
    const existing = await TeachingSession.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy buổi dạy' });

    const data = { ...req.body };
    const classId = data.class || existing.class;
    const lessonId = data.actualLesson || data.plannedLesson || existing.actualLesson || existing.plannedLesson;

    if ('actualLesson' in data || 'plannedLesson' in data || 'homeworks' in data || 'exams' in data) {
      const materials = await loadLessonMaterials({ lessonId, classId, createdBy: req.user._id });
      data.printablePdfs = buildPrintablePdfs({
        homeworks: materials.homeworks,
        manualPdfs: data.printablePdfs || existing.printablePdfs,
      });
    }

    const session = await TeachingSession.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true })
      .populate('class', 'name')
      .populate('plannedLesson', 'title order course')
      .populate('actualLesson', 'title order course')
      .populate('previousSession', 'date status summary')
      .populate('homeworks', 'title dueDate pdfAttachments')
      .populate('exams', 'title pdfAttachments')
      .populate('nextRecommendation.lesson', 'title order course');

    if (['completed', 'partial'].includes(session.status)) {
      await markLessonOpenForClass(session.class?._id || session.class, session.actualLesson?._id || session.actualLesson || session.plannedLesson?._id || session.plannedLesson);
    }

    res.json(session);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const deleteTeachingSession = async (req, res) => {
  try {
    await TeachingSession.findByIdAndDelete(req.params.id);
    res.json({ message: 'Đã xóa buổi dạy' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const generateParentSummary = async (req, res) => {
  try {
    const { lessonId, classId, homeworkLinks = [] } = req.body;
    if (!lessonId || !classId) return res.status(400).json({ message: 'Thiếu lớp hoặc bài học' });

    const [lesson, cls] = await Promise.all([
      Lesson.findById(lessonId).populate('course', 'title'),
      Class.findById(classId).select('name'),
    ]);
    if (!lesson) return res.status(404).json({ message: 'Không tìm thấy bài học' });

    const lessonText = stripHtml(lesson.content || '').slice(0, 2500);
    const links = (homeworkLinks || [])
      .filter((item) => item?.url)
      .map((item, index) => `${index + 1}. ${item.title || 'Bài tập'}: ${item.url}`)
      .join('\n');

    const prompt = `Bạn là thầy giáo Toán đang gửi tin nhắn ngắn cho phụ huynh sau buổi học.

Thông tin:
- Lớp: ${cls?.name || 'lớp học'}
- Chủ đề/bài học: ${lesson.title}
- Nội dung bài học: ${lessonText || lesson.title}
- Link bài tập cần chèn:
${links || 'Chưa có link bài tập'}

Yêu cầu:
- Viết bằng tiếng Việt, thân thiện, rõ ràng cho phụ huynh.
- Tóm tắt 2-4 dòng ý chính hôm nay học gì, cần nhớ gì.
- Nếu có link bài tập, chèn nguyên văn link vào cuối với nhãn "Thầy đã in đầy đủ bài cho các con. Nội dung BTVN :".
- Không viết dài, không dùng markdown bảng, không bịa nội dung ngoài dữ liệu đã cho.
- Không nhắc đến AI/Gemini.`;

    let summary;
    let source = 'gemini';
    try {
      summary = await generateGeminiContent(prompt);
    } catch (error) {
      console.warn(`[Teaching summary Gemini] fallback used: ${error.message}`);
      summary = buildParentSummaryFallback({ lesson, cls, homeworkLinks });
      source = 'fallback';
    }

    res.json({ summary, source });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = {
  getTeachingSessions,
  getTeachingSessionById,
  getTeachingPlanner,
  generateParentSummary,
  createTeachingSession,
  updateTeachingSession,
  deleteTeachingSession,
};
