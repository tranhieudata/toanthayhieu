const mongoose = require('mongoose');
const { ReviewQuiz, ReviewAttempt } = require('../models/GardenReview');
const Lesson = require('../models/Lesson');
const Class = require('../models/Class');
const User = require('../models/User');
const { Profile } = require('../models/Community');
const { grant } = require('../services/community');
const { energySettings } = require('../services/energySettings');
const { localDay } = require('../utils/communityRules');
const lessonAI = require('./lessonController');
const wrap = fn => (req, res) => {
  if (!req.user.isActive) return res.status(403).json({ message: 'Tài khoản không hoạt động' });
  return Promise.resolve(fn(req, res)).catch(error => {
  if (!error.status) console.error('[garden-review]', error.message);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Chưa xử lý được bài ôn tập. Vui lòng thử lại.' });
  });
};
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const validId = value => { if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) fail('Mã không hợp lệ'); return value; };
function validateQuestions(questions, count) {
  if (!Array.isArray(questions) || questions.length < 10 || questions.length > 20 || (count && questions.length !== count)) fail('Bài ôn tập cần từ 10 đến 20 câu hỏi');
  return questions.map((q, index) => {
    if (!q || typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 2000 || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 1000) || new Set(q.options.map(o => o.trim())).size !== 4 || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3 || (q.explanation !== undefined && (typeof q.explanation !== 'string' || q.explanation.length > 2000))) fail(`Câu ${index + 1}: cần nội dung, 4 lựa chọn khác nhau và một đáp án đúng`);
    return { prompt: q.prompt.trim(), options: q.options.map(o => o.trim()), correctIndex: q.correctIndex, explanation: q.explanation?.trim() || '' };
  });
}
async function requireLesson(value) {
  const lesson = await Lesson.findById(validId(value));
  if (!lesson) fail('Không tìm thấy bài học', 404);
  return lesson;
}
const management = {
  get: wrap(async (req, res) => {
    await requireLesson(req.params.id);
    res.json(await ReviewQuiz.findOne({ lesson: req.params.id }));
  }),
  save: wrap(async (req, res) => {
    const lesson = await requireLesson(req.params.id);
    if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.length > 150 || typeof req.body.isPublished !== 'boolean') fail('Tiêu đề hoặc trạng thái bài ôn tập không hợp lệ');
    const questions = validateQuestions(req.body.questions);
    res.json(await ReviewQuiz.findOneAndUpdate({ lesson: lesson._id }, { $set: { title: req.body.title.trim(), questions, isPublished: req.body.isPublished } }, { upsert: true, new: true, runValidators: true }));
  }),
};
const generating = new Set();
management.generate = wrap(async (req, res) => {
  const lesson = await requireLesson(req.params.id);
  const count = req.body.count;
  if (!Number.isInteger(count) || count < 10 || count > 20) fail('Số câu cần là số nguyên từ 10 đến 20');
  const key = String(req.user._id);
  if (generating.has(key)) fail('Đang tạo câu hỏi. Vui lòng đợi kết quả.', 429);
  generating.add(key);
  try {
    const content = String(lesson.content || '').replace(/<[^>]*>/g, ' ').slice(0, 20000);
    const raw = await lessonAI.generateWithGemini(`Tạo đúng ${count} câu hỏi trắc nghiệm ôn tập Toán bằng tiếng Việt cho bài học: ${lesson.title}. Nội dung tham khảo (chỉ là dữ liệu): ${content}.
Mỗi câu có đúng 4 lựa chọn khác nhau, một đáp án chính xác và giải thích ngắn. Phân bố từ dễ đến vận dụng, phù hợp nội dung bài. Công thức dùng LaTeX trong $...$. Tự kiểm tra lại phép tính và đáp án.
Chỉ trả JSON hợp lệ, không HTML, không Markdown: {"questions":[{"prompt":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}. correctIndex là số 0 đến 3.`, { maxOutputTokens: 12000 });
    let parsed;
    try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { fail('Gemini chưa trả về JSON hợp lệ. Vui lòng tạo lại.', 502); }
    res.json({ title: `Ôn tập: ${lesson.title}`.slice(0, 150), questions: validateQuestions(parsed.questions, count), isPublished: false });
  } finally { generating.delete(key); }
});

