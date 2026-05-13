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
} = require('../controllers/classEnrollmentController');

// Học sinh
router.get('/my', protect, getMyClassEnrollments);
router.post('/', protect, applyToClass);
router.delete('/:id', protect, cancelEnrollment);

// Admin
router.get('/', protect, adminOnly, getAllEnrollments);
router.put('/:id/approve', protect, adminOnly, approveEnrollment);
router.put('/:id/reject', protect, adminOnly, rejectEnrollment);

module.exports = router;
