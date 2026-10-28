const router = require('express').Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const multer = require('multer');
const { protect, adminOnly } = require('../middleware/auth');
const User = require('../models/User');
const Class = require('../models/Class');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const { Policy, Post, Comment, Reaction, Message, Friendship, Notification, Profile, Challenge, Attempt, MonthlyAward } = require('../models/Community');
const { containsBanned, localDay, inCurfew, REWARDS } = require('../utils/communityRules');
const { emit, subscribe, notify, ensureProfile, grant, waterDaily } = require('../services/community');
const { imageQuota, reserveImage, releaseImage } = require('../services/communityImageQuota');
const { communityAccess } = require('../services/communityAccess');
const { student: gardenReview } = require('../controllers/gardenReviewController');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400) => { const err = new Error(message); err.status = status; throw err; };
const id = value => { if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) fail('Mã không hợp lệ'); return value; };
const policy = async () => {
  try { return await Policy.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true, new: true }); }
  catch (err) { if (err.code === 11000) return Policy.findOne({ key: 'default' }); throw err; }
};
const visible = () => ({ status: 'approved', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
const student = async value => {
  const found = await User.findOne({ _id: id(value), role: 'student', isActive: true }).select('name avatar');
  if (!found) fail('Không tìm thấy học sinh', 404);
  return found;
};
const communityMember = async value => {
  const found = await User.findOne({ _id: id(value), role: { $in: ['student', 'admin'] }, isActive: true }).select('name avatar role');
  if (!found) fail('Không tìm thấy tài khoản đang hoạt động', 404);
  return found;
};
async function checkContent(req, value, max = 3000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`Nội dung cần từ 1 đến ${max} ký tự`);
  const settings = await policy();
  if (inCurfew(settings) && req.user.role !== 'admin') fail(`Giờ nghỉ ${settings.curfewStart}–${settings.curfewEnd}: tạm dừng đăng bài, bình luận và chat.`, 403);
  if (containsBanned(value, settings.bannedWords)) fail('Nội dung có từ ngữ bị cấm. Hãy diễn đạt tích cực hơn.');
  return value.trim();
}
const limits = new Map();
router.use(protect, (req, res, next) => {
  if (!req.user.isActive) return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
  if (req.method !== 'GET') {
    const key = String(req.user._id), now = Date.now();
    const entry = limits.get(key);
    if (!entry || entry.until < now) limits.set(key, { count: 1, until: now + 60000 });
    else if (++entry.count > 45) return res.status(429).json({ message: 'Bạn thao tác quá nhanh. Hãy thử lại sau một phút.' });
    if (limits.size > 10000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  }
  next();
});
router.get('/access', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await communityAccess(req.user));
}));
router.use(wrap(async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  const access = await communityAccess(req.user);
  if (!access.allowed) return res.status(403).json({ code: 'HOMEWORK_REQUIRED', message: 'Hoàn thành tất cả bài tập để vào mạng xã hội.', ...access });
  next();
}));
router.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');
  const unsubscribe = subscribe(req.user._id, res, async () => (await communityAccess(req.user)).allowed);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  // Reauthenticate periodically rather than keeping a revoked session open forever.
  const expiry = setTimeout(() => res.end(), 5 * 60000);
  res.on('close', () => { unsubscribe(); clearInterval(heartbeat); clearTimeout(expiry); });
});
router.use('/arena', require('./mathArena'));
router.get('/policy', wrap(async (req, res) => {
  const p = await policy();
  res.json({ curfewEnabled: p.curfewEnabled, curfewStart: p.curfewStart, curfewEnd: p.curfewEnd, inCurfew: inCurfew(p), timezone: 'Asia/Ho_Chi_Minh', dailyImageLimitEnabled: p.dailyImageLimitEnabled, dailyImageLimit: p.dailyImageLimit, dailyImageLimitScope: p.dailyImageLimitScope });
}));
router.get('/image-quota', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await imageQuota(req.user, await policy()));
}));
router.get(['/people', '/students'], wrap(async (req, res) => {
  const search = String(req.query.q || '').slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  res.json(await User.find({ role: { $in: ['student', 'admin'] }, isActive: true, ...(search ? { name: { $regex: search, $options: 'i' } } : {}) }).select('name avatar role').sort({ role: 1, name: 1, _id: 1 }).limit(100));
}));

