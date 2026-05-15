const mongoose = require('mongoose');

const studentAdjustmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  absentSessions: { type: Number, default: 0, min: 0 },
  extraSessions: { type: Number, default: 0, min: 0 },
  note: { type: String, default: '' },
});

const tuitionRecordSchema = new mongoose.Schema(
  {
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    totalSessions: { type: Number, required: true, min: 0 },
    holidaySessions: { type: Number, default: 0, min: 0 },
    feePerSession: { type: Number, required: true, min: 0 },
    studentAdjustments: [studentAdjustmentSchema],
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

tuitionRecordSchema.index({ class: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('TuitionRecord', tuitionRecordSchema);
