const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getLessons, getLessonById, createLesson, updateLesson, deleteLesson } = require('../controllers/lessonController');

router.get('/', protect, getLessons);
router.get('/:id', protect, getLessonById);
router.post('/', protect, adminOnly, createLesson);
router.put('/:id', protect, adminOnly, updateLesson);
router.delete('/:id', protect, adminOnly, deleteLesson);

module.exports = router;
