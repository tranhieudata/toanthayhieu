const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, maxlength: 200 },
  category: { type: String, default: 'Khác', trim: true, maxlength: 80 },
  excerpt: { type: String, default: '', maxlength: 500 },
  content: { type: String, default: '', maxlength: 1000000 },
  seoTitle: { type: String, default: '', maxlength: 200 },
  seoDescription: { type: String, default: '', maxlength: 500 },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

articleSchema.index({ status: 1, publishedAt: -1 });
module.exports = mongoose.model('Article', articleSchema);
