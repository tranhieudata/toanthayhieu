const { TelegramAction, TelegramDelivery } = require('../models/Telegram');
const { telegramApi, websiteLink } = require('./telegramApi');
const { eventLink } = require('./telegramData');
const { replyChatId, contextRouting } = require('./telegramContext');

async function send(config, text, buttons = [], extra = {}) {
  return telegramApi(config, 'sendMessage', {
    chat_id: replyChatId(config), ...(config.replyThreadId ? { message_thread_id: config.replyThreadId } : {}), text: String(text).slice(0, 4000),
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}), ...extra,
  });
}

async function actionButton(config, text, type, payload, minutes = 1440) {
  const context = contextRouting(config);
  const action = await TelegramAction.create({ type, payload, chatId: replyChatId(config), userId: config.telegramUserId, threadId: config.replyThreadId || null, groupConnectionId: context.groupConnectionId, expiresAt: new Date(Date.now() + minutes * 60000) });
  return { text, callback_data: `a:${action._id}` };
}

const linkButton = (config, text, path, params) => ({ text, url: websiteLink(config, path, params) });

async function eventButtons(config, event, type = 'preparation') {
  const buttons = [[{ text: 'Mở buổi dạy', url: eventLink(config, event) }]];
  if (event.lessonId) buttons.push([
    await actionButton(config, 'Tóm tắt buổi dạy', 'summaryStart', { event }, 30),
    await actionButton(config, 'Nhập / lưu buổi dạy', 'summaryManual', { event }, 30),
  ]);
  if (event.status !== 'planned') return buttons;
  if (type === 'preparation') buttons.push([
    await actionButton(config, 'Đã chuẩn bị', 'prepared', { event }),
    await actionButton(config, 'Nhắc sau 15 phút', 'snooze', { event, type }),
  ]);
  if (type === 'journal' && event.sessionId) {
    buttons.push([
      await actionButton(config, 'Đã dạy xong', 'sessionStatus', { sessionId: event.sessionId, status: 'completed' }),
      await actionButton(config, 'Dạy một phần', 'sessionStatus', { sessionId: event.sessionId, status: 'partial' }),
    ]);
    buttons.push([await actionButton(config, 'Viết nhận xét', 'note', { sessionId: event.sessionId })]);
  }
  return buttons;
}

async function enqueue(key, payload, dueAt = new Date(), kind = 'message', routing = {}) {
  try {
    await TelegramDelivery.updateOne({ key }, { $setOnInsert: { key, kind, payload, dueAt, state: 'pending', ...routing } }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
}

module.exports = { send, actionButton, linkButton, eventButtons, enqueue };
