const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, min: 0, max: 6 },
  startTime: { type: String },
  endTime: { type: String },
  room: { type: String, default: '' },
});

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
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
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Class', classSchema);
