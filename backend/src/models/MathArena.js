const mongoose = require('mongoose');
const { Schema } = mongoose;
const questionFields = {
  prompt: { type: String, required: true, maxlength: 1000 },
  kind: { type: String, enum: ['choice', 'short'], required: true },
  options: [String], correctIndex: Number, answer: String,
  explanation: { type: String, maxlength: 1500, default: '' },
};
const question = new Schema({
  ...questionFields,
  chapter: { type: String, default: "", maxlength: 300 },
  grade: { type: Number, required: true, min: 1, max: 12 },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  published: { type: Boolean, default: false },
}, { timestamps: true });
question.index({ grade: 1, difficulty: 1, published: 1, chapter: 1 });
const match = new Schema({
  host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  class: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  grade: Number, difficulty: String, chapters: [String], reward: Number,
  mode: { type: String, enum: ['race', 'archery'], required: true },
  format: { type: String, enum: ['1v1', '2v2'], required: true },
  status: { type: String, enum: ['waiting', 'active', 'finished', 'cancelled'], default: 'waiting' },
  participants: [{
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, name: String,
    team: { type: Number, enum: [0, 1], required: true }, accepted: Boolean,
    index: { type: Number, default: 0 }, score: { type: Number, default: 0 },
    lastAnswer: { index: Number, correct: Boolean }, lastAnsweredAt: Date,
  }],
  questions: [new Schema(questionFields, { _id: false })],
  expiresAt: Date, startsAt: Date, deadline: Date, finishedAt: Date,
  winner: { type: Number, default: null }, reason: String,
  rewardsGranted: { type: Boolean, default: false },
  revision: { type: Number, default: 0 },
}, { timestamps: true });
match.index({ 'participants.user': 1, createdAt: -1 });
// A unique seat prevents simultaneous rooms, including concurrent create requests.
const seat = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, unique: true },
  match: { type: Schema.Types.ObjectId, required: true }, expiresAt: Date,
});
seat.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const practiceHistory = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  number: Number, grade: Number, chapter: String, difficulty: String, cost: Number,
  index: Number, score: Number, startedAt: Date, completedAt: Date,
});
practiceHistory.index({ user: 1, number: -1, _id: -1 });
module.exports = {
  ArenaPracticeHistory: mongoose.model('ArenaPracticeHistory', practiceHistory),
  ArenaQuestion: mongoose.model('ArenaQuestion', question),
  ArenaMatch: mongoose.model('ArenaMatch', match),
  ArenaSeat: mongoose.model('ArenaSeat', seat),
};
