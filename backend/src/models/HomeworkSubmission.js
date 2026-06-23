const mongoose = require('mongoose');

const homeworkSubmissionSchema = new mongoose.Schema(
  {
    homework: { type: mongoose.Schema.Types.ObjectId, ref: 'Homework', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    submissionImages: [
      {
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now }
      }
    ],
    score: { type: Number, default: null }, // null = chưa chấm
    maxScore: { type: Number, default: 10 },
    feedback: { type: String, default: '' },
    teacherNote: { type: String, default: '' },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin/giáo viên chấm
    gradedAt: { type: Date },
    submittedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'graded'], default: 'pending' },
    aiModel: { type: String, enum: ['gemini', 'chatgpt', 'manual'], default: 'manual' }, // Model chấm điểm
  },
  { timestamps: true }
);

// Unique index để một học sinh chỉ có một submission cho một bài tập
homeworkSubmissionSchema.index({ homework: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('HomeworkSubmission', homeworkSubmissionSchema);
