const Level = require('../models/Level');
const Exam = require('../models/Exam');
const SiteSettings = require('../models/SiteSettings');
const { ArenaQuestion } = require('../models/MathArena');
const { publicLevel, gradeNumber } = require('../services/gradeCatalog');
const fail = message => { const error = new Error(message); error.status = 400; throw error; };
const errorStatus = error => error.status || (['ValidationError', 'CastError'].includes(error.name) || error.code === 11000 ? 400 : 500);
async function validateGrade(body, existing) {
  const grade = body.grade === undefined ? gradeNumber(existing || body) : body.grade;
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) fail('Số khối phải là số nguyên từ 1 đến 12');
  const name = body.name === undefined ? existing?.name : body.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 100) fail('Nhập tên khối từ 1 đến 100 ký tự');
  const namedGrade = gradeNumber({ name });
  if (namedGrade && namedGrade !== grade) fail('Tên khối và số khối phải khớp nhau');
  const others = await Level.find({ ...(existing ? { _id: { $ne: existing._id } } : {}) }).lean();
  if (others.some(level => gradeNumber(level) === grade)) fail(`Khối ${grade} đã được cấu hình`);
  return { grade, name: name.trim().replace(/^lớp\s*/i, 'Khối ') };
}
async function hasGradeData(level) {
  const grade = gradeNumber(level);
  if (await Exam.exists({ level: level._id })) return true;
  if (!grade) return false;
  const others = await Level.find({ _id: { $ne: level._id } }).lean();
  if (others.some(other => gradeNumber(other) === grade)) return false;
  if (await ArenaQuestion.exists({ grade })) return true;
  const settings = await SiteSettings.findOne({ key: 'default' }).lean();
  return Object.keys(settings?.curriculum?.[String(grade)] || {}).length > 0;
}

// GET /api/levels - get all levels
const getLevels = async (req, res) => {
  try {
    const levels = await Level.find().sort({ order: 1, createdAt: 1 });
    res.json(levels.map(publicLevel));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/levels/:id
const getLevelById = async (req, res) => {
  try {
    const level = await Level.findById(req.params.id);
    if (!level) return res.status(404).json({ message: 'Không tìm thấy level' });
    res.json(publicLevel(level));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/levels - create new level
const createLevel = async (req, res) => {
  const { description, bgColor, textColor, order } = req.body;

  try {
    const level = new Level({
      ...await validateGrade(req.body),
      description: description || '',
      bgColor: bgColor || 'bg-blue-100',
      textColor: textColor || 'text-blue-700',
      order: order || 0,
    });
    await level.save();
    res.status(201).json(publicLevel(level));
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: 'Tên khối đã tồn tại' });
    } else {
      res.status(errorStatus(err)).json({ message: err.message });
    }
  }
};

// PUT /api/levels/:id
const updateLevel = async (req, res) => {
  const { name, description, bgColor, textColor, order, isActive } = req.body;
  try {
    const existing = await Level.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy khối' });
    const identity = await validateGrade(req.body, existing);
    if (identity.grade !== gradeNumber(existing) && await hasGradeData(existing)) fail('Khối đã có dữ liệu liên kết. Có thể sửa tên và màu, không đổi số khối.');
    const level = await Level.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...identity,
          ...(description !== undefined && { description }),
          ...(bgColor && { bgColor }),
          ...(textColor && { textColor }),
          ...(order !== undefined && { order }),
          ...(isActive !== undefined && { isActive }),
        }
      },
      { new: true, runValidators: true }
    );
    if (!level) return res.status(404).json({ message: 'Không tìm thấy level' });
    res.json(publicLevel(level));
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: 'Tên khối đã tồn tại' });
    } else {
      res.status(errorStatus(err)).json({ message: err.message });
    }
  }
};

// DELETE /api/levels/:id
const deleteLevel = async (req, res) => {
  try {
    const level = await Level.findById(req.params.id);
    if (!level) return res.status(404).json({ message: 'Không tìm thấy khối' });
    if (await hasGradeData(level)) fail('Khối đang được dùng trong đề kiểm tra, chủ đề hoặc kho câu hỏi. Cần xử lý dữ liệu liên kết trước khi xóa.');
    await level.deleteOne();
    res.json({ message: 'Đã xóa khối' });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: err.message });
  }
};

// POST /api/levels/reorder - reorder levels
const reorderLevels = async (req, res) => {
  const { levelIds } = req.body;
  if (!Array.isArray(levelIds)) {
    return res.status(400).json({ message: 'levelIds phải là một mảng' });
  }

  try {
    await Promise.all(
      levelIds.map((id, idx) => Level.findByIdAndUpdate(id, { order: idx }))
    );
    const levels = await Level.find().sort({ order: 1 });
    res.json(levels.map(publicLevel));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLevels, getLevelById, createLevel, updateLevel, deleteLevel, reorderLevels };
