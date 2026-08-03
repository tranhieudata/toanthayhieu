const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getStudentHomeworks,
  getHomeworks,
  getHomeworkById,
  createHomework,
  updateHomework,
  deleteHomework,
  getHomeworkSubmissions,
  getStudentSubmission,
  submitHomework,
  gradeSubmission,
  bulkGradeSubmissions,
  autoCreateSubmissions,
  getClassStudents,
  getPublicHomeworkPrintByToken,
  adminSubmitHomework,
} = require('../controllers/homeworkController');

router.get('/public-print/:token', getPublicHomeworkPrintByToken);

// Student routes (phải đặt TRƯỚC /:id để không bị match nhầm)
router.get('/student/list', protect, getStudentHomeworks);
router.post('/:id/submit', protect, submitHomework);
router.get('/:id/my-submission', protect, getStudentSubmission);

// Admin routes
router.get('/', protect, adminOnly, getHomeworks);
router.get('/:id', protect, adminOnly, getHomeworkById);
router.post('/', protect, adminOnly, createHomework);
router.put('/:id', protect, adminOnly, updateHomework);
router.delete('/:id', protect, adminOnly, deleteHomework);

// Submissions
router.get('/:id/submissions', protect, adminOnly, getHomeworkSubmissions);
router.get('/:id/class-students', protect, adminOnly, getClassStudents);
router.post('/:id/auto-create-submissions', protect, adminOnly, autoCreateSubmissions);
router.post('/:id/submissions/admin-submit', protect, adminOnly, adminSubmitHomework);
router.post('/:id/submissions/bulk-grade', protect, adminOnly, bulkGradeSubmissions);
router.post('/:id/submissions/:studentId/grade', protect, adminOnly, gradeSubmission);

module.exports = router;
