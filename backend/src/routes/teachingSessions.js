const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getTeachingSessions,
  getTeachingSessionById,
  getTeachingPlanner,
  generateParentSummary,
  createTeachingSession,
  updateTeachingSession,
  deleteTeachingSession,
} = require('../controllers/teachingSessionController');

router.get('/planner', protect, adminOnly, getTeachingPlanner);
router.post('/parent-summary', protect, adminOnly, generateParentSummary);
router.get('/', protect, adminOnly, getTeachingSessions);
router.get('/:id', protect, adminOnly, getTeachingSessionById);
router.post('/', protect, adminOnly, createTeachingSession);
router.put('/:id', protect, adminOnly, updateTeachingSession);
router.delete('/:id', protect, adminOnly, deleteTeachingSession);

module.exports = router;
