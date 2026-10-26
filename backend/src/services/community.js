const { Profile, Notification, Event } = require('../models/Community');
const { localDay } = require('../utils/communityRules');
async function emit(user, type, data = {}) {
  await Event.create({ user, type, data });
}
function subscribe(user, response, canAccess = async () => true) {
  let stopped = false, timer, since = new Date(Date.now() - 1000);
  const seen = new Map();
  async function poll() {
    try {
      if (!await canAccess()) {
        if (!stopped && !response.destroyed) { response.write('data: {"type":"access-revoked"}\n\n'); response.end(); }
        return;
      }
      const events = await Event.find({ user, createdAt: { $gte: since }, _id: { $nin: [...seen.keys()] } }).sort({ createdAt: 1, _id: 1 }).limit(100).lean();
      if (stopped || response.destroyed) return;
      for (const event of events) {
        response.write(`data: ${JSON.stringify({ type: event.type, ...event.data })}\n\n`);
        seen.set(String(event._id), event.createdAt.getTime());
      }
      // Overlap polls to cover concurrent writes without relying on per-process ObjectId order.
      if (events.length < 100) since = new Date(Math.max(since.getTime(), Date.now() - 5000));
      for (const [key, time] of seen) if (time < since.getTime()) seen.delete(key);
      timer = setTimeout(poll, events.length === 100 ? 0 : 1000);
    } catch (err) {
      if (!stopped) { console.error('[community] event stream:', err.message); response.end(); }
    }
  }
  poll();
  return () => { stopped = true; clearTimeout(timer); };
}
async function notify(user, actor, text, post, kind = 'activity') {
  if (String(user) === String(actor)) return;
  const notification = await Notification.create({ user, actor, text, post, kind });
  await emit(user, 'notification', { notificationId: String(notification._id) });
}
async function ensureProfile(user) {
  try { return await Profile.findOneAndUpdate({ user }, { $setOnInsert: { user } }, { upsert: true, new: true }); }
  catch (err) { if (err.code === 11000) return Profile.findOne({ user }); throw err; }
}
async function grant(user, key, points, community = false, water = false) {
  await ensureProfile(user);
  const inc = { energy: points, [community ? 'communityPoints' : 'studyPoints']: points };
  const update = { $inc: inc, $addToSet: { grantKeys: key } };
  if (water) { inc.growth = 1; update.$max = { lastWatered: new Date() }; }
  return Profile.findOneAndUpdate({ user, grantKeys: { $ne: key } }, update, { new: true });
}
async function waterDaily(user, source, points = 10) {
  const day = localDay();
  await grant(user, source, points);
  await grant(user, `water:${day}`, 0, false, true);
}
module.exports = { emit, subscribe, notify, ensureProfile, grant, waterDaily };