router.get('/people/:id/wall', wrap(async (req, res) => {
  const person = await communityMember(req.params.id);
  const [profile, awards, postCount] = await Promise.all([
    Profile.findOne({ user: person._id }).select('studyPoints communityPoints growth lastWatered inventory equippedFrame').lean(),
    MonthlyAward.find({ student: person._id }).select('month gift -_id').sort({ month: -1 }).lean(),
    Post.countDocuments({ ...visible(), author: person._id, kind: { $ne: 'story' } }),
  ]);
  const garden = {
    studyPoints: profile?.studyPoints || 0, communityPoints: profile?.communityPoints || 0,
    growth: profile?.growth || 0, lastWatered: profile?.lastWatered || null,
    needsWater: !profile?.lastWatered || Date.now() - new Date(profile.lastWatered).getTime() >= 3 * 86400000,
    equippedFrame: profile?.equippedFrame || '',
    rewards: REWARDS.filter(reward => profile?.inventory?.includes(reward.id)).map(({ id, label, type }) => ({ id, label, type })),
  };
  res.json({ person, garden, awards, postCount });
}));

const pair = (user, peer) => {
  const [userA, userB] = [String(user), id(peer)].sort();
  if (userA === userB) fail('Bạn không thể kết bạn hoặc chat với chính mình');
  return { userA, userB };
};
const memberships = user => ({ $or: [{ userA: user }, { userB: user }] });
async function requireFriend(req, value) {
  const peer = await communityMember(value);
  if (!await Friendship.exists({ ...pair(req.user._id, value), status: 'accepted' })) fail('Bạn cần kết bạn và được chấp nhận trước khi trò chuyện', 403);
  return peer;
}
async function friendIds(user) {
  const rows = await Friendship.find({ ...memberships(user), status: 'accepted' }).lean();
  const ids = rows.map(row => String(row.userA) === String(user) ? row.userB : row.userA);
  return User.find({ _id: { $in: ids }, role: { $in: ['student', 'admin'] }, isActive: true }).distinct('_id');
}
async function friendshipChanged(user, peer) {
  await Promise.all([emit(user, 'friendship'), emit(peer, 'friendship')]);
}
router.get('/friends', wrap(async (req, res) => {
  const rows = await Friendship.find(memberships(req.user._id)).populate('userA userB', 'name avatar role isActive').lean();
  const result = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const peer = String(row.userA?._id) === String(req.user._id) ? row.userB : row.userA;
    if (!peer || !peer.isActive || !['student', 'admin'].includes(peer.role)) continue;
    const safe = { _id: peer._id, name: peer.name, avatar: peer.avatar, role: peer.role };
    result[row.status === 'accepted' ? 'friends' : String(row.requestedBy) === String(req.user._id) ? 'outgoing' : 'incoming'].push(safe);
  }
  res.json(result);
}));
router.post('/friends/:peer/request', wrap(async (req, res) => {
  const key = pair(req.user._id, req.params.peer), peer = await communityMember(req.params.peer);
  const previous = await Friendship.findOneAndUpdate(key, { $setOnInsert: { requestedBy: req.user._id, status: 'pending' } }, { upsert: true, new: false });
  if (previous?.status === 'accepted') fail('Hai bạn đã là bạn bè', 409);
  if (previous && String(previous.requestedBy) !== String(req.user._id)) fail('Bạn đã nhận lời mời từ người này. Hãy chấp nhận lời mời.', 409);
  if (previous) return res.json({ success: true });
  await notify(peer._id, req.user._id, `${req.user.name} đã gửi lời mời kết bạn`, undefined, 'friendship');
  await friendshipChanged(req.user._id, peer._id);
  res.json({ success: true });
}));
router.post('/friends/:peer/accept', wrap(async (req, res) => {
  const key = pair(req.user._id, req.params.peer), peer = await communityMember(req.params.peer);
  const row = await Friendship.findOneAndUpdate({ ...key, requestedBy: peer._id, status: 'pending' }, { status: 'accepted' }, { new: true });
  if (!row) fail('Không có lời mời đang chờ từ người này', 403);
  await notify(peer._id, req.user._id, `${req.user.name} đã chấp nhận lời mời kết bạn`, undefined, 'friendship');
  await friendshipChanged(req.user._id, peer._id);
  res.json({ success: true });
}));
router.delete('/friends/:peer', wrap(async (req, res) => {
  const row = await Friendship.findOneAndDelete(pair(req.user._id, req.params.peer));
  if (!row) fail('Không tìm thấy kết bạn hoặc lời mời', 404);
  await friendshipChanged(req.user._id, req.params.peer);
  res.json({ success: true });
}));

