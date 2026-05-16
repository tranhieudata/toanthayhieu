const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getExams, getExamById, createExam, updateExam, deleteExam, getExamResults, saveExamResult, getStudentResult } = require('../controllers/examController');

router.get('/', protect, adminOnly, getExams);
router.get('/:id', protect, adminOnly, getExamById);
router.post('/', protect, adminOnly, createExam);
router.put('/:id', protect, adminOnly, updateExam);
router.delete('/:id', protect, adminOnly, deleteExam);

// Results
router.get('/:id/results', protect, adminOnly, getExamResults);
router.post('/:id/results', protect, adminOnly, saveExamResult);
router.get('/:id/results/:studentId', protect, adminOnly, getStudentResult);

module.exports = router;
