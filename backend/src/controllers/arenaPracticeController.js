const mongoose = require('mongoose');
const { Profile } = require('../models/Community');
const { ArenaQuestion, ArenaPracticeHistory } = require('../models/MathArena');
const Class = require('../models/Class');
const { energySettings } = require('../services/energySettings');
const { ensureProfile } = require('../services/community');
const { classGrade } = require('../utils/classGrade');
const { requireGrade } = require('../services/gradeCatalog');
const { fail, DIFFICULTIES, isCorrect } = require('../utils/mathArena');
const { chapterList, playHours, wrap } = require('./mathArenaController');

function present(profile, practiceCost) {
  const s = profile.arenaPractice;
  if (!s) return { practiceCost, energy: profile.energy, session: null };
  const q = s.questions[s.index];
  return { practiceCost, energy: profile.energy, session: {
    _id: s._id, number: s.number || 1, startedAt: s.startedAt, completedAt: s.completedAt,
    grade: s.grade, chapter: s.chapter, difficulty: s.difficulty,
    index: s.index, score: s.score, total: 10, completed: s.index === 10,
    question: q ? { prompt: q.prompt, kind: q.kind, options: q.kind === 'choice' ? q.options : [] } : null,
    review: s.questions.slice(0, s.index).map((q, i) => ({ ...q, submittedAnswer: s.answers[i], correct: isCorrect(q, s.answers[i]) })),
  } };
}
function summary(s) {
  return { _id: s._id, number: s.number || 1, grade: s.grade, chapter: s.chapter,
    difficulty: s.difficulty, cost: s.cost ?? 10, index: s.index, score: s.score,
    startedAt: s.startedAt, completedAt: s.completedAt };
}
async function account(req) {
  if (req.user.role !== 'student') fail('Tự luyện dành cho học sinh', 403);
  return ensureProfile(req.user._id);
}
module.exports = {
  get: wrap(async (req, res) => res.json(present(await account(req), (await energySettings()).practiceCost))),
  history: wrap(async (req, res) => {
    const profile = await account(req);
    const current = profile.arenaPractice;
    const filter = { user: req.user._id, ...(current ? { _id: { $ne: current._id } } : {}) };
    const archived = await ArenaPracticeHistory.countDocuments(filter);
    const total = archived + (current ? 1 : 0), pageSize = 10;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
    const offset = (page - 1) * pageSize;
    const items = await ArenaPracticeHistory.find(filter).select('-user').sort({ number: -1, _id: -1 })
      .skip(Math.max(0, offset - (current ? 1 : 0))).limit(pageSize - (current && page === 1 ? 1 : 0)).lean();
    if (current && page === 1) items.unshift(summary(current));
    res.json({ items, total, page, pageSize, pages });
  }),
  start: wrap(async (req, res) => {
    const profile = await account(req);
    const { practiceCost } = await energySettings();
    await playHours();
    // Resuming a paid session never charges again, including concurrent requests.
    if (profile.arenaPractice && profile.arenaPractice.index < 10) return res.json(present(profile, practiceCost));
    const { classId, chapter, difficulty, previousId } = req.body;
    if (previousId !== undefined && (typeof previousId !== 'string' || !mongoose.isValidObjectId(previousId))) fail('Mã lượt luyện không hợp lệ');
    if (!mongoose.isValidObjectId(classId) || !DIFFICULTIES.includes(difficulty) || typeof chapter !== 'string' || !chapter || chapter.length > 300) fail('Chọn lớp, chủ đề và độ khó hợp lệ');
    const cls = await Class.findOne({ _id: classId, students: req.user._id, isActive: true }).lean();
    const grade = classGrade(cls);
    await requireGrade(grade);
    if (!(await chapterList(grade)).some(c => c.name === chapter)) fail('Chủ đề không thuộc khối của lớp');
    const questions = await ArenaQuestion.aggregate([{ $match: { grade, chapter, difficulty, published: true } }, { $sample: { size: 10 } }]);
    if (questions.length !== 10) fail('Chủ đề cần ít nhất 10 câu đã công bố. Chưa trừ năng lượng.');
    // Archive the previous paid attempt before replacing it; retries use the same unique ID.
    if (profile.arenaPractice) {
      await ArenaPracticeHistory.updateOne({ _id: profile.arenaPractice._id }, {
        $setOnInsert: { ...summary(profile.arenaPractice), user: req.user._id },
      }, { upsert: true });
    }
    const number = Math.max(profile.arenaPracticeCount || 0, profile.arenaPractice?.number || (profile.arenaPractice ? 1 : 0)) + 1;
    const session = { _id: String(new mongoose.Types.ObjectId()), number, classId, grade, chapter, difficulty, questions, index: 0, score: 0, answers: [], startedAt: new Date(), cost: practiceCost };
    const updated = await Profile.findOneAndUpdate({ user: req.user._id, energy: { $gte: practiceCost },
      'arenaPractice._id': previousId || { $exists: false },
      $or: [{ arenaPractice: { $exists: false } }, { 'arenaPractice.index': 10 }],
    }, { $inc: { energy: -practiceCost }, $set: { arenaPractice: session, arenaPracticeCount: number } }, { new: true }).lean();
    if (!updated) {
      const latest = await Profile.findOne({ user: req.user._id }).lean();
      if (latest.arenaPractice && latest.arenaPractice.index < 10) return res.json(present(latest, practiceCost));
      fail(latest.energy < practiceCost ? `Bạn cần đủ ${practiceCost} năng lượng để tự luyện.` : 'Lượt luyện đã thay đổi. Hãy tải lại.', 409);
    }
    res.status(201).json(present(updated, practiceCost));
  }),
  answer: wrap(async (req, res) => {
    const profile = await account(req);
    const { practiceCost } = await energySettings();
    const { sessionId, index, answer } = req.body;
    const s = profile.arenaPractice;
    if (!s || s._id !== sessionId) fail('Không tìm thấy lượt luyện của bạn', 404);
    if (!Number.isInteger(index) || index < 0 || index > 9 || !(typeof answer === 'string' && answer.trim() && answer.length <= 100 || Number.isInteger(answer) && answer >= 0 && answer < 4)) fail('Đáp án không hợp lệ');
    if (index < s.index) return res.json(present(profile, practiceCost));
    if (index !== s.index || !s.questions[index]) fail('Câu hỏi đã thay đổi', 409);
    const updated = await Profile.findOneAndUpdate({ user: req.user._id, 'arenaPractice._id': sessionId, 'arenaPractice.index': index }, {
      ...(index === 9 ? { $set: { 'arenaPractice.completedAt': new Date() } } : {}),
      $inc: { 'arenaPractice.index': 1, 'arenaPractice.score': isCorrect(s.questions[index], answer) ? 1 : 0 },
      $push: { 'arenaPractice.answers': answer },
    }, { new: true }).lean();
    res.json(present(updated || await Profile.findOne({ user: req.user._id }).lean(), practiceCost));
  }),
};
