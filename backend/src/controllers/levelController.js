const Level = require('../models/Level');

// GET /api/levels - get all levels
const getLevels = async (req, res) => {
  try {
    const levels = await Level.find().sort({ order: 1, createdAt: 1 });
    res.json(levels);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/levels/:id
const getLevelById = async (req, res) => {
  try {
    const level = await Level.findById(req.params.id);
    if (!level) return res.status(404).json({ message: 'Không tìm thấy level' });
    res.json(level);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/levels - create new level
const createLevel = async (req, res) => {
  const { name, description, bgColor, textColor, order } = req.body;
  if (!name) return res.status(400).json({ message: 'Tên level là bắt buộc' });

  try {
    const level = new Level({
      name,
      description: description || '',
      bgColor: bgColor || 'bg-blue-100',
      textColor: textColor || 'text-blue-700',
      order: order || 0,
    });
    await level.save();
    res.status(201).json(level);
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: `Level "${name}" đã tồn tại` });
    } else {
      res.status(500).json({ message: err.message });
    }
  }
};

// PUT /api/levels/:id
const updateLevel = async (req, res) => {
  const { name, description, bgColor, textColor, order, isActive } = req.body;
  try {
    const level = await Level.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(name && { name }),
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
    res.json(level);
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: `Level "${name}" đã tồn tại` });
    } else {
      res.status(500).json({ message: err.message });
    }
  }
};

// DELETE /api/levels/:id
const deleteLevel = async (req, res) => {
  try {
    const level = await Level.findByIdAndDelete(req.params.id);
    if (!level) return res.status(404).json({ message: 'Không tìm thấy level' });
    res.json({ message: 'Đã xóa level' });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.json(levels);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLevels, getLevelById, createLevel, updateLevel, deleteLevel, reorderLevels };
