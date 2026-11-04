const crypto = require('crypto');
const { TelegramConfig, TelegramDelivery, TelegramAction, TelegramConversation } = require('../models/Telegram');
const User = require('../models/User');
const { telegramApi } = require('./telegramApi');
const { send, enqueue } = require('./telegramMessages');

const groupTypes = ['morning', 'preparation', 'journal', 'weekly', 'grading', 'evening', 'tuition'];

function notificationType(delivery) {
  if (delivery.payload.notification) return delivery.payload.notification;
  const prefix = delivery.key?.split(':')[0];
  return prefix === 'submission' ? 'grading' : delivery.payload.type === 'task' ? 'preparation' : groupTypes.includes(prefix) ? prefix : delivery.payload.type;
}

async function enqueueNotification(config, key, payload, dueAt = new Date()) {
  const type = payload.notification || (key.startsWith('submission:') ? 'grading' : key.split(':')[0]);
  const body = { ...payload, notification: type };
  if (config.privateNotificationsEnabled !== false) await enqueue(key, body, dueAt);
  if (config.groupEnabled && config.groupChatId && config.groupNotifications?.[type]) {
    const connection = config.groupConnectionId || config.groupChatId;
    await enqueue(`${key}:group:${connection}`, body, dueAt, 'message', {
      target: 'group', targetChatId: config.groupChatId, targetThreadId: config.groupThreadId,
      groupConnectionId: connection,
    });
  }
}

function canDeliverNotification(config, delivery) {
  const type = notificationType(delivery);
  if (delivery.target === 'group') {
    const validDestination = Boolean(config.groupChatId && String(delivery.targetChatId) === String(config.groupChatId)
      && delivery.groupConnectionId === (config.groupConnectionId || config.groupChatId));
    if (delivery.interactive) return validDestination && String(delivery.requestedBy) === String(config.telegramUserId);
    return validDestination && Boolean(config.groupEnabled && config.groupNotifications?.[type] && config.notifications?.[type]);
  }
  // User-requested jobs and snoozes still work when automatic private alerts are off.
  if (delivery.kind !== 'message' || delivery.key?.startsWith('snooze:') || !groupTypes.includes(type)) return true;
  return config.privateNotificationsEnabled !== false && config.notifications?.[type] !== false;
}

async function beginGroupPairing(config) {
  if (!config.encryptedToken || !config.telegramUserId || !config.chatId) throw new Error('Kết nối tài khoản Telegram riêng trước khi liên kết nhóm');
  const code = crypto.randomBytes(18).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60000);
  await TelegramConfig.updateOne({ key: 'default' }, { $set: { groupPairingHash: crypto.createHash('sha256').update(code).digest('hex'), groupPairingExpiresAt: expiresAt, groupLastError: '' } });
  return { command: `/connectgroup@${config.botUsername} ${code}`, expiresAt, issuedAt: new Date(), addBotUrl: `https://t.me/${config.botUsername}?startgroup=true` };
}

async function processGroupUpdate(config, update) {
  const message = update.message;
  if (!message || !['group', 'supergroup'].includes(message.chat?.type)) return false;
  if (message.migrate_to_chat_id && String(message.chat.id) === String(config.groupChatId)) {
    const nextId = String(message.migrate_to_chat_id);
    const oldId = String(config.groupChatId);
    await TelegramConfig.updateOne({ key: 'default', groupChatId: config.groupChatId }, { $set: { groupChatId: nextId } });
    await TelegramDelivery.updateMany({ target: 'group', targetChatId: oldId, state: { $in: ['pending', 'sending'] } }, { $set: { targetChatId: nextId } });
    await TelegramAction.updateMany({ chatId: oldId }, { $set: { chatId: nextId } });
    const conversations = await TelegramConversation.find({ chatId: { $regex: `^${oldId}:` } });
    for (const state of conversations) await TelegramConversation.updateOne({ _id: state._id }, { $set: { chatId: `${nextId}${state.chatId.slice(oldId.length)}` } });
    return true;
  }
  const code = message.text?.match(/^\/connectgroup(?:@\w+)?\s+([a-f0-9]{36})$/)?.[1];
  if (!code) return false;
  if (String(message.from?.id) !== String(config.telegramUserId) || !config.groupPairingHash || !config.groupPairingExpiresAt || new Date(config.groupPairingExpiresAt) <= new Date()) return true;
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  if (hash !== config.groupPairingHash) return true;
  const admin = await User.findById(config.admin).select('role isActive');
  if (admin?.role !== 'admin' || admin.isActive === false) return true;
  try {
    const botId = config.botId || String((await telegramApi(config, 'getMe')).id);
    const [botMember, ownerMember] = await Promise.all([
      telegramApi(config, 'getChatMember', { chat_id: message.chat.id, user_id: Number(botId) }),
      telegramApi(config, 'getChatMember', { chat_id: message.chat.id, user_id: Number(config.telegramUserId) }),
    ]);
    if (!['administrator', 'creator'].includes(botMember.status)) throw new Error('Thêm bot làm quản trị viên của nhóm để xác minh và gửi thông báo');
    if (!['administrator', 'creator'].includes(ownerMember.status)) throw new Error('Tài khoản Telegram đã liên kết phải là chủ nhóm hoặc quản trị viên của nhóm');
    const connected = await TelegramConfig.findOneAndUpdate({ key: 'default', groupPairingHash: hash, groupPairingExpiresAt: { $gt: new Date() } }, { $set: {
      groupChatId: String(message.chat.id), groupTitle: String(message.chat.title || 'Nhóm Telegram').slice(0, 200),
      groupThreadId: message.message_thread_id || null, groupConnectionId: crypto.randomUUID(),
      groupConnectedAt: new Date(), groupEnabled: false, groupPairingHash: null, groupPairingExpiresAt: null, groupLastError: '', botId,
    } }, { new: true });
    if (connected) {
      const oldIds = [...new Set([config.groupChatId, connected.groupChatId].filter(Boolean))];
      await TelegramAction.deleteMany({ chatId: { $in: oldIds } });
      for (const id of oldIds) await TelegramConversation.deleteMany({ chatId: { $regex: `^${id}:` } });
      await TelegramDelivery.updateMany({ target: 'group', state: { $in: ['pending', 'sending'] } }, { $set: { state: 'canceled' } });
      await send(config, `✅ Đã liên kết nhóm “${connected.groupTitle}”. Vào Cài đặt → Telegram để chọn loại thông báo và bật gửi vào nhóm.`);
    }
  } catch (error) {
    await TelegramConfig.updateOne({ key: 'default' }, { $set: { groupLastError: error.message } });
    await send(config, `Chưa kết nối được nhóm: ${error.message}`);
  }
  return true;
}

module.exports = { groupTypes, notificationType, enqueueNotification, canDeliverNotification, beginGroupPairing, processGroupUpdate };
