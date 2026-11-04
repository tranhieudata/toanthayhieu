const mongoose = require('mongoose');

const weeklyTeachingPlanSchema = new mongoose.Schema({
  weekStart: { type: String, required: true, unique: true },
  entries: [{
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
    topic: { type: String, default: '', maxlength: 500 },
    note: { type: String, default: '', maxlength: 2000 },
  }],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('WeeklyTeachingPlan', weeklyTeachingPlanSchema);
