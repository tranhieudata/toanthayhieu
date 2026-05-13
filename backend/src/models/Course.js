const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    thumbnail: { type: String, default: '' },
    category: { type: String, required: true },
    level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    price: { type: Number, default: 0 },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isPublished: { type: Boolean, default: false },
    totalLessons: { type: Number, default: 0 },
    duration: { type: String, default: '' },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Course', courseSchema);
