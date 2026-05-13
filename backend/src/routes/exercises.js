const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getExercises, getExerciseById, createExercise,
  updateExercise, deleteExercise, submitExercise,
} = require('../controllers/exerciseController');

router.get('/', protect, getExercises);
router.get('/:id', protect, getExerciseById);
router.post('/', protect, adminOnly, createExercise);
router.put('/:id', protect, adminOnly, updateExercise);
router.delete('/:id', protect, adminOnly, deleteExercise);
router.post('/:id/submit', protect, submitExercise);

module.exports = router;
