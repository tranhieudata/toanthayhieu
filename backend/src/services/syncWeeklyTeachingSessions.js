const TeachingSession = require('../models/TeachingSession');

const idOf = value => String(value?._id || value || '');

async function syncWeeklyTeachingSessions(weekStart, entries, userId) {
  const from = new Date(`${weekStart}T00:00:00Z`);
  const until = new Date(from.getTime() + 7 * 86400000);
  const existing = await TeachingSession.find({ date: { $gte: from, $lt: until } });
  const claimed = new Set();
  const selectedKeys = [];
  for (const entry of entries.filter(item => item.lesson)) {
    const key = `${weekStart}:${entry.class}:${entry.date}:${entry.startTime}`;
    selectedKeys.push(key);
    const current = existing.find(item => item.weeklyPlanKey === key)
      || existing.find(item => !item.weeklyPlanKey && !claimed.has(idOf(item))
        && idOf(item.class) === idOf(entry.class)
        && new Date(item.date).toISOString().slice(0, 10) === entry.date
        && idOf(item.actualLesson || item.plannedLesson) === idOf(entry.lesson)
        && (!item.startTime || item.startTime === entry.startTime));
    if (current) claimed.add(idOf(current));
    // A plan may update a draft, but never rewrite a taught session.
    if (current && current.status !== 'planned') continue;
    const fields = {
      weeklyPlanKey: key, class: entry.class, date: new Date(`${entry.date}T00:00:00Z`),
      startTime: entry.startTime, endTime: entry.endTime,
      plannedLesson: entry.lesson, actualLesson: null, planningNote: entry.note || '',
    };
    if (current) {
      await TeachingSession.updateOne({ _id: current._id, status: 'planned' }, { $set: fields });
    } else {
      await TeachingSession.updateOne({ weeklyPlanKey: key }, {
        $setOnInsert: { ...fields, status: 'planned', createdBy: userId },
      }, { upsert: true, runValidators: true });
    }
  }
  // Only remove drafts owned by this plan when their lesson/slot is cleared.
  await TeachingSession.deleteMany({ weeklyPlanKey: { $regex: `^${weekStart}:`, $nin: selectedKeys }, status: 'planned' });
}

module.exports = { syncWeeklyTeachingSessions };
