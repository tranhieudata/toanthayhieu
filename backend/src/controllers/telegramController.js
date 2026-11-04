const crypto = require('crypto');
const { TelegramConfig, TelegramDelivery, TelegramTask, TelegramAction, TelegramConversation } = require('../models/Telegram');
const { encryptToken, decryptToken, telegramApi } = require('../services/telegramApi');
const { beginGroupPairing } = require('../services/telegramGroups');

const fields = ['enabled', 'privateNotificationsEnabled', 'groupEnabled', 'websiteUrl', 'morningTime', 'eveningTime', 'weeklyTime', 'quietStart', 'quietEnd', 'beforeMinutes', 'afterMinutes', 'tuitionDay'];
const notificationNames = ['morning', 'preparation', 'journal', 'weekly', 'grading', 'evening', 'tuition'];

function publicConfig(config) {
  return {
    ...Object.fromEntries(fields.map(field => [field, config[field]])),
    notifications: config.notifications, botUsername: config.botUsername || '',
    hasToken: Boolean(config.encryptedToken || config.botUsername), connected: Boolean(config.chatId && config.telegramUserId),
    connectedAt: config.connectedAt, lastPollAt: config.lastPollAt, lastError: config.lastError || '',
    pairingExpiresAt: config.pairingExpiresAt,
    groupConnected: Boolean(config.groupChatId), groupTitle: config.groupTitle || '',
    groupChatId: config.groupChatId || '', groupThreadId: config.groupThreadId || null,
    groupConnectedAt: config.groupConnectedAt, groupPairingExpiresAt: config.groupPairingExpiresAt,
    groupNotifications: config.groupNotifications, groupLastError: config.groupLastError || '',
  };
}

function validateConfig(body) {
  const update = {};
  for (const field of fields) {
    if (!(field in body)) continue;
    const value = body[field];
    if (field.endsWith('Time') || field.startsWith('quiet')) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) throw new Error('Giờ thông báo phải có dạng HH:mm');
    } else if (['beforeMinutes', 'afterMinutes', 'tuitionDay'].includes(field)) {
      const max = field === 'tuitionDay' ? 28 : 240, min = field === 'tuitionDay' ? 1 : 5;
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Giá trị ${field} phải từ ${min} đến ${max}`);
    } else if (field === 'websiteUrl') {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Địa chỉ web phải là tên miền gốc, ví dụ https://toanthayhieu.vn');
      update[field] = url.origin;
      continue;
    } else if (['enabled', 'privateNotificationsEnabled', 'groupEnabled'].includes(field) && typeof value !== 'boolean') throw new Error('Trạng thái Telegram không hợp lệ');
    update[field] = value;
  }
  for (const name of notificationNames) {
    if (body.notifications && name in body.notifications) {
      if (typeof body.notifications[name] !== 'boolean') throw new Error('Cài đặt thông báo không hợp lệ');
      update[`notifications.${name}`] = body.notifications[name];
    }
    if (body.groupNotifications && name in body.groupNotifications) {
      if (typeof body.groupNotifications[name] !== 'boolean') throw new Error('Cài đặt thông báo nhóm không hợp lệ');
      update[`groupNotifications.${name}`] = body.groupNotifications[name];
    }
  }
  return update;
}

async function getConfig() {
  return TelegramConfig.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { websiteUrl: process.env.CLIENT_URL || 'http://localhost:5173' } }, { upsert: true, new: true }).select('+encryptedToken +pairingHash +groupPairingHash');
}

const getSettings = async (req, res) => {
  try { res.json(publicConfig(await getConfig())); }
  catch { res.status(500).json({ message: 'Không tải được cài đặt Telegram' }); }
};

const saveSettings = async (req, res) => {
  try {
    const config = await getConfig();
    const update = validateConfig(req.body);
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    let tokenChanged = Boolean(token);
    if (token && config.encryptedToken) {
      try { tokenChanged = token !== decryptToken(config.encryptedToken); } catch { /* Allow replacing a token after rotating the encryption key. */ }
    }
    if (tokenChanged) {
      if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Token Telegram không hợp lệ');
      const bot = await telegramApi({ token }, 'getMe');
      if (!bot.is_bot) throw new Error('Token phải thuộc Telegram Bot');
      update.encryptedToken = encryptToken(token);
      update.botUsername = bot.username;
      update.botId = String(bot.id);
      update.chatId = null;
      update.telegramUserId = null;
      update.enabled = false;
      update.pairingHash = null;
      update.updateOffset = 0;
      update.lastError = '';
      Object.assign(update, { groupEnabled: false, groupChatId: null, groupTitle: '', groupThreadId: null, groupConnectionId: null, groupPairingHash: null, groupPairingExpiresAt: null, groupLastError: '' });
    }
    if (update.enabled) {
      if (!config.encryptedToken || !config.chatId || !config.telegramUserId) throw new Error('Kết nối tài khoản Telegram trước khi bật thông báo');
      if (!config.enabled) update.enabledAt = new Date();
    }
    if (update.groupEnabled && !config.groupChatId) throw new Error('Liên kết nhóm Telegram trước khi bật gửi vào nhóm');
    const saved = await TelegramConfig.findOneAndUpdate({ key: 'default' }, { $set: update }, { new: true, runValidators: true }).select('+encryptedToken');
    if (update.encryptedToken) {
      await TelegramDelivery.updateMany({ state: { $in: ['pending', 'sending'] } }, { $set: { state: 'canceled' } });
      await TelegramAction.deleteMany({});
      await TelegramConversation.deleteMany({});
    }
    res.json(publicConfig(saved));
  } catch (err) { res.status(400).json({ message: err.message }); }
};

const pairAccount = async (req, res) => {
  try {
    const config = await getConfig();
    if (!config.encryptedToken) throw new Error('Lưu Bot Token trước');
    const webhook = await telegramApi(config, 'getWebhookInfo');
    if (webhook.url) throw new Error('Bot này đang dùng webhook. Hãy dùng một bot riêng cho website hoặc gỡ webhook cũ trước khi kết nối.');
    const code = crypto.randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60000);
    await TelegramConfig.updateOne({ key: 'default' }, { $set: { admin: req.user._id, pairingHash: crypto.createHash('sha256').update(code).digest('hex'), pairingExpiresAt: expiresAt } });
    res.json({ url: `https://t.me/${config.botUsername}?start=${code}`, expiresAt });
  } catch (err) { res.status(400).json({ message: err.message }); }
};