// Social images live outside public /uploads. Only approved images (or owner/admin) are served.
const imageDir = path.resolve(__dirname, '../../community-uploads');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
router.post('/posts', upload.single('image'), wrap(async (req, res) => {
  const text = await checkContent(req, req.body.text);
  const kind = req.body.kind || 'study';
  if (!['study', 'question', 'story'].includes(kind)) fail('Loại bài đăng không hợp lệ');
  let image = '', reservation;
  if (req.file) {
    const bytes = req.file.buffer;
    const ext = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'jpg'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : '';
    if (!ext) fail('Ảnh không hợp lệ. Chỉ dùng JPEG, PNG hoặc WebP.');
    await fs.mkdir(imageDir, { recursive: true });
    reservation = await reserveImage(req.user, await policy());
    image = `${crypto.randomUUID()}.${ext}`;
  } else if (req.body.hasImage === 'true') fail('Ảnh không hợp lệ hoặc quá lớn');
  let post;
  try {
    if (image) await fs.writeFile(path.join(imageDir, image), req.file.buffer);
    post = await Post.create({ author: req.user._id, text, kind, image, ...(reservation ? { imageDay: reservation.day } : {}), status: image ? 'pending' : 'approved', ...(kind === 'story' ? { expiresAt: new Date(Date.now() + 86400000) } : {}) });
  } catch (err) {
    if (image) await fs.unlink(path.join(imageDir, image)).catch(() => {});
    await releaseImage(reservation);
    throw err;
  }
  res.status(201).json({ ...post.toObject(), ...(reservation ? { imageQuota: reservation.quota } : {}) });
}));
router.get('/posts/:id/image', wrap(async (req, res) => {
  const post = await Post.findById(id(req.params.id));
  if (!post || !post.image) fail('Không tìm thấy ảnh', 404);
  const owner = String(post.author) === String(req.user._id) || req.user.role === 'admin';
  if (!owner && (post.status !== 'approved' || (post.expiresAt && post.expiresAt <= new Date()))) fail('Ảnh chưa được duyệt hoặc đã hết hạn', 403);
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(path.join(imageDir, path.basename(post.image)));
}));
async function decorated(posts, user) {
  const ids = posts.map(p => p._id);
  const [comments, reactions, profiles] = await Promise.all([
    Comment.find({ post: { $in: ids } }).populate('author', 'name avatar').sort({ createdAt: 1 }).lean(),
    Reaction.find({ post: { $in: ids } }).lean(),
    Profile.find({ user: { $in: posts.map(p => p.author?._id) } }).select('user equippedFrame').lean(),
  ]);
  return posts.map(p => ({ ...p, image: Boolean(p.image), frame: profiles.find(a => String(a.user) === String(p.author?._id))?.equippedFrame,
    comments: comments.filter(c => String(c.post) === String(p._id)),
    reactions: Object.fromEntries(['cheer', 'heart', 'helpful'].map(k => [k, reactions.filter(r => String(r.post) === String(p._id) && r.kind === k).length])),
    myReaction: reactions.find(r => String(r.post) === String(p._id) && String(r.user) === String(user))?.kind,
  }));
}
router.get('/posts', wrap(async (req, res) => {
  const author = req.query.author ? id(req.query.author) : null;
  const filter = { ...visible(), kind: { $ne: 'story' }, ...(author ? { author } : {}) };
  if (req.query.before) filter._id = { $lt: id(req.query.before) };
  const posts = await Post.find(filter).populate('author', 'name avatar').sort({ _id: -1 }).limit(20).lean();
  res.json(await decorated(posts, req.user._id));
}));
router.get('/stories', wrap(async (req, res) => {
  res.json(await decorated(await Post.find({ ...visible(), kind: 'story' }).populate('author', 'name avatar').sort({ createdAt: -1 }).limit(30).lean(), req.user._id));
}));
router.get('/my-posts', wrap(async (req, res) => {
  res.json(await Post.find({ author: req.user._id, status: { $in: ['pending', 'rejected'] } }).select('text kind image status createdAt').sort({ createdAt: -1 }).limit(50));
}));
router.get('/posts/:id', wrap(async (req, res) => {
  const post = await Post.findOne({ ...visible(), _id: id(req.params.id) }).populate('author', 'name avatar').lean();
  if (!post) fail('Bài đăng đã bị gỡ hoặc chưa được duyệt', 404);
  res.json((await decorated([post], req.user._id))[0]);
}));
router.delete('/posts/:id', wrap(async (req, res) => {
  const result = await Post.findOneAndUpdate({ _id: id(req.params.id), ...(req.user.role === 'admin' ? {} : { author: req.user._id }) }, { status: 'rejected' });
  if (!result) fail('Không có quyền xóa bài', 403);
  res.json({ success: true });
}));
async function approvedPost(value) {
  const p = await Post.findOne({ _id: id(value), ...visible() });
  if (!p) fail('Bài đăng không còn hiển thị', 404);
  return p;
}
router.post('/posts/:id/comments', wrap(async (req, res) => {
  const text = await checkContent(req, req.body.text, 2000);
  const post = await approvedPost(req.params.id);
  const comment = await Comment.create({ post: post._id, author: req.user._id, text });
  await notify(post.author, req.user._id, `${req.user.name} đã trả lời bài của bạn`, post._id);
  res.status(201).json(comment);
}));
router.post('/posts/:id/reactions', wrap(async (req, res) => {
  const { kind } = req.body;
  if (!['cheer', 'heart', 'helpful'].includes(kind)) fail('Tương tác không hợp lệ');
  const post = await approvedPost(req.params.id);
  const previous = await Reaction.findOneAndUpdate({ post: post._id, user: req.user._id }, { kind }, { upsert: true });
  if (!previous || previous.kind !== kind) await notify(post.author, req.user._id, `${req.user.name} đã ${ { cheer: 'cổ vũ', heart: 'thả tim', helpful: 'đánh dấu hữu ích' }[kind]} bài của bạn`, post._id);
  res.json({ success: true });
}));
// Only the question's author can accept a helpful answer; one reward per question/helper.
router.post('/comments/:id/helpful', wrap(async (req, res) => {
  const comment = await Comment.findById(id(req.params.id));
  if (!comment) fail('Không tìm thấy trả lời', 404);
  const post = await approvedPost(String(comment.post));
  if (post.kind !== 'question' || !post.image || String(post.author) !== String(req.user._id) || String(comment.author) === String(req.user._id)) fail('Chỉ chủ ảnh hỏi bài có thể ghi nhận người giúp đỡ', 403);
  await grant(comment.author, `help:${post._id}`, 10, true);
  await notify(comment.author, req.user._id, `${req.user.name} ghi nhận câu trả lời hữu ích của bạn`, post._id);
  res.json({ success: true });
}));
router.get('/messages/:peer', wrap(async (req, res) => {
  const peer = await requireFriend(req, req.params.peer);
  const filter = { $or: [{ sender: req.user._id, recipient: peer._id }, { sender: peer._id, recipient: req.user._id }] };
  if (req.query.before) filter._id = { $lt: id(req.query.before) };
  const messages = await Message.find(filter).sort({ _id: -1 }).limit(50).lean();
  await Message.updateMany({ _id: { $in: messages.map(m => m._id) }, sender: peer._id, recipient: req.user._id, readAt: null }, { readAt: new Date() });
  res.json(messages.reverse());
}));
router.get('/inbox', wrap(async (req, res) => {
  const friends = await friendIds(req.user._id);
  res.json(await Message.aggregate([{ $match: { sender: { $in: friends }, recipient: req.user._id, readAt: null } }, { $group: { _id: '$sender', count: { $sum: 1 } } }]));
}));
router.post('/messages/:peer', wrap(async (req, res) => {
  const peer = await requireFriend(req, req.params.peer);
  const text = await checkContent(req, req.body.text, 2000);
  const message = await Message.create({ sender: req.user._id, recipient: peer._id, text });
  await Promise.all([emit(peer._id, 'message', { peer: String(req.user._id), messageId: String(message._id) }), emit(req.user._id, 'message', { peer: String(peer._id), messageId: String(message._id) })]);
  res.status(201).json(message);
}));
router.get('/notifications', wrap(async (req, res) => {
  const [items, unread] = await Promise.all([Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean(), Notification.countDocuments({ user: req.user._id, readAt: null })]);
  res.json({ items, unread });
}));
router.post('/notifications/read', wrap(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
  await emit(req.user._id, 'notification'); res.json({ success: true });
}));

