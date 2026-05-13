const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getUsers, getUserById, updateUser, deleteUser, getMyEnrollments, getAdminStats } = require('../controllers/userController');

router.get('/me/enrollments', protect, getMyEnrollments);
router.get('/admin/stats', protect, adminOnly, getAdminStats);
router.get('/', protect, adminOnly, getUsers);
router.get('/:id', protect, adminOnly, getUserById);
router.put('/:id', protect, adminOnly, updateUser);
router.delete('/:id', protect, adminOnly, deleteUser);

module.exports = router;
