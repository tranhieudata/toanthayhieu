const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    order: { type: Number, default: 0 },
    duration: { type: String, default: '' },
    isPublished: { type: Boolean, default: false },
    attachments: [{ name: String, url: String }],
    pdfAttachments: [{ url: String, filename: String, uploadedAt: { type: Date, default: Date.now } }],
    criteria: [{
      name: { type: String, required: true, trim: true },
      description: { type: String, default: '' },
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lesson', lessonSchema);
