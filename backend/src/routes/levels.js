const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getLevels, getLevelById, createLevel, updateLevel, deleteLevel, reorderLevels } = require('../controllers/levelController');

// Public routes
router.get('/', protect, getLevels);
router.get('/:id', protect, getLevelById);

// Admin routes
router.post('/', protect, adminOnly, createLevel);
router.put('/:id', protect, adminOnly, updateLevel);
router.delete('/:id', protect, adminOnly, deleteLevel);
router.post('/reorder', protect, adminOnly, reorderLevels);

module.exports = router;
