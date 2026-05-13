const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getClasses, getClassById, createClass, updateClass, deleteClass,
  addStudentToClass, removeStudentFromClass,
} = require('../controllers/classController');

router.get('/', protect, getClasses);
router.get('/:id', protect, getClassById);
router.post('/', protect, adminOnly, createClass);
router.put('/:id', protect, adminOnly, updateClass);
router.delete('/:id', protect, adminOnly, deleteClass);
router.post('/:id/students', protect, adminOnly, addStudentToClass);
router.delete('/:id/students/:studentId', protect, adminOnly, removeStudentFromClass);

module.exports = router;
