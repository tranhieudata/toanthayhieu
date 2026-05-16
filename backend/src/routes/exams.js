const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getExams, getExamById, createExam, updateExam, deleteExam, getExamResults, saveExamResult, getStudentResult, getStudentExams, getStudentExamDetail, submitExamImages } = require('../controllers/examController');

// Student routes (phải đặt TRƯỚC /:id để không bị match nhầm)
router.get('/student', protect, getStudentExams);
router.get('/student/:id', protect, getStudentExamDetail);
router.post('/student/:id/submit', protect, submitExamImages);

// Admin routes
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
