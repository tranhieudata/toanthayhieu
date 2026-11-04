const crypto = require('crypto');
const { TelegramConfig, TelegramDelivery, TelegramTask } = require('../models/Telegram');
const { telegramApi, isQuiet } = require('./telegramApi');
const { scheduleNotifications } = require('./telegramScheduler');
const { processUpdate, executeAiJob, submissionById, submissionButtons } = require('./telegramInteractions');
const { eventsForDate, noteTasks } = require('./telegramData');
const { send, eventButtons, actionButton, linkButton } = require('./telegramMessages');
const { executeSummaryJob } = require('./telegramTeachingSummary');
const { canDeliverNotification } = require('./telegramGroups');
const { deliveryContext, updateContext } = require('./telegramContext');

const safeError = error => String(error?.message || 'Không thực hiện được thao tác Telegram').replace(/\d+:[A-Za-z0-9_-]{20,}/g, '[ẩn token]').replace(/AIza[\w-]+/g, '[ẩn khóa]').slice(0, 500);

async function deliveryContent(config, delivery, now = new Date()) {
  const payload = delivery.payload;
  if (payload.expiresAt && new Date(payload.expiresAt) <= now) return null;
  if (payload.type === 'preparation' || payload.type === 'journal') {
    const event = (await eventsForDate(payload.event.date)).find(item => item.key === payload.event.key);
    if (!event || event.status !== 'planned') return null;
    if (payload.type === 'preparation') {
      if (now >= event.startAt || await TelegramTask.exists({ key: `prepared:${event.key}`, doneAt: { $ne: null } })) return null;
    }
    return { text: `${payload.type === 'journal' ? '📝 Buổi dạy chưa hoàn tất nhật ký' : '⏰ Chuẩn bị buổi dạy'}\n${event.startTime}–${event.endTime} · ${event.className}\n${event.topic}${event.note ? `\n${event.note}` : ''}`, buttons: await eventButtons(config, event, payload.type) };
  }
  if (payload.type === 'submission') {
    const item = await submissionById(payload.kind, payload.submissionId);
    if (item.status === 'graded') return null;
    return { text: payload.text, buttons: await submissionButtons(config, payload.kind, item) };
  }
  if (payload.type === 'task') {
    const task = await TelegramTask.findById(payload.taskId);
    if (!task || task.doneAt || task.archivedAt || task.dueAt > now) return null;
    const source = (await eventsForDate(task.date)).find(event => event.key === task.slotKey);
    if (!source || !noteTasks(source.note).includes(task.text)) {
      await TelegramTask.updateOne({ _id: task._id }, { $set: { archivedAt: new Date() } });
      return null;
    }
    return { text: payload.text, buttons: [[await actionButton(config, 'Hoàn thành', 'taskDone', { taskId: String(task._id) }), await actionButton(config, 'Dời sang ngày mai', 'taskPostpone', { taskId: String(task._id) })]] };
  }
  return { text: payload.text, buttons: [[linkButton(config, payload.type === 'tuition' ? 'Mở học phí' : payload.type === 'weekly' ? 'Lên kế hoạch tuần' : 'Mở lịch dạy', payload.type === 'tuition' ? '/admin/tuition' : '/admin')]] };
}

