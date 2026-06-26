const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getExams,
  getExamById,
  createExam,
  updateExam,
  deleteExam,
  getExamResults,
  saveExamResult,
  getStudentResult,
  adminSubmitExamImages,
  aiGradeExamResult,
  getStudentExams,
  getStudentExamDetail,
  submitExamImages,
  generateSharedPractice,
} = require('../controllers/examController');
const { getCurriculum, generateExamPaper, saveExamPaper, exportExamPaper } = require('../controllers/examPaperController');

// Student routes (phải đặt TRƯỚC /:id để không bị match nhầm)
router.get('/student', protect, getStudentExams);
router.get('/student/:id', protect, getStudentExamDetail);
router.post('/student/:id/submit', protect, submitExamImages);

// Admin routes
router.get('/paper/curriculum', protect, adminOnly, getCurriculum);
router.post('/paper/generate', protect, adminOnly, generateExamPaper);
router.post('/paper/save', protect, adminOnly, saveExamPaper);
router.post('/paper/export', protect, adminOnly, exportExamPaper);
router.get('/', protect, adminOnly, getExams);
router.get('/:id', protect, adminOnly, getExamById);
router.post('/', protect, adminOnly, createExam);
router.put('/:id', protect, adminOnly, updateExam);
router.delete('/:id', protect, adminOnly, deleteExam);

// Results
router.get('/:id/results', protect, adminOnly, getExamResults);
router.post('/:id/results', protect, adminOnly, saveExamResult);
router.get('/:id/results/:studentId', protect, adminOnly, getStudentResult);
router.post('/:id/results/:studentId/images', protect, adminOnly, adminSubmitExamImages);
router.post('/:id/results/:studentId/ai-grade', protect, adminOnly, aiGradeExamResult);
router.post('/:id/generate-practice', protect, adminOnly, generateSharedPractice);

module.exports = router;
