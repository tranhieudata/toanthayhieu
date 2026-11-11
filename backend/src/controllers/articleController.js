const Article = require('../models/Article');

function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180).replace(/-$/, '');
}

function articleInput(body) {
  const result = {};
  const limits = { title: 200, slug: 200, category: 80, excerpt: 500, content: 1000000, seoTitle: 200, seoDescription: 500 };
  for (const [key, limit] of Object.entries(limits)) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > limit)) throw new Error(`Trường ${key} không hợp lệ (tối đa ${limit} ký tự).`);
    result[key] = (body[key] || '').trim();
  }
  if (!result.title) throw new Error('Vui lòng nhập tiêu đề bài viết.');
  result.slug = slugify(result.slug || result.title);
  if (!result.slug || ['write', 'manage'].includes(result.slug)) throw new Error('Vui lòng chọn đường dẫn khác cho bài viết.');
  result.category ||= 'Khác';
  result.status = body.status || 'draft';
  if (!['draft', 'published'].includes(result.status)) throw new Error('Trạng thái bài viết không hợp lệ.');
  if (result.status === 'published' && !result.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() && !/<(?:img|iframe)\b|class="ql-formula"/i.test(result.content)) throw new Error('Vui lòng nhập nội dung trước khi đăng bài.');
  return result;
}

function failure(res, error) {
  if (error.code === 11000) return res.status(409).json({ message: 'Đường dẫn đã được sử dụng. Vui lòng chọn đường dẫn khác.' });
  if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ message: 'Dữ liệu bài viết không hợp lệ.' });
  console.error('Article API:', error);
  return res.status(500).json({ message: 'Không thể xử lý bài viết. Vui lòng thử lại.' });
}

exports.list = async (req, res) => {
  try {
    const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
    const filter = req.query.manage === 'true' && req.user?.role === 'admin' ? {} : { status: 'published' };
    if (typeof req.query.category === 'string' && req.query.category) filter.category = req.query.category;
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const pattern = req.query.q.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['title', 'excerpt'].map(field => ({ [field]: { $regex: pattern, $options: 'i' } }));
    }
    const [articles, total] = await Promise.all([
      Article.find(filter).select('-content').populate('author', 'name').sort({ publishedAt: -1, createdAt: -1 }).skip((page - 1) * 12).limit(12),
      Article.countDocuments(filter),
    ]);
    res.json({ articles, total, page, pages: Math.ceil(total / 12) });
  } catch (error) { failure(res, error); }
};

exports.get = async (req, res) => {
  try {
    const filter = { slug: req.params.slug };
    if (req.user?.role !== 'admin') filter.status = 'published';
    const article = await Article.findOne(filter).populate('author', 'name');
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    res.json(article);
  } catch (error) { failure(res, error); }
};

exports.save = async (req, res) => {
  let input;
  try { input = articleInput(req.body); } catch (error) { return res.status(400).json({ message: error.message }); }
  try {
    const article = req.params.id ? await Article.findById(req.params.id) : new Article({ author: req.user._id });
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    Object.assign(article, input);
    if (input.status === 'published' && !article.publishedAt) article.publishedAt = new Date();
    await article.save();
    res.status(req.params.id ? 200 : 201).json(article);
  } catch (error) { failure(res, error); }
};

exports.remove = async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    res.json({ message: 'Đã xóa bài viết.' });
  } catch (error) { failure(res, error); }
};

exports.slugify = slugify;
exports.articleInput = articleInput;
