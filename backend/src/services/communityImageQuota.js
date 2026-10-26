const { ImageUsage, Post } = require('../models/Community');
const { localDay } = require('../utils/communityRules');

function dayWindow(now = new Date()) {
  const day = localDay(now), start = new Date(`${day}T00:00:00+07:00`);
  return { day, start, end: new Date(start.getTime() + 86400000) };
}
async function usageFor(user, now) {
  const { day, start, end } = dayWindow(now);
  const existing = await ImageUsage.findOne({ user, day });
  if (existing) return existing;
  // Include photos posted before quotas were introduced, even if hidden or rejected.
  const count = await Post.countDocuments({ author: user, image: { $exists: true, $nin: ['', null] }, $or: [
    { imageDay: day }, { imageDay: { $exists: false }, createdAt: { $gte: start, $lt: end } },
  ] });
  try { return await ImageUsage.findOneAndUpdate({ user, day }, { $setOnInsert: { count } }, { upsert: true, new: true }); }
  catch (err) { if (err.code === 11000) return ImageUsage.findOne({ user, day }); throw err; }
}
function statusFor(settings, role, usage) {
  const enabled = settings.dailyImageLimitEnabled !== false && (settings.dailyImageLimitScope !== 'students' || role === 'student');
  const limit = settings.dailyImageLimit ?? 5;
  return { enabled, limit, used: usage.count, remaining: enabled ? Math.max(0, limit - usage.count) : null, day: usage.day, resetAt: dayWindow(new Date(`${usage.day}T12:00:00+07:00`)).end, timezone: 'Asia/Ho_Chi_Minh' };
}
async function imageQuota(user, settings, now = new Date()) {
  return statusFor(settings, user.role, await usageFor(user._id, now));
}
async function reserveImage(user, settings, now = new Date()) {
  const usage = await usageFor(user._id, now), before = statusFor(settings, user.role, usage);
  const updated = await ImageUsage.findOneAndUpdate({ _id: usage._id, ...(before.enabled ? { count: { $lt: before.limit } } : {}) }, { $inc: { count: 1 } }, { new: true });
  if (!updated) {
    const current = await ImageUsage.findById(usage._id);
    const err = new Error(`Bạn đã hết lượt đăng ảnh hôm nay (tối đa ${before.limit} ảnh/ngày). Lượt mới bắt đầu lúc 00:00 theo giờ Việt Nam.`);
    err.status = 429; err.code = 'DAILY_IMAGE_LIMIT'; err.imageQuota = statusFor(settings, user.role, current || usage);
    throw err;
  }
  return { id: updated._id, day: updated.day, quota: statusFor(settings, user.role, updated) };
}
async function releaseImage(reservation) {
  if (reservation) await ImageUsage.updateOne({ _id: reservation.id, count: { $gt: 0 } }, { $inc: { count: -1 } });
}
module.exports = { dayWindow, imageQuota, reserveImage, releaseImage };
