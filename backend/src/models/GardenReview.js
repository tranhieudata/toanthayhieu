const mongoose = require('mongoose');
const question = new mongoose.Schema({
  prompt: String, options: [String], correctIndex: Number, explanation: String,
}, { _id: false });
const quiz = new mongoose.Schema({
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true, unique: true },
  title: { type: String, required: true }, questions: [question],
  isPublished: { type: Boolean, default: false },
}, { timestamps: true });
const attempt = new mongoose.Schema({
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'GardenReviewQuiz', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String, questions: [question], answers: [Number],
  correctCount: Number, score: Number, submittedAt: Date,
}, { timestamps: true });
attempt.index({ quiz: 1, student: 1 }, { unique: true });
module.exports = {
  ReviewQuiz: mongoose.model('GardenReviewQuiz', quiz),
  ReviewAttempt: mongoose.model('GardenReviewAttempt', attempt),
};