async function drainDeliveries(config, now = new Date()) {
  const quiet = isQuiet(config, now);
  // AI calls are not retried automatically after a crash to avoid charging twice.
  await TelegramDelivery.updateMany({ kind: { $in: ['ai', 'summary'] }, state: 'sending', lockedUntil: { $lt: now } }, { $set: { state: 'failed', lastError: 'Tác vụ bị gián đoạn. Kiểm tra kết quả trên web trước khi yêu cầu chạy lại.' } });
  for (let i = 0; i < 8; i += 1) {
    const current = await TelegramConfig.findOne({ key: 'default' });
    if (!current?.enabled || String(current.chatId) !== String(config.chatId)) break;
    const delivery = await TelegramDelivery.findOneAndUpdate({ ...(quiet ? { kind: { $in: ['ai', 'summary'] } } : {}), dueAt: { $lte: new Date() }, attempts: { $lt: 5 }, $or: [{ state: 'pending' }, { kind: { $nin: ['ai', 'summary'] }, state: 'sending', lockedUntil: { $lt: new Date() } }] }, { $set: { state: 'sending', lockedUntil: new Date(Date.now() + 10 * 60000) }, $inc: { attempts: 1 } }, { new: true, sort: { dueAt: 1 } });
    if (!delivery) break;
    try {
      if (!canDeliverNotification(current, delivery)) {
        await TelegramDelivery.updateOne({ _id: delivery._id }, { $set: { state: 'canceled' } });
        continue;
      }
      const context = deliveryContext(config, delivery);
      if (delivery.kind === 'ai' || delivery.kind === 'summary') {
        if (delivery.kind === 'summary') await executeSummaryJob(context, delivery.payload, require('./telegramInteractions').invokeController);
        else await executeAiJob(context, delivery.payload);
        await TelegramDelivery.updateOne({ _id: delivery._id }, { $set: { state: 'sent', sentAt: new Date() } });
      } else {
        const content = await deliveryContent(context, delivery);
        if (!content) { await TelegramDelivery.updateOne({ _id: delivery._id }, { $set: { state: 'canceled' } }); continue; }
        const isGroup = delivery.target === 'group';
        const recipient = isGroup ? { chat_id: delivery.targetChatId, ...(delivery.targetThreadId ? { message_thread_id: delivery.targetThreadId } : {}) } : {};
        const message = await send(context, content.text, content.buttons, recipient);
        await TelegramDelivery.updateOne({ _id: delivery._id }, { $set: { state: 'sent', messageId: message.message_id, chatId: isGroup ? delivery.targetChatId : config.chatId, botUsername: config.botUsername, sentAt: new Date(), lastError: '' } });
        if (isGroup) await TelegramConfig.updateOne({ key: 'default', groupChatId: delivery.targetChatId }, { $set: { groupLastError: '' } });
      }
    } catch (error) {
      const failed = ['ai', 'summary'].includes(delivery.kind) || delivery.attempts >= 5;
      await TelegramDelivery.updateOne({ _id: delivery._id }, { $set: { state: failed ? 'failed' : 'pending', lastError: safeError(error), dueAt: new Date(Date.now() + Math.max(error.retryAfter || 0, 30 * 2 ** delivery.attempts) * 1000) } });
      if (delivery.target === 'group') await TelegramConfig.updateOne({ key: 'default', groupChatId: delivery.targetChatId }, { $set: { groupLastError: safeError(error) } });
      if (delivery.kind === 'ai') await send(deliveryContext(config, delivery), `Chưa chấm được bài: ${safeError(error)}\nThầy có thể kiểm tra và chấm lại trên web.`).catch(() => {});
      if (delivery.kind === 'summary') await send(deliveryContext(config, delivery), `Chưa tạo được tóm tắt: ${safeError(error)}\nGõ /luubuoi để nhập thủ công hoặc /tomtat để tạo lại.`).catch(() => {});
      if (error.retryAfter) break;
    }
  }
}

function startTelegramWorker() {
  const owner = crypto.randomUUID();
  let running = false, stopped = false, lastSchedule = 0;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    let heartbeat;
    try {
      const config = await TelegramConfig.findOne({ key: 'default' }).select('+encryptedToken +pairingHash +groupPairingHash');
      if (!config?.encryptedToken) return;
      const lease = await TelegramConfig.findOneAndUpdate({ _id: config._id, $or: [{ leaseUntil: { $lt: new Date() } }, { leaseUntil: null }, { leaseOwner: owner }] }, { $set: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 90000) } }, { new: true });
      if (!lease) return;
      heartbeat = setInterval(() => TelegramConfig.updateOne({ _id: config._id, leaseOwner: owner }, { $set: { leaseUntil: new Date(Date.now() + 90000) } }).catch(() => {}), 20000);
      heartbeat.unref();
      const updates = await telegramApi(config, 'getUpdates', { offset: config.updateOffset, timeout: 0, limit: 20, allowed_updates: ['message', 'callback_query'] });
      for (const update of updates) {
        const latest = await TelegramConfig.findOne({ _id: config._id }).select('+encryptedToken +pairingHash +groupPairingHash');
        if (!latest || latest.encryptedToken !== config.encryptedToken) break;
        try { await processUpdate(latest, update); }
        catch (error) {
          const { isAuthorized } = require('./telegramInteractions');
          if (isAuthorized(latest, update)) await send(updateContext(latest, update), safeError(error)).catch(() => {});
        }
        await TelegramConfig.updateOne({ _id: config._id, encryptedToken: config.encryptedToken }, { $max: { updateOffset: update.update_id + 1 } });
      }
      const latest = await TelegramConfig.findOne({ _id: config._id }).select('+encryptedToken');
      if (latest?.enabled && latest.chatId && latest.encryptedToken === config.encryptedToken) {
        if (Date.now() - lastSchedule >= 60000) {
          await scheduleNotifications(latest);
          lastSchedule = Date.now();
        }
        await drainDeliveries(latest);
      }
      await TelegramConfig.updateOne({ _id: config._id }, { $set: { lastPollAt: new Date(), lastError: '' } });
    } catch (error) {
      await TelegramConfig.updateOne({ key: 'default' }, { $set: { lastError: safeError(error) } }).catch(() => {});
    } finally {
      clearInterval(heartbeat);
      await TelegramConfig.updateOne({ key: 'default', leaseOwner: owner }, { $set: { leaseUntil: new Date() } }).catch(() => {});
      running = false;
    }
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return () => { stopped = true; clearInterval(timer); };
}

module.exports = { startTelegramWorker, deliveryContent, drainDeliveries, safeError };
