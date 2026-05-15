const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  applyToClass,
  getAllEnrollments,
  getMyClassEnrollments,
  approveEnrollment,
  rejectEnrollment,
  cancelEnrollment,
  adminAddStudent,
  adminRemoveStudent,
} = require('../controllers/classEnrollmentController');

// Admin trực tiếp (phải trước /:id)
router.post('/admin-add', protect, adminOnly, adminAddStudent);
router.post('/admin-remove', protect, adminOnly, adminRemoveStudent);

// Học sinh
router.get('/my', protect, getMyClassEnrollments);
router.post('/', protect, applyToClass);
router.delete('/:id', protect, cancelEnrollment);

// Admin
router.get('/', protect, adminOnly, getAllEnrollments);
router.put('/:id/approve', protect, adminOnly, approveEnrollment);
router.put('/:id/reject', protect, adminOnly, rejectEnrollment);

module.exports = router;
