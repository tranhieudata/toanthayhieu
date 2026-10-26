function normalize(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function containsBanned(text, words) {
  const raw = String(text).normalize('NFC').toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const tokens = raw.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return words.some(word => {
    const original = String(word).normalize('NFC').toLowerCase().trim();
    if (!original) return false;
    const term = normalize(original);
    // Preserve accents in Vietnamese tokens: "lớn", "đủ" and "lợn" must remain valid.
    if (` ${tokens} `.includes(` ${original} `)) return true;
    const asciiTokens = tokens.replace(/đ/g, 'd').split(' ').map(t => /^[a-z0-9]+$/.test(t) ? t : '#').join(' ');
    if (` ${asciiTokens} `.includes(` ${term} `)) return true;
    // Match a banned word split by punctuation/spaces, with word boundaries.
    const escaped = [...original].filter(c => c !== ' ').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\p{P}]*');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(raw);
  });
}
function localDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function inCurfew(policy, now = new Date()) {
  if (!policy.curfewEnabled) return false;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return policy.curfewStart < policy.curfewEnd
    ? time >= policy.curfewStart && time < policy.curfewEnd
    : time >= policy.curfewStart || time < policy.curfewEnd;
}
const REWARDS = [
  { id: 'sticker-sprout', label: 'Sticker mầm xanh 🌱', cost: 30, type: 'sticker', value: '🌱' },
  { id: 'sticker-star', label: 'Sticker ngôi sao 🌟', cost: 40, type: 'sticker', value: '🌟' },
  { id: 'frame-green', label: 'Khung avatar xanh', cost: 80, type: 'frame' },
  { id: 'game-5', label: '5 phút game luyện trí nhớ', cost: 50, type: 'game' },
  { id: 'gift-small', label: 'Quà nhỏ từ thầy (admin xác nhận)', cost: 200, type: 'gift' },
];
module.exports = { normalize, containsBanned, localDay, inCurfew, REWARDS };
