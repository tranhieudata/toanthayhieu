const mongoose = require('mongoose');

const classEnrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    message: { type: String, default: '' },
    adminNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

classEnrollmentSchema.index({ student: 1, class: 1 }, { unique: true });

module.exports = mongoose.model('ClassEnrollment', classEnrollmentSchema);
