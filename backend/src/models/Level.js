const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    bgColor: { type: String, default: 'bg-blue-100' },
    textColor: { type: String, default: 'text-blue-700' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Level', levelSchema);