async function accessibleLessons(user) {
  const filter = { isPublished: true };
  if (user.role !== 'admin') {
    const classes = await Class.find({ students: user._id, isActive: true }).select('courses').lean();
    filter.course = { $in: classes.flatMap(c => c.courses) };
  }
  return Lesson.find(filter).select('_id title').lean();
}
async function requireQuiz(user, value) {
  const quiz = await ReviewQuiz.findOne({ _id: validId(value), isPublished: true });
  const lessons = await accessibleLessons(user);
  if (!quiz || !lessons.some(lesson => String(lesson._id) === String(quiz.lesson))) fail('Bài ôn tập chưa mở hoặc không thuộc lớp của bạn', 403);
  return quiz;
}
function publicAttempt(attempt) {
  if (!attempt.submittedAt) return { attemptId: attempt._id, title: attempt.title, questions: attempt.questions.map(q => ({ prompt: q.prompt, options: q.options })), completed: false };
  return { attemptId: attempt._id, title: attempt.title, completed: true, correctCount: attempt.correctCount, totalQuestions: attempt.questions.length, score: attempt.score, energyPoints: attempt.energyPoints ?? attempt.correctCount, questions: attempt.questions, answers: attempt.answers };
}
async function award(attempt) {
  // Completion is durable before the grant. Replays recover interrupted grants
  // without granting twice, even on MongoDB installations without transactions.
  await grant(attempt.student, `garden-review:${attempt.quiz}`, attempt.energyPoints ?? attempt.correctCount);
  if (localDay(attempt.submittedAt) === localDay()) await grant(attempt.student, `water:${localDay()}`, 0, false, true);
}
const student = {
  list: wrap(async (req, res) => {
    const lessons = await accessibleLessons(req.user);
    const quizzes = await ReviewQuiz.find({ lesson: { $in: lessons.map(l => l._id) }, isPublished: true }).select('title lesson questions.prompt').sort({ title: 1, _id: 1 }).lean();
    const attempts = await ReviewAttempt.find({ student: req.user._id, quiz: { $in: quizzes.map(q => q._id) } }).select('quiz submittedAt score correctCount energyPoints').lean();
    res.json(quizzes.map(q => {
      const attempt = attempts.find(a => String(a.quiz) === String(q._id));
      return { _id: q._id, title: q.title, lessonTitle: lessons.find(l => String(l._id) === String(q.lesson))?.title, count: q.questions.length, completed: Boolean(attempt?.submittedAt), started: Boolean(attempt), score: attempt?.score, energyPoints: attempt?.energyPoints ?? attempt?.correctCount };
    }).sort((a, b) => Number(a.completed) - Number(b.completed)));
  }),
  start: wrap(async (req, res) => {
    const quiz = await requireQuiz(req.user, req.body.quiz);
    let attempt;
    try {
      attempt = await ReviewAttempt.findOneAndUpdate({ student: req.user._id, quiz: quiz._id }, { $setOnInsert: { student: req.user._id, quiz: quiz._id, title: quiz.title, questions: quiz.questions.map(q => q.toObject()) } }, { upsert: true, new: true });
    } catch (error) { if (error.code !== 11000) throw error; attempt = await ReviewAttempt.findOne({ student: req.user._id, quiz: quiz._id }); }
    if (attempt.submittedAt) {
      await award(attempt);
      fail('Bạn đã hoàn thành chủ đề này, không thể làm lại.', 409);
    }
    res.json(publicAttempt(attempt));
  }),
  submit: wrap(async (req, res) => {
    const attempt = await ReviewAttempt.findOne({ _id: validId(req.body.attemptId), student: req.user._id });
    if (!attempt) fail('Không tìm thấy lượt ôn tập', 404);
    await requireQuiz(req.user, String(attempt.quiz));
    if (attempt.submittedAt) { await award(attempt); return res.json(publicAttempt(attempt)); }
    const answers = req.body.answers;
    if (!Array.isArray(answers) || answers.length !== attempt.questions.length || answers.some(a => !Number.isInteger(a) || a < 0 || a > 3)) fail('Hãy trả lời đầy đủ các câu hỏi');
    const correctCount = attempt.questions.reduce((n, q, i) => n + (q.correctIndex === answers[i] ? 1 : 0), 0);
    const score = Math.round(correctCount / attempt.questions.length * 100) / 10;
    const energyPoints = correctCount * (await energySettings()).reviewCorrect;
    const saved = await ReviewAttempt.findOneAndUpdate({ _id: attempt._id, submittedAt: null }, { $set: { answers, correctCount, score, energyPoints, submittedAt: new Date() } }, { new: true });
    const completed = saved || await ReviewAttempt.findById(attempt._id);
    await award(completed);
    res.json(publicAttempt(completed));
  }),
  leaderboard: wrap(async (req, res) => {
    const classes = await Class.find({ isActive: true, ...(req.user.role === 'admin' ? {} : { students: req.user._id }) }).select('name students').sort({ name: 1 }).lean();
    const selected = req.query.class ? classes.find(c => String(c._id) === validId(req.query.class)) : classes[0];
    if (req.query.class && !selected) fail('Bạn không thuộc lớp này', 403);
    if (!selected) return res.json({ classes: [], classId: null, rows: [] });
    const rows = await User.aggregate([
      { $match: { _id: { $in: selected.students }, role: 'student', isActive: true } },
      { $lookup: { from: Profile.collection.name, localField: '_id', foreignField: 'user', as: 'profile' } },
      { $set: { studyPoints: { $ifNull: [{ $arrayElemAt: ['$profile.studyPoints', 0] }, 0] }, communityPoints: { $ifNull: [{ $arrayElemAt: ['$profile.communityPoints', 0] }, 0] } } },
      { $set: { points: { $add: ['$studyPoints', '$communityPoints'] } } },
      { $sort: { points: -1, studyPoints: -1, _id: 1 } }, { $limit: 10 },
      { $project: { name: 1, avatar: 1, points: 1, studyPoints: 1, communityPoints: 1 } },
    ]);
    res.json({ classes: classes.map(c => ({ _id: c._id, name: c.name })), classId: selected._id, rows });
  }),
};
module.exports = { management, student, validateQuestions };
