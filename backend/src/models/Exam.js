const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Removed enum to allow dynamic levels
  fromQuestion: { type: Number, required: true, min: 1 },
  toQuestion: { type: Number, required: true, min: 1 },
  totalPoints: { type: Number, required: true, min: 0 },
  criteria: [{ type: mongoose.Schema.Types.ObjectId }], // subdoc _ids from lesson.criteria
});

// Mỗi lớp học có thể có thời gian mở/đóng riêng
const classScheduleSchema = new mongoose.Schema({
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
}, { _id: false });

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' }, // Nội dung đề (HTML + LaTeX)
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    level: { type: mongoose.Schema.Types.ObjectId, ref: 'Level' }, // Lớp 6, 7, 8, etc.
    classSchedules: [classScheduleSchema], // Các lớp học được giao đề + thời gian mở/đóng riêng
    totalQuestions: { type: Number, required: true, min: 1 },
    levels: [levelSchema],
    isTemplate: { type: Boolean, default: false }, // true = thuộc ngân hàng đề
    note: { type: String, default: '' },
    examPackage: { type: mongoose.Schema.Types.Mixed, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sharedPractice: { type: String, default: '' }, // JSON: { generatedAt, stats, exercises:[{level, questions:[{q,hint}]}] }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Exam', examSchema);