router.get('/garden', wrap(async (req, res) => {
  // Reconcile actual submitted homework; auto-created empty submissions never earn energy.
  const submissions = await HomeworkSubmission.find({ student: req.user._id, 'submissionImages.0': { $exists: true } }).select('_id submittedAt').lean();
  for (const s of submissions) {
    await grant(req.user._id, `homework:${s._id}`, 10);
    if (localDay(s.submittedAt) === localDay()) await grant(req.user._id, `water:${localDay()}`, 0, false, true);
  }
  const p = await ensureProfile(req.user._id);
  const { grantKeys, waterTask, ...safe } = p.toObject();
  res.json({ ...safe, needsWater: !p.lastWatered || Date.now() - p.lastWatered.getTime() >= 3 * 86400000, rewards: REWARDS });
}));
router.get('/garden/quizzes', gardenReview.list);
router.get('/garden/leaderboard', gardenReview.leaderboard);
router.post('/garden/task', gardenReview.start);
router.post('/garden/water', gardenReview.submit);
router.post('/rewards/redeem', wrap(async (req, res) => {
  const reward = REWARDS.find(r => r.id === req.body.item);
  if (!reward) fail('Phần thưởng không hợp lệ');
  const filter = { user: req.user._id, energy: { $gte: reward.cost } };
  const update = { $inc: { energy: -reward.cost } };
  if (['sticker', 'frame'].includes(reward.type)) { filter.inventory = { $ne: reward.id }; update.$addToSet = { inventory: reward.id }; }
  if (reward.type === 'game') update.$inc.gameMinutes = 5;
  if (reward.type === 'gift') update.$push = { redemptions: { item: reward.id, label: reward.label, at: new Date() } };
  const p = await Profile.findOneAndUpdate(filter, update, { new: true });
  if (!p) fail('Chưa đủ điểm hoặc đã sở hữu phần thưởng');
  res.json({ success: true });
}));
router.post('/rewards/equip', wrap(async (req, res) => {
  if (req.body.item !== '' && req.body.item !== 'frame-green') fail('Khung không hợp lệ');
  const result = await Profile.updateOne({ user: req.user._id, ...(req.body.item ? { inventory: req.body.item } : {}) }, { equippedFrame: req.body.item });
  if (!result.matchedCount) fail('Bạn chưa mở khóa khung này');
  res.json({ success: true });
}));
router.post('/game/start', wrap(async (req, res) => {
  const p = await Profile.findOneAndUpdate({ user: req.user._id, gameMinutes: { $gte: 1 }, $or: [{ gameUntil: null }, { gameUntil: { $lte: new Date() } }] }, { $inc: { gameMinutes: -1 }, $set: { gameUntil: new Date(Date.now() + 60000) } }, { new: true });
  const current = p || await Profile.findOne({ user: req.user._id });
  if (!current?.gameUntil || current.gameUntil <= new Date()) fail('Hãy đổi điểm lấy thời gian chơi');
  res.json({ until: current.gameUntil });
}));

