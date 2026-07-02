const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getUsers, getUserById, updateStudentProfile, resetStudentPassword, deleteUser, getMyEnrollments, getAdminStats, createStudent } = require('../controllers/userController');

router.get('/me/enrollments', protect, getMyEnrollments);
router.get('/admin/stats', protect, adminOnly, getAdminStats);
router.get('/', protect, adminOnly, getUsers);
router.post('/', protect, adminOnly, createStudent);
router.get('/:id', protect, adminOnly, getUserById);
router.put('/:id', protect, adminOnly, updateStudentProfile);
router.post('/:id/reset-password', protect, adminOnly, resetStudentPassword);
router.delete('/:id', protect, adminOnly, deleteUser);

module.exports = router;
