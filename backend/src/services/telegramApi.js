const crypto = require('crypto');

function encryptionKey() {
  const secret = process.env.TELEGRAM_ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error('Cần cấu hình TELEGRAM_ENCRYPTION_KEY hoặc JWT_SECRET trên máy chủ');
  return crypto.createHash('sha256').update(`telegram:${secret}`).digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(buffer => buffer.toString('base64')).join('.');
}

function decryptToken(value) {
  const [iv, tag, body] = String(value || '').split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

async function telegramApi(config, method, payload = {}) {
  const token = config.token || decryptToken(config.encryptedToken);
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('Không kết nối được Telegram. Hệ thống sẽ thử lại.'); }
  const data = await response.json();
  if (!response.ok || !data.ok) {
    // Do not echo remote request URLs or tokens into logs/UI.
    const error = new Error(`Telegram từ chối yêu cầu (${data.error_code || response.status}). Kiểm tra token, kết nối bot hoặc quyền gửi tin.`);
    error.retryAfter = Number(data.parameters?.retry_after) || 0;
    throw error;
  }
  return data.result;
}

function localTime(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const minuteOf = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
function isQuiet(config, now = new Date()) {
  const time = localTime(now).minutes, start = minuteOf(config.quietStart), end = minuteOf(config.quietEnd);
  if (start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}
const addDateDays = (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
function weekStart(date) {
  return addDateDays(date, -(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7);
}
function websiteLink(config, pathname, params) {
  const url = new URL(pathname, config.websiteUrl);
  if (params) for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, String(value));
  return url.href;
}

module.exports = { encryptToken, decryptToken, telegramApi, localTime, minuteOf, isQuiet, addDateDays, weekStart, websiteLink };
