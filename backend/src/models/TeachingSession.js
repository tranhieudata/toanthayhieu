const mongoose = require('mongoose');

const printablePdfSchema = new mongoose.Schema({
  url: { type: String, default: '' },
  filename: { type: String, default: '' },
  sourceType: {
    type: String,
    enum: ['lesson', 'homework', 'exam', 'manual'],
    default: 'manual',
  },
  sourceId: { type: mongoose.Schema.Types.ObjectId },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const teachingSessionSchema = new mongoose.Schema(
  {
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    date: { type: Date, required: true },
    plannedLesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    actualLesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    previousSession: { type: mongoose.Schema.Types.ObjectId, ref: 'TeachingSession' },
    status: {
      type: String,
      enum: ['planned', 'completed', 'partial', 'skipped', 'rescheduled'],
      default: 'planned',
    },
    summary: { type: String, default: '' },
    teacherNote: { type: String, default: '' },
    homeworks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Homework' }],
    exams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exam' }],
    printablePdfs: [printablePdfSchema],
    nextRecommendation: {
      lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
      note: { type: String, default: '' },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

teachingSessionSchema.index({ class: 1, date: -1 });
teachingSessionSchema.index({ class: 1, plannedLesson: 1 });
teachingSessionSchema.index({ class: 1, actualLesson: 1 });

module.exports = mongoose.model('TeachingSession', teachingSessionSchema);
