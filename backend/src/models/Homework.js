const mongoose = require('mongoose');

const homeworkSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    questionImage: { 
      url: { type: String, default: '' },
      uploadedAt: { type: Date, default: Date.now }
    },
    sourceExam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    examPackage: { type: mongoose.Schema.Types.Mixed, default: null },
    pdfAttachments: [{
      url: { type: String },
      filename: { type: String },
      uploadedAt: { type: Date, default: Date.now },
    }],
    solutionImages: [{ url: { type: String }, uploadedAt: { type: Date, default: Date.now } }],
    solutionPdfAttachments: [{
      url: { type: String },
      filename: { type: String },
      uploadedAt: { type: Date, default: Date.now },
    }],
    answerKey: { type: String, default: '' }, // Đáp án của giáo viên
    answerKeyGeneratedBy: { type: String, enum: ['gemini', 'chatgpt', 'manual'], default: 'manual' },
    answerKeyGeneratedAt: { type: Date },
    maxScore: { type: Number, default: 10 },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Homework', homeworkSchema);
