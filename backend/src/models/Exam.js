const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  name: { type: String, enum: ['Nhận biết', 'Thông hiểu', 'Vận dụng cao'], required: true },
  fromQuestion: { type: Number, required: true, min: 1 },
  toQuestion: { type: Number, required: true, min: 1 },
  totalPoints: { type: Number, required: true, min: 0 },
  criteria: [{ type: mongoose.Schema.Types.ObjectId }], // subdoc _ids from lesson.criteria
});

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' }, // Nội dung đề (HTML + LaTeX)
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    totalQuestions: { type: Number, required: true, min: 1 },
    levels: [levelSchema],
    isTemplate: { type: Boolean, default: false }, // true = thuộc ngân hàng đề
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Exam', examSchema);
