const mongoose = require('mongoose');
const WeeklyTeachingPlan = require('../models/WeeklyTeachingPlan');
const Class = require('../models/Class');
const Lesson = require('../models/Lesson');
const { syncWeeklyTeachingSessions } = require('../services/syncWeeklyTeachingSessions');
const { resolveWeeklyPlanLessons } = require('../services/weeklyPlanLessons');

function validateWeekStart(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() !== 1) {
    throw new Error('Ngày bắt đầu tuần phải là thứ Hai hợp lệ');
  }
  return date;
}

function validateEntries(weekStart, entries) {
  const start = validateWeekStart(weekStart).getTime();
  if (!Array.isArray(entries) || entries.length > 500) throw new Error('Danh sách buổi dạy không hợp lệ');
  const keys = new Set();
  return entries.map(entry => {
    const date = new Date(`${entry.date}T00:00:00Z`);
    if (!mongoose.isValidObjectId(entry.class) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date || date.getTime() < start || date.getTime() >= start + 7 * 86400000) throw new Error('Buổi dạy phải thuộc tuần đang chọn và có lớp hợp lệ');
    if (![entry.startTime, entry.endTime].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) || entry.endTime <= entry.startTime) throw new Error('Giờ kết thúc phải sau giờ bắt đầu');
    const key = `${entry.class}:${entry.date}:${entry.startTime}`;
    if (keys.has(key)) throw new Error('Kế hoạch bị trùng buổi dạy');
    keys.add(key);
    if (typeof (entry.topic ?? '') !== 'string' || typeof (entry.note ?? '') !== 'string') throw new Error('Nội dung kế hoạch không hợp lệ');
    if ((entry.topic || '').length > 500 || (entry.note || '').length > 2000) throw new Error('Bài dự kiến tối đa 500 ký tự, ghi chú tối đa 2000 ký tự');
    if (entry.lesson && !mongoose.isValidObjectId(entry.lesson)) throw new Error('Bài dự kiến không hợp lệ');
    return { class: entry.class, date: entry.date, startTime: entry.startTime, endTime: entry.endTime, lesson: entry.lesson || null, topic: (entry.topic || '').trim(), note: (entry.note || '').trim() };
  });
}

const getWeeklyTeachingPlan = async (req, res) => {
  try {
    validateWeekStart(req.query.weekStart);
    const plan = await WeeklyTeachingPlan.findOne({ weekStart: req.query.weekStart });
    if (!plan) return res.json({ weekStart: req.query.weekStart, entries: [] });
    const obj = plan.toObject ? plan.toObject() : plan;
    res.json({ ...obj, entries: await resolveWeeklyPlanLessons(obj.entries || []) });
  } catch (err) { res.status(400).json({ message: err.message }); }
};

const saveWeeklyTeachingPlan = async (req, res) => {
  try {
    const { weekStart, entries } = req.body;
    const normalized = await resolveWeeklyPlanLessons(validateEntries(weekStart, entries));
    const selected = normalized.filter(entry => entry.lesson);
    if (selected.length) {
      const [classes, lessons] = await Promise.all([
        Class.find({ _id: { $in: [...new Set(selected.map(entry => entry.class))] } }).select('courses'),
        Lesson.find({ _id: { $in: [...new Set(selected.map(entry => entry.lesson))] } }).select('title course'),
      ]);
      const classMap = new Map(classes.map(cls => [String(cls._id), cls]));
      const lessonMap = new Map(lessons.map(lesson => [String(lesson._id), lesson]));
      for (const entry of selected) {
        const cls = classMap.get(String(entry.class));
        const lesson = lessonMap.get(String(entry.lesson));
        if (!cls || !lesson || !(cls.courses || []).some(course => String(course._id || course) === String(lesson.course?._id || lesson.course))) {
          throw new Error('Bài dự kiến phải thuộc khóa học có trong lớp đó');
        }
        entry.topic = lesson.title.slice(0, 500);
      }
    }
    const plan = await WeeklyTeachingPlan.findOneAndUpdate({ weekStart }, { $set: { entries: normalized, updatedBy: req.user._id } }, { upsert: true, new: true, runValidators: true });
    try {
      await syncWeeklyTeachingSessions(weekStart, normalized, req.user._id);
    } catch (err) {
      return res.status(500).json({ message: 'Kế hoạch đã lưu nhưng chưa đồng bộ được Buổi dạy. Vui lòng bấm lưu lại.', detail: err.message });
    }
    res.json(plan);
  } catch (err) { res.status(400).json({ message: err.message }); }
};

module.exports = { getWeeklyTeachingPlan, saveWeeklyTeachingPlan, validateWeekStart, validateEntries };
