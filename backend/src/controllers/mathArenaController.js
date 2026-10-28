const mongoose = require('mongoose');
const { ArenaQuestion, ArenaMatch, ArenaSeat } = require('../models/MathArena');
const Class = require('../models/Class');
const User = require('../models/User');
const { Policy, Notification } = require('../models/Community');
const { inCurfew } = require('../utils/communityRules');
const { classGrade } = require('../utils/classGrade');
const { communityAccess } = require('../services/communityAccess');
const { grant, emit } = require('../services/community');
const { fail, isGrade, DIFFICULTIES, TARGET, REWARD, validateQuestion, isCorrect, scores } = require('../utils/mathArena');
const { energySettings } = require('../services/energySettings');
const { gradeCatalog, requireGrade } = require('../services/gradeCatalog');
const lessonAI = require('./lessonController');
const SiteSettings = require('../models/SiteSettings');
const defaultCurriculum = require('../utils/vnMathCurriculum');
async function chapterList(grade) {
  const settings = await SiteSettings.findOne({ key: 'default' }).select('curriculum').lean();
  const configured = settings?.curriculum;
  const curriculum = configured && typeof configured === 'object' && Object.keys(configured).length ? configured : defaultCurriculum;
  return Object.entries(curriculum[grade] || {}).map(([name, topics]) => ({ name, topics: Array.isArray(topics) ? topics.filter(topic => typeof topic === 'string' && topic.trim()) : [] }));
}
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(error => {
  if (!error.status) console.error('[math-arena]', error.message);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Chưa xử lý được trận đấu. Vui lòng thử lại.' });
});
const id = value => { if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) fail('Mã không hợp lệ'); return value; };
async function playHours() {
  const policy = await Policy.findOne({ key: 'default' }).lean();
  if (policy && inCurfew(policy)) fail('Đến giờ nghỉ rồi. Hẹn bạn quay lại đấu trường ngày mai!', 403);
}
async function broadcast(match) { await Promise.all(match.participants.map(p => emit(p.user, 'arena', { matchId: String(match._id) }))); }
async function awards(match) {
  if (match.status !== 'finished' || match.rewardsGranted) return;
  // Persist results before rewards; retries recover interrupted grants without duplicates.
  await Promise.all(match.participants.filter(p => p.team === match.winner).map(p => grant(p.user, `arena:${match._id}`, match.reward ?? REWARD)));
  await ArenaMatch.updateOne({ _id: match._id, status: 'finished' }, { $set: { rewardsGranted: true } });
  match.rewardsGranted = true;
}
async function settle(match) {
  const now = new Date();
  let changes;
  if (match.status === 'waiting' && match.expiresAt <= now) changes = { status: 'cancelled', reason: 'Lời mời đã hết hạn' };
  if (match.status === 'active' && match.deadline <= now) {
    const totals = scores(match);
    changes = { status: 'finished', finishedAt: now, winner: totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1, reason: 'Hết 60 giây' };
  }
  if (changes) {
    const updated = await ArenaMatch.findOneAndUpdate({ _id: match._id, revision: match.revision, status: match.status }, { $set: changes, $inc: { revision: 1 } }, { new: true }).lean();
    // A concurrent answer can win the compare-and-swap. Recheck the latest deadline state.
    if (!updated) return settle(await ArenaMatch.findById(match._id).lean());
    match = updated;
    await broadcast(match);
  }
  if (['finished', 'cancelled'].includes(match.status)) {
    await ArenaSeat.deleteMany({ match: match._id });
    await awards(match);
  }
  return match;
}
async function participantMatch(req) {
  const match = await ArenaMatch.findOne({ _id: id(req.params.id), 'participants.user': req.user._id }).lean();
  if (!match) fail('Không tìm thấy trận đấu của bạn', 404);
  if (['waiting', 'active'].includes(match.status)) {
    const cls = await Class.findOne({ _id: match.class, isActive: true, students: req.user._id });
    if (!cls) fail('Bạn không còn thuộc lớp hoặc khối của trận đấu', 403);
  }
  return settle(match);
}
function publicMatch(match, user) {
  const me = match.participants.find(p => String(p.user) === String(user));
  const q = match.status === 'active' && match.startsAt <= new Date() ? match.questions[me.index] : null;
  return {
    _id: match._id, host: match.host, class: match.class, grade: match.grade, difficulty: match.difficulty,
    chapters: match.chapters || [],
    mode: match.mode, format: match.format, status: match.status, expiresAt: match.expiresAt,
    startsAt: match.startsAt, deadline: match.deadline, finishedAt: match.finishedAt,
    winner: match.winner, reason: match.reason, revision: match.revision, serverNow: new Date(), target: TARGET, reward: match.reward ?? REWARD,
    participants: match.participants.map(p => ({ user: p.user, name: p.name, team: p.team, accepted: p.accepted, score: p.score, answered: p.index })),
    question: q ? { index: me.index, prompt: q.prompt, kind: q.kind, options: q.kind === 'choice' ? q.options : [] } : null,
    lastAnswer: me.lastAnswer,
    questionCount: match.questions.length,
  };
}
const student = {
  lobby: wrap(async (req, res) => {
    const classes = await Class.find({ isActive: true, ...(req.user.role === 'admin' ? {} : { students: req.user._id }) }).select('name students birthYear').sort({ name: 1 }).lean();
    const users = await User.find({ _id: { $in: classes.flatMap(c => c.students) }, role: 'student', isActive: true }).select('name avatar').sort({ name: 1 }).lean();
    const matches = await ArenaMatch.find({ 'participants.user': req.user._id }).sort({ createdAt: -1 }).limit(20).lean();
    const settled = await Promise.all(matches.map(settle));
    const counts = await ArenaQuestion.aggregate([{ $match: { published: true } }, { $group: { _id: { grade: '$grade', difficulty: '$difficulty', chapter: '$chapter' }, count: { $sum: 1 } } }]);
    const accessible = settled.filter(m => !['waiting', 'active'].includes(m.status) || classes.some(c => String(c._id) === String(m.class)));
    const curriculum = Object.fromEntries(await Promise.all([...new Set(classes.map(c => classGrade(c)).filter(Boolean))].map(async grade => [grade, await chapterList(grade)])));
    res.json({ curriculum, grades: await gradeCatalog(), classes: classes.map(c => ({ _id: c._id, name: c.name, birthYear: c.birthYear, grade: classGrade(c), students: users.filter(u => c.students.some(s => String(s) === String(u._id))) })), counts, matches: accessible.map(m => publicMatch(m, req.user._id)), reward: (await energySettings()).arenaWin, target: TARGET });
  }),
  create: wrap(async (req, res) => {
    if (req.user.role !== 'student') fail('Chế độ thi đấu dành cho học sinh', 403);
    await playHours();
    const { mode, format, difficulty } = req.body;
    if (!['race', 'archery'].includes(mode) || !['1v1', '2v2'].includes(format) || !DIFFICULTIES.includes(difficulty)) fail('Chế độ hoặc độ khó không hợp lệ');
    const cls = await Class.findOne({ _id: id(req.body.classId), students: req.user._id, isActive: true }).lean();
    const grade = classGrade(cls);
    if (!cls?.birthYear) fail('Lớp chưa có năm sinh. Nhờ thầy cập nhật tại Quản lý lớp học.', 403);
    await requireGrade(grade);
    const chapters = req.body.chapters ?? [];
    if (!Array.isArray(chapters) || chapters.length > 100 || chapters.some(c => typeof c !== 'string' || !c || c.length > 300)) fail('Danh sách chương không hợp lệ');
    const availableChapters = await chapterList(grade);
    if (chapters.some(c => !availableChapters.some(item => item.name === c))) fail('Chương không thuộc khối đã chọn');
    const questionFilter = { grade, difficulty, published: true, ...(chapters.length ? { chapter: { $in: chapters } } : {}) };
    const opponents = req.body.opponents;
    if (!Array.isArray(opponents) || opponents.length !== (format === '1v1' ? 1 : 2)) fail('Chọn đủ đối thủ');
    opponents.forEach(id);
    const ids = [String(req.user._id), ...(format === '2v2' ? [id(req.body.teammate)] : []), ...opponents];
    if (new Set(ids).size !== ids.length || ids.some(value => !cls.students.some(s => String(s) === value))) fail('Mỗi người chơi phải khác nhau và thuộc cùng lớp');
    const users = await User.find({ _id: { $in: ids }, role: 'student', isActive: true }).lean();
    if (users.length !== ids.length) fail('Có người chơi không hoạt động');
    for (const user of users) if (!(await communityAccess(user)).allowed) fail('Tất cả người chơi cần hoàn thành bài tập để vào mạng xã hội', 403);
    if (await ArenaQuestion.countDocuments(questionFilter) < 10) fail('Cần ít nhất 10 câu hỏi đã công bố đúng khối và độ khó');
    const existing = await ArenaMatch.find({ 'participants.user': { $in: ids }, status: { $in: ['waiting', 'active'] } }).lean();
    for (const match of existing) if (['waiting', 'active'].includes((await settle(match)).status)) fail('Có người chơi đang có lời mời hoặc trận đấu. Hãy kết thúc phòng cũ trước.', 409);
    const matchId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 120000);
    await ArenaSeat.deleteMany({ user: { $in: ids }, expiresAt: { $lte: new Date() } });
    let match;
    try {
      await ArenaSeat.insertMany(ids.map(user => ({ user, match: matchId, expiresAt: new Date(expiresAt.getTime() + 120000) })));
      match = await ArenaMatch.create({ _id: matchId, host: req.user._id, class: cls._id, grade, difficulty, chapters: [...new Set(chapters)], reward: (await energySettings()).arenaWin, mode, format, expiresAt,
        participants: ids.map((user, index) => ({ user, name: users.find(u => String(u._id) === user).name, team: index < (format === '1v1' ? 1 : 2) ? 0 : 1, accepted: index === 0 })) });
    } catch (error) {
      await ArenaSeat.deleteMany({ match: matchId });
      if (error.code === 11000) fail('Có người chơi vừa vào phòng khác. Hãy chọn lại.', 409);
      throw error;
    }
    await Notification.insertMany(ids.slice(1).map(user => ({ user, actor: req.user._id, kind: 'arena', text: `${req.user.name} mời bạn vào Đấu trường Toán học!` })));
    await broadcast(match);
    res.status(201).json(publicMatch(match.toObject(), req.user._id));
  }),
  get: wrap(async (req, res) => res.json(publicMatch(await participantMatch(req), req.user._id))),
  accept: wrap(async (req, res) => {
    await playHours();
    const match = await participantMatch(req);
    if (match.status !== 'waiting') fail('Phòng không còn chờ người chơi', 409);
    const updated = await ArenaMatch.findOneAndUpdate({ _id: match._id, status: 'waiting', expiresAt: { $gt: new Date() } }, { $set: { 'participants.$[me].accepted': true }, $inc: { revision: 1 } }, { arrayFilters: [{ 'me.user': req.user._id }], new: true }).lean();
    if (!updated) fail('Lời mời đã hết hạn', 409);
    await broadcast(updated); res.json(publicMatch(updated, req.user._id));
  }),
  cancel: wrap(async (req, res) => {
    const match = await participantMatch(req);
    const updated = await ArenaMatch.findOneAndUpdate({ _id: match._id, status: 'waiting' }, { $set: { status: 'cancelled', reason: `${req.user.name} đã hủy hoặc từ chối lời mời` }, $inc: { revision: 1 } }, { new: true }).lean();
    if (!updated) fail('Chỉ có thể hủy phòng đang chờ', 409);
    await ArenaSeat.deleteMany({ match: match._id }); await broadcast(updated);
    res.json(publicMatch(updated, req.user._id));
  }),
  start: wrap(async (req, res) => {
    await playHours();
    const match = await participantMatch(req);
    if (String(match.host) !== String(req.user._id)) fail('Chỉ chủ phòng được bắt đầu', 403);
    if (match.status !== 'waiting' || match.participants.some(p => !p.accepted)) fail('Cần tất cả người chơi đồng ý trước khi bắt đầu', 409);
    const cls = await Class.findOne({ _id: match.class, isActive: true }).lean();
    const users = await User.find({ _id: { $in: match.participants.map(p => p.user) }, role: 'student', isActive: true }).lean();
    if (!cls || classGrade(cls) !== match.grade || users.length !== match.participants.length || users.some(u => !cls.students.some(s => String(s) === String(u._id)))) fail('Khối lớp, danh sách lớp hoặc tài khoản đã thay đổi. Hãy tạo phòng mới.', 403);
    await requireGrade(match.grade);
    for (const user of users) if (!(await communityAccess(user)).allowed) fail('Có người chơi chưa hoàn thành bài tập', 403);
    const questions = await ArenaQuestion.aggregate([{ $match: { grade: match.grade, difficulty: match.difficulty, published: true, ...(match.chapters?.length ? { chapter: { $in: match.chapters } } : {}) } }, { $sample: { size: 30 } }]);
    if (questions.length < 10) fail('Kho câu hỏi cần ít nhất 10 câu đã công bố');
    const startsAt = new Date(Date.now() + 3000);
    const updated = await ArenaMatch.findOneAndUpdate({ _id: match._id, status: 'waiting', revision: match.revision, expiresAt: { $gt: new Date() } }, { $set: { status: 'active', questions, startsAt, deadline: new Date(startsAt.getTime() + 60000) }, $inc: { revision: 1 } }, { new: true }).lean();
    if (!updated) fail('Phòng vừa thay đổi. Hãy tải lại.', 409);
    await broadcast(updated); res.json(publicMatch(updated, req.user._id));
  }),
  answer: wrap(async (req, res) => {
    const { index, answer } = req.body;
    if (!Number.isInteger(index) || index < 0 || !(typeof answer === 'string' && answer.trim() && answer.length <= 100 || Number.isInteger(answer) && answer >= 0 && answer < 4)) fail('Đáp án không hợp lệ');
    for (let retry = 0; retry < 12; retry++) {
      const match = await participantMatch(req);
      if (match.status !== 'active') return res.json(publicMatch(match, req.user._id));
      const now = new Date();
      if (now < match.startsAt) fail('Trận đấu chưa bắt đầu', 409);
      const me = match.participants.find(p => String(p.user) === String(req.user._id));
      // Network retries never consume another question or grant extra points.
      if (index < me.index) return res.json(publicMatch(match, req.user._id));
      if (index !== me.index || !match.questions[index]) fail('Câu hỏi đã thay đổi hoặc đã hết câu hỏi', 409);
      if (me.lastAnsweredAt && now - me.lastAnsweredAt < 650) fail('Hãy đọc kỹ câu hỏi trước khi trả lời tiếp.', 429);
      const correct = isCorrect(match.questions[index], answer);
      const participants = match.participants.map(p => String(p.user) === String(req.user._id) ? { ...p, index: p.index + 1, score: p.score + (correct ? 1 : 0), lastAnswer: { index, correct }, lastAnsweredAt: now } : p);
      const won = scores({ participants })[me.team] >= TARGET;
      const changes = { participants, ...(won ? { status: 'finished', finishedAt: now, winner: me.team, reason: 'Chạm đích 10 điểm' } : {}) };
      const updated = await ArenaMatch.findOneAndUpdate({ _id: match._id, status: 'active', revision: match.revision, startsAt: { $lte: now }, deadline: { $gt: now } }, { $set: changes, $inc: { revision: 1 } }, { new: true }).lean();
      if (!updated) continue;
      if (won) { await ArenaSeat.deleteMany({ match: match._id }); await awards(updated); await broadcast(updated); }
      return res.json(publicMatch(updated, req.user._id));
    }
    fail('Trận đấu đang cập nhật. Hãy thử lại đáp án.', 409);
  }),
};
const generating = new Set();
const management = {
  chapters: wrap(async (req, res) => {
    const grade = Number(req.query.grade);
    await requireGrade(grade);
    res.json({ grade, chapters: await chapterList(grade) });
  }),
  list: wrap(async (req, res) => {
    const filter = {};
    if (req.query.grade) { const grade = Number(req.query.grade); if (!isGrade(grade)) fail('Khối không hợp lệ'); await requireGrade(grade); filter.grade = grade; }
    if (req.query.difficulty) { if (!DIFFICULTIES.includes(req.query.difficulty)) fail('Độ khó không hợp lệ'); filter.difficulty = req.query.difficulty; }
    if (req.query.chapter) { if (typeof req.query.chapter !== 'string' || req.query.chapter.length > 300) fail('Chương không hợp lệ'); filter.chapter = req.query.chapter; }
    const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
    const [questions, total, draftCount] = await Promise.all([ArenaQuestion.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(), ArenaQuestion.countDocuments(filter), ArenaQuestion.countDocuments({ ...filter, published: { $ne: true } })]);
    res.json({ questions, total, draftCount, page });
  }),
  publishAll: wrap(async (req, res) => {
    const { grade, difficulty, all, questionIds, excludedIds = [] } = req.body;
    if (!isGrade(grade) || !DIFFICULTIES.includes(difficulty)) fail('Chọn khối và độ khó cần công bố');
    await requireGrade(grade);
    const filter = { grade, difficulty, published: { $ne: true } };
    if (req.body.chapter) { if (typeof req.body.chapter !== 'string' || req.body.chapter.length > 300) fail('Chương không hợp lệ'); filter.chapter = req.body.chapter; }
    if (all === true) {
      if (questionIds !== undefined || !Array.isArray(excludedIds) || excludedIds.length > 10000) fail('Danh sách chọn không hợp lệ');
      filter._id = { $nin: excludedIds.map(id) };
    } else {
      if (all !== undefined && all !== false || !Array.isArray(questionIds) || questionIds.length === 0 || questionIds.length > 10000 || !Array.isArray(excludedIds) || excludedIds.length) fail('Hãy chọn ít nhất một câu nháp để công bố');
      filter._id = { $in: questionIds.map(id) };
    }
    const result = await ArenaQuestion.updateMany(filter, { $set: { published: true } });
    res.json({ publishedCount: result.modifiedCount });
  }),
  save: wrap(async (req, res) => {
    const question = validateQuestion(req.body);
    await requireGrade(question.grade);
    if (question.chapter && !(await chapterList(question.grade)).some(c => c.name === question.chapter)) fail('Chương không thuộc khối đã chọn');
    if (!req.params.id) return res.status(201).json(await ArenaQuestion.create(question));
    const updated = await ArenaQuestion.findByIdAndUpdate(id(req.params.id), { $set: question }, { new: true, runValidators: true });
    if (!updated) fail('Không tìm thấy câu hỏi', 404);
    res.json(updated);
  }),
  remove: wrap(async (req, res) => { const deleted = await ArenaQuestion.findByIdAndDelete(id(req.params.id)); if (!deleted) fail('Không tìm thấy câu hỏi', 404); res.json({ ok: true }); }),
  generate: wrap(async (req, res) => {
    const { grade, difficulty, count, topic } = req.body;
    if (!isGrade(grade) || !DIFFICULTIES.includes(difficulty) || !Number.isInteger(count) || count < 10 || count > 30 || typeof topic !== 'string' || !topic.trim() || topic.length > 300) fail('Chọn khối, độ khó, chủ đề và từ 10 đến 30 câu');
    await requireGrade(grade);
    const chapter = (await chapterList(grade)).find(chapter => chapter.name === topic);
    if (!chapter) fail('Chương không thuộc khối đã chọn hoặc vừa được đổi tên. Hãy tải lại danh sách chương.');
    const key = String(req.user._id);
    if (generating.has(key)) fail('Đang tạo câu hỏi, vui lòng đợi.', 429);
    generating.add(key);
    try {
      const raw = await lessonAI.generateWithGemini(`Tạo đúng ${count} câu hỏi Toán nhanh bằng tiếng Việt, khối ${grade}, độ khó ${difficulty}, chương đã chọn: ${chapter.name}. Các chủ đề trong chương (dữ liệu tham khảo): ${chapter.topics.join('; ') || 'Bám sát nội dung của chương'}. Mỗi câu giải trong khoảng 3-10 giây, đúng chương trình khối ${grade}, chỉ thuộc chương đã chọn. Trộn trắc nghiệm 4 lựa chọn khác nhau và điền đáp án ngắn. Với điền đáp án chỉ dùng số hoặc phân số, không đơn vị. Tự kiểm tra phép tính. Công thức dùng LaTeX trong $...$. Chỉ trả JSON không Markdown: {"questions":[{"kind":"choice","prompt":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."},{"kind":"short","prompt":"...","answer":"...","explanation":"..."}]}.`, { maxOutputTokens: 16000 });
      let parsed;
      try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { fail('Gemini chưa trả JSON hợp lệ. Hãy thử lại.', 502); }
      if (!Array.isArray(parsed.questions) || parsed.questions.length !== count) fail('Gemini chưa tạo đủ số câu. Hãy thử lại.', 502);
      res.json({ questions: parsed.questions.map(q => validateQuestion({ ...q, grade, difficulty, chapter: chapter.name, published: false })) });
    } finally { generating.delete(key); }
  }),
};
module.exports = { student, management, chapterList, playHours, wrap };
