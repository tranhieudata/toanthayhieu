const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    grade: { type: Number, min: 1, max: 12, validate: Number.isInteger },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    bgColor: { type: String, default: 'bg-blue-100' },
    textColor: { type: String, default: 'text-blue-700' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
levelSchema.index({ grade: 1 }, { unique: true, partialFilterExpression: { grade: { $type: 'number' } } });

module.exports = mongoose.model('Level', levelSchema);
