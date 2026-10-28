const mongoose = require('mongoose');
const { currentYear, classGrade } = require('../utils/classGrade');

const scheduleSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, min: 0, max: 6 },
  startTime: { type: String },
  endTime: { type: String },
  room: { type: String, default: '' },
});

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    birthYear: { type: Number, default: null, validate: { validator: value => value == null || (Number.isInteger(value) && value >= 1900 && value <= currentYear()), message: 'Năm sinh phải là số nguyên từ 1900 đến năm hiện tại' } },
    description: { type: String, default: '' },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    schedules: [scheduleSchema],
    startDate: { type: Date },
    endDate: { type: Date },
    maxStudents: { type: Number, default: 30 },
    isActive: { type: Boolean, default: true },
    feePerSession: { type: Number, default: 0 },
    lessonVisibility: [{
      lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
      isVisible: { type: Boolean, default: false },
      autoOpenAt: { type: Date, default: null },
    }],
  },
  { timestamps: true }
);
classSchema.virtual('currentGrade').get(function () { return classGrade(this); });
classSchema.set('toJSON', { virtuals: true });
classSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Class', classSchema);
