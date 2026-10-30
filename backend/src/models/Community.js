const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (model, extra = {}) => ({ type: Schema.Types.ObjectId, ref: model, ...extra });
const model = (name, fields, indexes = []) => {
  const schema = new Schema(fields, { timestamps: true });
  indexes.forEach(([keys, options]) => schema.index(keys, options));
  return mongoose.model(name, schema);
};

const Policy = model('CommunityPolicy', {
  energySettings: { type: Schema.Types.Mixed, default: {} },
  key: { type: String, default: 'default', unique: true },
  curfewEnabled: { type: Boolean, default: true },
  curfewStart: { type: String, default: '22:00' },
  curfewEnd: { type: String, default: '06:00' },
  dailyImageLimitEnabled: { type: Boolean, default: true },
  dailyImageLimit: { type: Number, default: 5, min: 0, max: 100 },
  dailyImageLimitScope: { type: String, enum: ['all', 'students'], default: 'all' },
  homeworkAccessMode: { type: String, enum: ['none', 'submitted', 'graded'], default: 'submitted' },
  bannedWords: { type: [String], default: ['địt', 'đụ', 'đéo', 'vcl', 'đm', 'cặc', 'lồn', 'ma túy', 'khiêu dâm'] },
});
const Post = model('CommunityPost', {
  author: ref('User', { required: true }),
  text: { type: String, maxlength: 3000, required: true },
  image: { type: String, default: '' },
  imageDay: String,
  kind: { type: String, enum: ['study', 'question', 'story'], default: 'study' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  expiresAt: Date,
}, [[{ status: 1, createdAt: -1 }], [{ author: 1, createdAt: -1 }], [{ kind: 1, expiresAt: 1 }]]);
const ImageUsage = model('CommunityImageUsage', {
  user: ref('User', { required: true }), day: { type: String, required: true },
  count: { type: Number, default: 0, min: 0 },
}, [[{ user: 1, day: 1 }, { unique: true }]]);
const Comment = model('CommunityComment', {
  post: ref('CommunityPost', { required: true }), author: ref('User', { required: true }),
  text: { type: String, required: true, maxlength: 2000 },
}, [[{ post: 1, createdAt: 1 }]]);
const Reaction = model('CommunityReaction', {
  post: ref('CommunityPost', { required: true }), user: ref('User', { required: true }),
  kind: { type: String, enum: ['cheer', 'heart', 'helpful'], required: true },
}, [[{ post: 1, user: 1 }, { unique: true }]]);
const Message = model('CommunityMessage', {
  sender: ref('User', { required: true }), recipient: ref('User', { required: true }),
  text: { type: String, maxlength: 2000, required: true }, readAt: Date,
}, [[{ sender: 1, recipient: 1, createdAt: -1 }], [{ recipient: 1, readAt: 1 }]]);
const Friendship = model('CommunityFriendship', {
  userA: ref('User', { required: true }), userB: ref('User', { required: true }),
  requestedBy: ref('User', { required: true }),
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
}, [[{ userA: 1, userB: 1 }, { unique: true }], [{ userA: 1, status: 1 }], [{ userB: 1, status: 1 }]]);
// Shared event queue lets SSE connections receive events sent by another server process.
const Event = model('CommunityEvent', {
  user: ref('User', { required: true }), type: { type: String, required: true },
  data: { type: Schema.Types.Mixed, default: {} },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 86400000) },
}, [[{ user: 1, createdAt: 1 }], [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]]);
const Notification = model('CommunityNotification', {
  user: ref('User', { required: true }), actor: ref('User'),
  text: String, post: ref('CommunityPost'), readAt: Date,
  kind: { type: String, enum: ['activity', 'friendship', 'arena'], default: 'activity' },
}, [[{ user: 1, createdAt: -1 }]]);
// One atomic account document makes reward grants and spending safe on standalone MongoDB too.
const Profile = model('CommunityProfile', {
  user: ref('User', { required: true, unique: true }),
  energy: { type: Number, default: 0 }, studyPoints: { type: Number, default: 0 },
  communityPoints: { type: Number, default: 0 }, growth: { type: Number, default: 0 },
  lastWatered: Date, grantKeys: [String], inventory: [String], equippedFrame: { type: String, default: '' },
  gameMinutes: { type: Number, default: 0 }, gameUntil: Date,
  arenaPractice: Schema.Types.Mixed,
  arenaPracticeCount: { type: Number, default: 0 },
  waterTask: { answer: Number, expiresAt: Date },
  redemptions: [{ item: String, label: String, status: { type: String, default: 'pending' }, at: Date }],
});
const Challenge = model('CommunityChallenge', {
  title: { type: String, required: true, maxlength: 150 }, description: { type: String, maxlength: 3000 },
  classes: [ref('Class')], startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  durationMinutes: { type: Number, required: true, min: 1, max: 180 },
  questions: [{ prompt: String, options: [String], correctIndex: Number }],
  monthlyPrize: { type: String, maxlength: 500 },
}, [[{ startsAt: -1, _id: -1 }]]);
const Attempt = model('CommunityAttempt', {
  challenge: ref('CommunityChallenge', { required: true }), student: ref('User', { required: true }),
  startedAt: { type: Date, required: true }, deadline: { type: Date, required: true },
  submittedAt: Date, answers: [Number], score: { type: Number, default: 0 },
}, [[{ challenge: 1, student: 1 }, { unique: true }]]);
const MonthlyAward = model('CommunityMonthlyAward', {
  month: { type: String, required: true }, student: ref('User', { required: true }),
  gift: { type: String, required: true, maxlength: 500 }, awardedBy: ref('User'),
}, [[{ month: 1, student: 1 }, { unique: true }]]);
module.exports = { Policy, Post, ImageUsage, Comment, Reaction, Message, Friendship, Event, Notification, Profile, Challenge, Attempt, MonthlyAward };
