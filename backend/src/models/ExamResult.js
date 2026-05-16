const mongoose = require('mongoose');

const questionScoreSchema = new mongoose.Schema({
  questionOrder: { type: Number, required: true },
  score: { type: Number, default: 0, min: 0 },
});

const examResultSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    scores: [questionScoreSchema],
    totalScore: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    autoFeedback: { type: String, default: '' },
    teacherNote: { type: String, default: '' },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gradedAt: { type: Date },
    status: { type: String, enum: ['pending', 'graded'], default: 'pending' },
    submissionImages: [{ url: { type: String }, uploadedAt: { type: Date, default: Date.now } }],
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

examResultSchema.index({ exam: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('ExamResult', examResultSchema);
