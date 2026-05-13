const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, select: false },
    avatar: { type: String, default: '' },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    googleId: { type: String },
    facebookId: { type: String },
    phone: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