const disconnect = async (req, res) => {
  try {
    await TelegramConfig.updateOne({ key: 'default' }, { $set: { enabled: false, chatId: null, telegramUserId: null, pairingHash: null, pairingExpiresAt: null, groupEnabled: false, groupChatId: null, groupTitle: '', groupThreadId: null, groupConnectionId: null, groupPairingHash: null, groupPairingExpiresAt: null } });
    await TelegramDelivery.updateMany({ state: { $in: ['pending', 'sending'] } }, { $set: { state: 'canceled' } });
    await TelegramAction.deleteMany({});
    await TelegramConversation.deleteMany({});
    res.json({ message: 'Đã ngắt kết nối Telegram' });
  } catch { res.status(500).json({ message: 'Không ngắt được kết nối Telegram' }); }
};

const testMessage = async (req, res) => {
  try {
    const config = await getConfig();
    if (!config.chatId) throw new Error('Chưa kết nối tài khoản Telegram');
    await telegramApi(config, 'sendMessage', { chat_id: config.chatId, text: '✅ Toán Thầy Hiếu đã kết nối Telegram. Gõ /homnay để xem lịch, /tuan để xem kế hoạch, /chuacham để xem bài cần chấm, /help để xem các lệnh.' });
    res.json({ message: 'Đã gửi tin nhắn thử' });
  } catch (err) { res.status(400).json({ message: err.message }); }
};

const pairGroup = async (req, res) => {
  try { res.json(await beginGroupPairing(await getConfig())); }
  catch (err) { res.status(400).json({ message: err.message }); }
};

const disconnectGroup = async (req, res) => {
  try {
    const previous = await TelegramConfig.findOne({ key: 'default' });
    await TelegramConfig.updateOne({ key: 'default' }, { $set: { groupEnabled: false, groupChatId: null, groupTitle: '', groupThreadId: null, groupConnectionId: null, groupPairingHash: null, groupPairingExpiresAt: null, groupLastError: '' } });
    await TelegramDelivery.updateMany({ target: 'group', state: { $in: ['pending', 'sending'] } }, { $set: { state: 'canceled' } });
    if (previous?.groupChatId) {
      await TelegramAction.deleteMany({ chatId: previous.groupChatId });
      await TelegramConversation.deleteMany({ chatId: { $regex: `^${previous.groupChatId}:` } });
    }
    res.json({ message: 'Đã ngắt kết nối nhóm' });
  } catch { res.status(500).json({ message: 'Không ngắt được kết nối nhóm' }); }
};

const testGroup = async (req, res) => {
  try {
    const config = await getConfig();
    if (!config.groupChatId) throw new Error('Chưa kết nối nhóm Telegram');
    await telegramApi(config, 'sendMessage', { chat_id: config.groupChatId, ...(config.groupThreadId ? { message_thread_id: config.groupThreadId } : {}), text: '✅ Nhóm đã kết nối thông báo tự động từ Toán Thầy Hiếu. Nội dung và lịch gửi được cấu hình trên website.' });
    await TelegramConfig.updateOne({ key: 'default' }, { $set: { groupLastError: '' } });
    res.json({ message: 'Đã gửi tin nhắn thử vào nhóm' });
  } catch (err) { res.status(400).json({ message: err.message }); }
};

const getActivity = async (req, res) => {
  try {
    const [deliveries, tasks] = await Promise.all([
      TelegramDelivery.find().sort({ createdAt: -1 }).limit(30).select('kind state target targetChatId lastError sentAt createdAt attempts payload.text').lean(),
      TelegramTask.find({ doneAt: null, archivedAt: null }).sort({ dueAt: 1 }).limit(50).lean(),
    ]);
    res.json({ deliveries, tasks });
  } catch { res.status(500).json({ message: 'Không tải được hoạt động Telegram' }); }
};

const completeTask = async (req, res) => {
  try {
    const task = await TelegramTask.findByIdAndUpdate(req.params.id, { $set: { doneAt: new Date() } }, { new: true });
    if (!task) return res.status(404).json({ message: 'Không tìm thấy công việc' });
    res.json(task);
  } catch { res.status(400).json({ message: 'Không cập nhật được công việc' }); }
};

module.exports = { getSettings, saveSettings, pairAccount, disconnect, testMessage, pairGroup, disconnectGroup, testGroup, getActivity, completeTask, publicConfig, validateConfig, getConfig };
