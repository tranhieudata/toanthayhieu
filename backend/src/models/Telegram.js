const mongoose = require('mongoose');
const { Schema } = mongoose;

const configSchema = new Schema({
  key: { type: String, unique: true, default: 'default' },
  enabled: { type: Boolean, default: false },
  encryptedToken: { type: String, select: false },
  botUsername: String,
  chatId: String,
  telegramUserId: String,
  botId: String,
  privateNotificationsEnabled: { type: Boolean, default: true },
  groupEnabled: { type: Boolean, default: false },
  groupChatId: String,
  groupTitle: String,
  groupThreadId: Number,
  groupConnectionId: String,
  groupPairingHash: { type: String, select: false },
  groupPairingExpiresAt: Date,
  groupConnectedAt: Date,
  groupLastError: { type: String, default: '' },
  groupNotifications: {
    morning: { type: Boolean, default: true }, preparation: { type: Boolean, default: true },
    journal: { type: Boolean, default: true }, weekly: { type: Boolean, default: true },
    grading: { type: Boolean, default: false }, evening: { type: Boolean, default: true },
    tuition: { type: Boolean, default: false },
  },
  admin: { type: Schema.Types.ObjectId, ref: 'User' },
  websiteUrl: { type: String, default: '' },
  morningTime: { type: String, default: '07:00' },
  eveningTime: { type: String, default: '22:00' },
  weeklyTime: { type: String, default: '20:00' },
  quietStart: { type: String, default: '23:00' },
  quietEnd: { type: String, default: '06:30' },
  beforeMinutes: { type: Number, default: 60, min: 5, max: 240 },
  afterMinutes: { type: Number, default: 30, min: 5, max: 240 },
  tuitionDay: { type: Number, default: 5, min: 1, max: 28 },
  notifications: {
    morning: { type: Boolean, default: true }, preparation: { type: Boolean, default: true },
    journal: { type: Boolean, default: true }, weekly: { type: Boolean, default: true },
    grading: { type: Boolean, default: true }, evening: { type: Boolean, default: true },
    tuition: { type: Boolean, default: false },
  },
  pairingHash: { type: String, select: false },
  pairingExpiresAt: Date,
  updateOffset: { type: Number, default: 0 },
  connectedAt: Date,
  enabledAt: Date,
  lastPollAt: Date,
  lastError: { type: String, default: '' },
  leaseOwner: String,
  leaseUntil: Date,
}, { timestamps: true });

const deliverySchema = new Schema({
  key: { type: String, required: true, unique: true },
  kind: { type: String, default: 'message' },
  payload: Schema.Types.Mixed,
  state: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'canceled'], default: 'pending' },
  dueAt: { type: Date, default: Date.now, index: true },
  attempts: { type: Number, default: 0 },
  lockedUntil: Date,
  messageId: Number,
  chatId: String,
  botUsername: String,
  target: { type: String, enum: ['private', 'group'], default: 'private' },
  targetChatId: String,
  targetThreadId: Number,
  interactive: { type: Boolean, default: false },
  requestedBy: String,
  groupConnectionId: String,
  lastError: String,
  sentAt: Date,
}, { timestamps: true });
deliverySchema.index({ chatId: 1, botUsername: 1, messageId: 1 });

const actionSchema = new Schema({
  type: String, payload: Schema.Types.Mixed, chatId: String,
  userId: String, threadId: Number, groupConnectionId: String,
  consumedAt: Date, expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

const taskSchema = new Schema({
  key: { type: String, unique: true }, slotKey: String, text: String,
  session: { type: Schema.Types.ObjectId, ref: 'TeachingSession' },
  className: String, date: String,
  dueAt: Date, doneAt: Date,
  archivedAt: Date,
  preparedAt: Date,
}, { timestamps: true });

const conversationSchema = new Schema({
  chatId: { type: String, unique: true }, type: String, step: String,
  payload: { type: Schema.Types.Mixed, default: {} },
  files: { type: [String], default: [] },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

module.exports = {
  TelegramConfig: mongoose.model('TelegramConfig', configSchema),
  TelegramDelivery: mongoose.model('TelegramDelivery', deliverySchema),
  TelegramAction: mongoose.model('TelegramAction', actionSchema),
  TelegramTask: mongoose.model('TelegramTask', taskSchema),
  TelegramConversation: mongoose.model('TelegramConversation', conversationSchema),
};
