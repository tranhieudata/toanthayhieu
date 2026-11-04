const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encryptToken, decryptToken, localTime, isQuiet, weekStart, websiteLink } = require('../src/services/telegramApi');
const { validateConfig, publicConfig } = require('../src/controllers/telegramController');
const { isAuthorized } = require('../src/services/telegramInteractions');
const { noteTasks } = require('../src/services/telegramData');
const { imageExtension } = require('../src/services/telegramUpload');
const { safeError } = require('../src/services/telegramWorker');

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

test('only the paired user in the paired private chat can operate the bot', () => {
  const config = { chatId: '12', telegramUserId: '12' };
  const message = { from: { id: 12 }, chat: { id: 12, type: 'private' } };
  assert(isAuthorized(config, { message }));
  assert(!isAuthorized(config, { message: { ...message, from: { id: 13 } } }));
  assert(!isAuthorized(config, { message: { ...message, chat: { id: 12, type: 'group' } } }));
  assert(!isAuthorized(config, { callback_query: { from: { id: 13 }, message } }));
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
