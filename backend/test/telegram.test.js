const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encryptToken, decryptToken, localTime, isQuiet, weekStart, websiteLink } = require('../src/services/telegramApi');
const { validateConfig, publicConfig } = require('../src/controllers/telegramController');
const { isAuthorized } = require('../src/services/telegramInteractions');
const { noteTasks } = require('../src/services/telegramData');
const { imageExtension } = require('../src/services/telegramUpload');
const { safeError } = require('../src/services/telegramWorker');
const { summaryDate } = require('../src/services/telegramTeachingSummary');
const { canDeliverNotification } = require('../src/services/telegramGroups');
const { updateContext, conversationChatId, contextRouting } = require('../src/services/telegramContext');

test('tokens are encrypted with authenticated encryption and never returned in settings', t => {
  const previous = process.env.TELEGRAM_ENCRYPTION_KEY;
  process.env.TELEGRAM_ENCRYPTION_KEY = 'test-encryption-key';
  t.after(() => { if (previous === undefined) delete process.env.TELEGRAM_ENCRYPTION_KEY; else process.env.TELEGRAM_ENCRYPTION_KEY = previous; });
  const token = '123456:abcdefghijklmnopqrstuvwxyz123456';
  const encrypted = encryptToken(token);
  assert.equal(decryptToken(encrypted), token);
  assert(!encrypted.includes(token));
  assert.notEqual(encryptToken(token), encrypted);
  const parts = encrypted.split('.'); parts[1] = Buffer.alloc(16).toString('base64');
  assert.throws(() => decryptToken(parts.join('.')));
  const output = JSON.stringify(publicConfig({ encryptedToken: encrypted, pairingHash: 'secret', chatId: '123', telegramUserId: '123', enabled: true }));
  assert(!output.includes(encrypted)); assert(!output.includes('secret')); assert(!output.includes('chatId'));
});

test('Vietnam dates, quiet windows and Monday calculations ignore server timezone', () => {
  assert.deepEqual(localTime(new Date('2026-11-03T18:30:00Z')), { date: '2026-11-04', time: '01:30', minutes: 90 });
  assert.equal(weekStart('2026-11-08'), '2026-11-02');
  assert.equal(weekStart('2026-11-09'), '2026-11-09');
  const config = { quietStart: '23:00', quietEnd: '06:30' };
  assert(isQuiet(config, new Date('2026-11-03T18:30:00Z')));
  assert(!isQuiet(config, new Date('2026-11-04T03:00:00Z')));
  assert(!isQuiet({ quietStart: '00:00', quietEnd: '00:00' }));
});

test('only the paired user can operate the bot in private or its linked group', () => {
  const config = { chatId: '12', telegramUserId: '12', groupChatId: '-100' };
  const message = { from: { id: 12 }, chat: { id: 12, type: 'private' } };
  assert(isAuthorized(config, { message }));
  assert(!isAuthorized(config, { message: { ...message, from: { id: 13 } } }));
  assert(!isAuthorized(config, { message: { ...message, chat: { id: 12, type: 'group' } } }));
  assert(!isAuthorized(config, { callback_query: { from: { id: 13 }, message } }));
  assert(isAuthorized(config, { message: { ...message, chat: { id: -100, type: 'supergroup' } } }));
  assert(!isAuthorized(config, { message: { ...message, chat: { id: -200, type: 'supergroup' } } }));
  assert(!isAuthorized(config, { message: { from: { id: 13 }, chat: { id: -100, type: 'supergroup' } } }));
});

test('configuration rejects invalid URLs, times and limits', () => {
  assert.equal(validateConfig({ websiteUrl: 'https://example.com/', beforeMinutes: 60 }).websiteUrl, 'https://example.com');
  for (const body of [{ websiteUrl: 'javascript:alert(1)' }, { websiteUrl: 'https://user:pass@example.com' }, { morningTime: '25:00' }, { beforeMinutes: 0 }, { tuitionDay: 31 }, { notifications: { morning: 'yes' } }, { enabled: 'yes' }]) assert.throws(() => validateConfig(body));
  assert.deepEqual(validateConfig({ encryptedToken: 'attempt', chatId: 'attempt' }), {});
  assert.equal(websiteLink({ websiteUrl: 'https://example.com' }, '/admin/teaching-sessions', { classId: 'class', date: '2026-11-04' }), 'https://example.com/admin/teaching-sessions?classId=class&date=2026-11-04');
});

test('task parser, image validation and error messages preserve expected boundaries', () => {
  assert.deepEqual(noteTasks('- Prepare exam\n• Print papers\n\n'), ['Prepare exam', 'Print papers']);
  assert.equal(imageExtension(Buffer.from([255, 216, 255, 0])), '.jpg');
  assert.throws(() => imageExtension(Buffer.from('<script>')));
  assert(!safeError(new Error('123456:abcdefghijklmnopqrstuvwxyz123456')).includes('abcdefghijklmnopqrstuvwxyz'));
});

test('teaching summary commands accept explicit dates without rolling invalid dates', () => {
  assert.equal(summaryDate('04/11/2026'), '2026-11-04');
  assert.equal(summaryDate('2026-11-04'), '2026-11-04');
  for (const date of ['31/02/2026', '2026-13-01', 'bad']) assert.throws(() => summaryDate(date));
});

test('group deliveries require a verified destination while interactive jobs ignore notification preferences', () => {
  const config = { groupEnabled: true, groupChatId: '-100', groupConnectionId: 'connection', groupNotifications: { morning: true }, notifications: { morning: true } };
  const delivery = { target: 'group', targetChatId: '-100', groupConnectionId: 'connection', payload: { notification: 'morning' } };
  assert(canDeliverNotification(config, delivery));
  assert(!canDeliverNotification(config, { ...delivery, targetChatId: '-200' }));
  assert(!canDeliverNotification(config, { ...delivery, groupConnectionId: 'old-connection' }));
  assert(!canDeliverNotification({ ...config, groupEnabled: false }, delivery));
  const interactive = { ...delivery, interactive: true, requestedBy: '12', kind: 'summary' };
  assert(canDeliverNotification({ ...config, telegramUserId: '12', groupEnabled: false }, interactive));
  assert(!canDeliverNotification({ ...config, telegramUserId: '13' }, interactive));
  assert.throws(() => validateConfig({ groupEnabled: 'yes' }));
  assert.throws(() => validateConfig({ groupNotifications: { morning: 'yes' } }));
  assert.deepEqual(validateConfig({ groupChatId: '-forged', groupConnectionId: 'forged' }), {});
});

test('private chat, group and forum topics keep separate reply and conversation contexts', () => {
  const config = { chatId: '12', telegramUserId: '12', groupChatId: '-100', groupConnectionId: 'connection' };
  const first = updateContext(config, { message: { chat: { id: -100 }, message_thread_id: 77 } });
  const second = updateContext(config, { message: { chat: { id: -100 }, message_thread_id: 78 } });
  assert.equal(conversationChatId(config), '12');
  assert.notEqual(conversationChatId(first), conversationChatId(config));
  assert.notEqual(conversationChatId(first), conversationChatId(second));
  assert.equal(contextRouting(first).targetChatId, '-100');
  assert.equal(contextRouting(first).targetThreadId, 77);
  assert.equal(contextRouting(first).requestedBy, '12');
});
