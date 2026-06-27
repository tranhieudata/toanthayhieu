const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getLessons, getLessonById, createLesson, updateLesson, deleteLesson, toggleLessonStatus, generateLessonContent, addCriteria, updateCriteria, deleteCriteria } = require('../controllers/lessonController');

router.get('/', protect, getLessons);
router.post('/generate-content', protect, adminOnly, generateLessonContent);
router.get('/:id', protect, getLessonById);
router.post('/', protect, adminOnly, createLesson);
router.put('/:id', protect, adminOnly, updateLesson);
router.patch('/:id/toggle', protect, adminOnly, toggleLessonStatus);
router.delete('/:id', protect, adminOnly, deleteLesson);

// Criteria routes
router.post('/:id/criteria', protect, adminOnly, addCriteria);
router.put('/:id/criteria/:criteriaId', protect, adminOnly, updateCriteria);
router.delete('/:id/criteria/:criteriaId', protect, adminOnly, deleteCriteria);

module.exports = router;
