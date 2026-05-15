const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getClasses, getClassById, createClass, updateClass, deleteClass,
  addStudentToClass, removeStudentFromClass, toggleClassLesson,
} = require('../controllers/classController');

router.get('/', getClasses);
router.get('/:id', getClassById);
router.post('/', protect, adminOnly, createClass);
router.put('/:id', protect, adminOnly, updateClass);
router.delete('/:id', protect, adminOnly, deleteClass);
router.post('/:id/students', protect, adminOnly, addStudentToClass);
router.delete('/:id/students/:studentId', protect, adminOnly, removeStudentFromClass);
router.patch('/:id/lessons/:lessonId/toggle', protect, adminOnly, toggleClassLesson);

module.exports = router;