async function eligibleClasses(user) {
  // Class.students is the authoritative membership used by homework and exam access.
  return Class.find({ students: user, isActive: true, $and: [
    { $or: [{ startDate: null }, { startDate: { $lte: new Date() } }] },
    { $or: [{ endDate: null }, { endDate: { $gte: new Date() } }] },
  ] }).select('_id');
}
async function eligibleChallenge(req, challengeId) {
  const c = await Challenge.findById(id(challengeId));
  if (!c) fail('Không tìm thấy thử thách', 404);
  const classes = await eligibleClasses(req.user._id);
  if (!classes.length || (c.classes.length && !c.classes.some(cid => classes.some(cls => String(cls._id) === String(cid))))) fail('Chỉ học sinh đang trong lớp phù hợp mới được tham gia', 403);
  return c;
}
router.get('/challenges', wrap(async (req, res) => {
  const [classes, attempts, challenges] = await Promise.all([eligibleClasses(req.user._id), Attempt.find({ student: req.user._id }).select('-answers').lean(), Challenge.find().select('-questions').sort({ startsAt: -1 }).limit(50).lean()]);
  res.json(challenges.map(c => ({ ...c, eligible: classes.length > 0 && (!c.classes.length || c.classes.some(cid => classes.some(cls => String(cls._id) === String(cid)))), attempt: attempts.find(a => String(a.challenge) === String(c._id)) })));
}));
router.post('/challenges/:id/start', wrap(async (req, res) => {
  const c = await eligibleChallenge(req, req.params.id), now = new Date();
  if (now < c.startsAt || now >= c.endsAt) fail('Thử thách chưa mở hoặc đã kết thúc');
  let attempt;
  try {
    attempt = await Attempt.findOneAndUpdate({ challenge: c._id, student: req.user._id }, { $setOnInsert: { startedAt: now, deadline: new Date(Math.min(c.endsAt.getTime(), now.getTime() + c.durationMinutes * 60000)) } }, { upsert: true, new: true });
  } catch (err) { if (err.code !== 11000) throw err; attempt = await Attempt.findOne({ challenge: c._id, student: req.user._id }); }
  if (attempt.submittedAt || attempt.deadline <= now) fail('Lượt làm đã nộp hoặc hết giờ');
  res.json({ attempt, questions: c.questions.map(q => ({ _id: q._id, prompt: q.prompt, options: q.options })) });
}));
router.post('/challenges/:id/submit', wrap(async (req, res) => {
  const c = await eligibleChallenge(req, req.params.id), now = new Date();
  if (!Array.isArray(req.body.answers) || req.body.answers.length !== c.questions.length || req.body.answers.some(a => !Number.isInteger(a) || a < -1 || a > 3)) fail('Đáp án không hợp lệ');
  const score = c.questions.reduce((sum, q, i) => sum + (q.correctIndex === req.body.answers[i] ? 1 : 0), 0);
  const attempt = await Attempt.findOneAndUpdate({ challenge: c._id, student: req.user._id, submittedAt: null, deadline: { $gt: now } }, { submittedAt: now, answers: req.body.answers, score }, { new: true });
  if (!attempt) fail('Lượt làm đã nộp hoặc hết giờ');
  await waterDaily(req.user._id, `challenge:${c._id}`, score * 5);
  res.json(attempt);
}));
router.get('/monthly', wrap(async (req, res) => {
  const month = req.query.month || localDay().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Tháng không hợp lệ');
  const start = new Date(`${month}-01T00:00:00+07:00`);
  const [yearNumber, monthNumber] = month.split('-').map(Number);
  const end = new Date(Date.UTC(yearNumber, monthNumber, 1) - 7 * 60 * 60000);
  const [rows, awards] = await Promise.all([
    Attempt.aggregate([{ $match: { submittedAt: { $gte: start, $lt: end } } }, { $group: { _id: '$student', score: { $sum: '$score' }, completed: { $sum: 1 } } }, { $sort: { score: -1, completed: -1, _id: 1 } }, { $limit: 100 }, { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'student' } }, { $project: { score: 1, completed: 1, name: { $arrayElemAt: ['$student.name', 0] } } }]),
    MonthlyAward.find({ month }).select('student gift').lean(),
  ]);
  res.json({ month, rows: rows.map(r => ({ ...r, gift: awards.find(a => String(a.student) === String(r._id))?.gift })) });
}));

