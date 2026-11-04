const crypto = require('crypto');
const Class = require('../models/Class');
const WeeklyTeachingPlan = require('../models/WeeklyTeachingPlan');
const TeachingSession = require('../models/TeachingSession');
const ExamResult = require('../models/ExamResult');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const TuitionRecord = require('../models/TuitionRecord');
const { TelegramTask } = require('../models/Telegram');
const { resolveWeeklyPlanLessons } = require('./weeklyPlanLessons');
const { localTime, weekStart, addDateDays, websiteLink } = require('./telegramApi');

const idOf = value => String(value?._id || value || '');
const slotKey = entry => `${weekStart(entry.date)}:${idOf(entry.class)}:${entry.date}:${entry.startTime}`;
const sessionPath = event => ({ classId: event.classId, date: event.date, startTime: event.startTime, lessonId: event.lessonId, fromSchedule: '1' });
const eventLink = (config, event) => websiteLink(config, '/admin/teaching-sessions', sessionPath(event));

function noteTasks(note) {
  return String(note || '').split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\[[ xX]\])\s*/, '').trim()).filter(Boolean).slice(0, 20);
}

async function eventsForDate(date) {
  const [classes, plan, sessions] = await Promise.all([
    Class.find({ isActive: { $ne: false } }).select('name schedules courses startDate endDate').lean(),
    WeeklyTeachingPlan.findOne({ weekStart: weekStart(date) }).lean(),
    TeachingSession.find({ date: { $gte: new Date(`${date}T00:00:00Z`), $lt: new Date(`${addDateDays(date, 1)}T00:00:00Z`) } }).populate('plannedLesson actualLesson', 'title').populate('class', 'name').lean(),
  ]);
  const byClass = new Map(classes.map(cls => [idOf(cls), cls]));
  const entries = new Map();
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  for (const cls of classes) {
    if ((cls.startDate && date < new Date(cls.startDate).toISOString().slice(0, 10)) || (cls.endDate && date > new Date(cls.endDate).toISOString().slice(0, 10))) continue;
    for (const schedule of cls.schedules || []) {
      if (Number(schedule.dayOfWeek) !== day || !schedule.startTime || !schedule.endTime) continue;
      const entry = { class: cls._id, date, startTime: schedule.startTime, endTime: schedule.endTime };
      entries.set(slotKey(entry), entry);
    }
  }
  const plannedEntries = await resolveWeeklyPlanLessons((plan?.entries || []).filter(entry => entry.date === date));
  for (const entry of plannedEntries) entries.set(slotKey(entry), entry);
  for (const session of sessions) {
    if (!session.startTime) continue;
    const entry = { class: session.class, date, startTime: session.startTime, endTime: session.endTime };
    if (!entries.has(slotKey(entry))) entries.set(slotKey(entry), entry);
  }
  return [...entries.entries()].map(([key, entry]) => {
    const cls = byClass.get(idOf(entry.class));
    const session = sessions.find(item => item.weeklyPlanKey === key)
      || sessions.find(item => idOf(item.class) === idOf(entry.class) && item.startTime === entry.startTime);
    return {
      key, classId: idOf(entry.class), className: cls?.name || session?.class?.name || 'Lớp học', date,
      startTime: entry.startTime, endTime: entry.endTime,
      startAt: new Date(`${date}T${entry.startTime}:00+07:00`),
      endAt: new Date(`${date}T${entry.endTime || entry.startTime}:00+07:00`),
      lessonId: idOf(session?.actualLesson || entry.lesson || session?.plannedLesson),
      topic: session?.actualLesson?.title || entry.topic || session?.plannedLesson?.title || 'Chưa chọn bài dự kiến',
      note: entry.note || session?.planningNote || '', sessionId: session?._id,
      status: session?.status || 'planned',
    };
  }).filter(event => byClass.has(event.classId) && !['skipped', 'rescheduled'].includes(event.status)).sort((a, b) => a.startAt - b.startAt);
}

async function syncEventTasks(events) {
  for (const event of events) {
    const activeKeys = [];
    for (const text of noteTasks(event.note)) {
      const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 20);
      const key = `${event.key}:${hash}`;
      activeKeys.push(key);
      await TelegramTask.updateOne({ key }, { $set: { archivedAt: null }, $setOnInsert: {
        slotKey: event.key, text, session: event.sessionId, className: event.className,
        date: event.date, dueAt: event.startAt,
      } }, { upsert: true }).catch(error => { if (error.code !== 11000) throw error; });
    }
    await TelegramTask.updateMany({ slotKey: event.key, doneAt: null, key: { $nin: activeKeys } }, { $set: { archivedAt: new Date() } });
  }
}

async function pendingSubmissions(limit = 20, since = null) {
  const filter = { status: 'pending', 'submissionImages.0': { $exists: true }, ...(since ? { submittedAt: { $gte: new Date(since) } } : {}) };
  const [exams, homeworks, examCount, homeworkCount] = await Promise.all([
    ExamResult.find(filter).populate('exam', 'title').populate('student', 'name').populate('class', 'name').sort({ submittedAt: 1 }).limit(limit).lean(),
    HomeworkSubmission.find(filter).populate('homework', 'title').populate('student', 'name').populate('class', 'name').sort({ submittedAt: 1 }).limit(limit).lean(),
    ExamResult.countDocuments(filter), HomeworkSubmission.countDocuments(filter),
  ]);
  const items = [...exams.map(item => ({ ...item, kind: 'exam', exercise: item.exam })), ...homeworks.map(item => ({ ...item, kind: 'homework', exercise: item.homework }))].filter(item => item.exercise && item.student).sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0)).slice(0, limit);
  return { items, total: examCount + homeworkCount };
}

async function tuitionSummary(now = new Date()) {
  const date = localTime(now).date, month = Number(date.slice(5, 7)), year = Number(date.slice(0, 4));
  const records = await TuitionRecord.find({ month, year }).populate('class', 'name').lean();
  const unpaid = records.flatMap(record => (record.studentAdjustments || []).filter(student => !student.isPaid).map(student => ({
    className: record.class?.name || 'Lớp học', name: student.studentName || 'Học sinh',
    amount: Math.max(0, record.totalSessions - record.holidaySessions - student.absentSessions + student.extraSessions) * record.feePerSession,
  }))).filter(item => item.amount > 0);
  return `💳 Học phí tháng ${month}/${year}: ${unpaid.length} khoản chưa thanh toán.\n${unpaid.slice(0, 20).map(item => `• ${item.className} · ${item.name}: ${item.amount.toLocaleString('vi-VN')}đ`).join('\n')}${unpaid.length > 20 ? '\nXem thêm trên web.' : ''}`;
}

module.exports = { idOf, slotKey, noteTasks, eventsForDate, syncEventTasks, pendingSubmissions, tuitionSummary, eventLink };
