const { TelegramTask } = require('../models/Telegram');
const { localTime, minuteOf, addDateDays } = require('./telegramApi');
const { eventsForDate, syncEventTasks, pendingSubmissions, tuitionSummary } = require('./telegramData');
const { enqueue } = require('./telegramMessages');

function eventText(event) {
  return `${event.startTime}–${event.endTime} · ${event.className}\n${event.topic}${event.note ? `\n${event.note}` : ''}`;
}

async function dailyText(date, evening = false) {
  const [events, pending, tasks] = await Promise.all([
    eventsForDate(date), pendingSubmissions(1),
    TelegramTask.countDocuments({ date: { $lte: date }, doneAt: null, archivedAt: null, dueAt: { $lte: new Date(`${date}T23:59:59+07:00`) } }),
  ]);
  const outstanding = events.filter(event => event.status === 'planned');
  return `${evening ? '🌙 Tổng kết cuối ngày' : '📚 Lịch dạy hôm nay'} ${date.split('-').reverse().join('/')}\n\n${events.length ? events.map(event => `${event.status === 'completed' ? '✅' : event.status === 'partial' ? '🟡' : '•'} ${eventText(event)}`).join('\n\n') : 'Hôm nay chưa có lịch dạy.'}\n\n${outstanding.length} buổi chưa hoàn tất nhật ký · ${pending.total} bài chưa chấm · ${tasks} việc chưa hoàn thành.`;
}

async function weeklyText(date) {
  const events = (await Promise.all(Array.from({ length: 7 }, (_, index) => eventsForDate(addDateDays(date, index))))).flat();
  const missing = events.filter(event => !event.lessonId);
  return `🗓 Kế hoạch tuần ${date.split('-').reverse().join('/')}\n${events.length} buổi · ${missing.length} buổi chưa chọn bài.\n\n${events.map(event => `${event.date.slice(8)}/${event.date.slice(5, 7)} · ${eventText(event)}`).join('\n\n') || 'Chưa có lịch học trong tuần.'}`;
}

async function scheduleNotifications(config, now = new Date()) {
  const { date, minutes } = localTime(now);
  const today = await eventsForDate(date);
  const tomorrow = await eventsForDate(addDateDays(date, 1));
  await syncEventTasks([...today, ...tomorrow]);
  const notifications = config.notifications || {};
  const expiry = new Date(`${addDateDays(date, 1)}T00:00:00+07:00`).toISOString();
  if (notifications.morning && minutes >= minuteOf(config.morningTime) && minutes < minuteOf(config.eveningTime)) {
    await enqueue(`morning:${date}`, { text: await dailyText(date), type: 'daily', expiresAt: expiry });
  }
  if (notifications.evening && minutes >= minuteOf(config.eveningTime)) {
    await enqueue(`evening:${date}`, { text: await dailyText(date, true), type: 'daily', expiresAt: expiry });
  }
  if (notifications.weekly && new Date(`${date}T00:00:00Z`).getUTCDay() === 0 && minutes >= minuteOf(config.weeklyTime)) {
    await enqueue(`weekly:${date}`, { text: await weeklyText(addDateDays(date, 1)), type: 'weekly', expiresAt: new Date(now.getTime() + 86400000).toISOString() });
  }
  for (const event of [...today, ...tomorrow]) {
    if (notifications.preparation && event.status === 'planned' && now >= new Date(event.startAt - config.beforeMinutes * 60000) && now < event.startAt) {
      await enqueue(`preparation:${event.key}`, { type: 'preparation', event, text: `⏰ Chuẩn bị buổi dạy\n${eventText(event)}`, expiresAt: event.startAt.toISOString() });
    }
    if (notifications.journal && event.status === 'planned' && now >= new Date(event.endAt.getTime() + config.afterMinutes * 60000) && now < new Date(event.endAt.getTime() + 6 * 3600000)) {
      await enqueue(`journal:${event.key}`, { type: 'journal', event, text: `📝 Buổi dạy chưa hoàn tất nhật ký\n${eventText(event)}`, expiresAt: new Date(event.endAt.getTime() + 6 * 3600000).toISOString() });
    }
  }
  if (notifications.grading) {
    const pending = await pendingSubmissions(1000, config.enabledAt || now);
    for (const item of pending.items) {
      if (new Date(item.submittedAt || item.createdAt) < new Date(config.enabledAt || now)) continue;
      const revision = new Date(item.submittedAt || item.createdAt).getTime();
      await enqueue(`submission:${item.kind}:${item._id}:${revision}`, { type: 'submission', kind: item.kind, submissionId: String(item._id), text: `📥 Bài làm mới cần chấm\n${item.class?.name || ''} · ${item.student.name}\n${item.exercise.title}` });
    }
  }
  if (notifications.tuition && Number(date.slice(8)) === config.tuitionDay && minutes >= minuteOf(config.morningTime)) {
    await enqueue(`tuition:${date.slice(0, 7)}`, { type: 'tuition', text: await tuitionSummary(now), expiresAt: expiry });
  }
  const postponed = await TelegramTask.find({ doneAt: null, archivedAt: null, dueAt: { $lte: now }, date: { $lt: date } }).limit(30).lean();
  for (const task of postponed) await enqueue(`task:${task._id}:${new Date(task.dueAt).getTime()}`, { type: 'task', taskId: String(task._id), text: `📌 Việc cần làm\n${task.className}: ${task.text}` });
}

module.exports = { scheduleNotifications, dailyText, weeklyText, eventText };