router.get('/admin', adminOnly, wrap(async (req, res) => {
  const [settings, pending, challenges, classes, gifts] = await Promise.all([policy(), Post.find({ status: 'pending' }).populate('author', 'name').sort({ createdAt: 1 }).limit(100), Challenge.find().sort({ startsAt: -1 }).limit(50), Class.find({ isActive: true }).select('name'), Profile.find({ 'redemptions.status': 'pending' }).populate('user', 'name').select('user redemptions')]);
  res.json({ settings, pending, challenges, classes, gifts });
}));
router.put('/admin/policy', adminOnly, wrap(async (req, res) => {
  const { curfewEnabled, curfewStart, curfewEnd, bannedWords } = req.body;
  if (typeof curfewEnabled !== 'boolean' || ![curfewStart, curfewEnd].every(v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) || curfewStart === curfewEnd) fail('Giờ giới nghiêm không hợp lệ');
  if (!Array.isArray(bannedWords) || bannedWords.length > 300 || bannedWords.some(w => typeof w !== 'string' || !w.trim() || w.length > 80)) fail('Danh sách từ khóa không hợp lệ');
  const imageSettings = {};
  if (req.body.homeworkAccessMode !== undefined) {
    if (!['none', 'submitted', 'graded'].includes(req.body.homeworkAccessMode)) fail('Điều kiện truy cập mạng xã hội không hợp lệ');
    imageSettings.homeworkAccessMode = req.body.homeworkAccessMode;
  }
  if (req.body.dailyImageLimitEnabled !== undefined) {
    if (typeof req.body.dailyImageLimitEnabled !== 'boolean') fail('Cài đặt giới hạn ảnh không hợp lệ');
    imageSettings.dailyImageLimitEnabled = req.body.dailyImageLimitEnabled;
  }
  if (req.body.dailyImageLimit !== undefined) {
    if (!Number.isInteger(req.body.dailyImageLimit) || req.body.dailyImageLimit < 0 || req.body.dailyImageLimit > 100) fail('Giới hạn ảnh phải là số nguyên từ 0 đến 100');
    imageSettings.dailyImageLimit = req.body.dailyImageLimit;
  }
  if (req.body.dailyImageLimitScope !== undefined) {
    if (!['all', 'students'].includes(req.body.dailyImageLimitScope)) fail('Phạm vi giới hạn ảnh không hợp lệ');
    imageSettings.dailyImageLimitScope = req.body.dailyImageLimitScope;
  }
  res.json(await Policy.findOneAndUpdate({ key: 'default' }, { curfewEnabled, curfewStart, curfewEnd, bannedWords: [...new Set(bannedWords.map(w => w.trim()))], ...imageSettings }, { upsert: true, new: true, runValidators: true }));
}));
router.post('/admin/posts/:id/review', adminOnly, wrap(async (req, res) => {
  if (!['approved', 'rejected'].includes(req.body.status)) fail('Trạng thái không hợp lệ');
  const p = await Post.findOneAndUpdate({ _id: id(req.params.id), status: 'pending' }, { status: req.body.status }, { new: true });
  if (!p) fail('Bài đã được xử lý', 409);
  if (p.status === 'approved' && p.image && p.kind !== 'question' && (!p.expiresAt || p.expiresAt > new Date())) await waterDaily(p.author, `photo:${localDay(p.createdAt)}`, 15);
  await notify(p.author, req.user._id, p.status === 'approved' ? 'Ảnh học tập của bạn đã được duyệt' : 'Ảnh của bạn chưa phù hợp và đã bị từ chối', p.status === 'approved' ? p._id : undefined);
  res.json({ success: true });
}));
router.post('/admin/challenges', adminOnly, wrap(async (req, res) => {
  const { title, description, classes = [], startsAt, endsAt, durationMinutes, questions, monthlyPrize } = req.body;
  if (typeof title !== 'string' || !title.trim() || title.length > 150 || !Number.isFinite(Number(durationMinutes)) || Number(durationMinutes) < 1 || Number(durationMinutes) > 180) fail('Tên hoặc thời lượng không hợp lệ');
  const start = new Date(startsAt), end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end <= new Date()) fail('Khoảng thời gian không hợp lệ');
  if (!Array.isArray(classes) || classes.some(c => typeof c !== 'string' || !mongoose.isValidObjectId(c)) || await Class.countDocuments({ _id: { $in: classes }, isActive: true }) !== new Set(classes).size) fail('Lớp không hợp lệ');
  if (!Array.isArray(questions) || !questions.length || questions.length > 50 || questions.some(q => typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 2000 || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 1000) || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3)) fail('Mỗi câu cần đề bài, 4 lựa chọn và đáp án đúng');
  res.status(201).json(await Challenge.create({ title: title.trim(), description, classes, startsAt: start, endsAt: end, durationMinutes, questions: questions.map(q => ({ prompt: q.prompt, options: q.options, correctIndex: q.correctIndex })), monthlyPrize }));
}));
router.post('/admin/awards', adminOnly, wrap(async (req, res) => {
  const { month, student: studentId, gift } = req.body;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || typeof gift !== 'string' || !gift.trim() || gift.length > 500) fail('Tháng hoặc quà không hợp lệ');
  await student(studentId);
  await MonthlyAward.findOneAndUpdate({ month, student: studentId }, { gift: gift.trim(), awardedBy: req.user._id }, { upsert: true, runValidators: true });
  await notify(studentId, req.user._id, `Quà thử thách tháng ${month}: ${gift.trim()}`);
  res.json({ success: true });
}));
router.post('/admin/gifts/:user/:redemption', adminOnly, wrap(async (req, res) => {
  const result = await Profile.updateOne({ user: id(req.params.user), redemptions: { $elemMatch: { _id: id(req.params.redemption), status: 'pending' } } }, { $set: { 'redemptions.$.status': 'delivered' } });
  if (!result.modifiedCount) fail('Yêu cầu đã được xử lý', 409);
  await notify(req.params.user, req.user._id, 'Quà đổi điểm năng lượng của bạn đã được trao');
  res.json({ success: true });
}));
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (!err.status && err.code !== 11000 && !(err instanceof multer.MulterError)) console.error('[community]', err);
  res.status(err.status || (err.code === 11000 ? 409 : 400)).json({ message: err instanceof multer.MulterError ? 'Ảnh vượt quá 5 MB hoặc dữ liệu tải lên không hợp lệ' : err.message, ...(err.imageQuota ? { code: err.code, imageQuota: err.imageQuota } : {}) });
});
module.exports = router;
