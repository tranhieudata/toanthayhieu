const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getCourses, getCourseById, createCourse, updateCourse,
  deleteCourse, enrollCourse, getAllCoursesAdmin,
} = require('../controllers/courseController');

router.get('/', getCourses);
router.get('/admin/all', protect, adminOnly, getAllCoursesAdmin);
router.get('/:id', getCourseById);
router.post('/', protect, adminOnly, createCourse);
router.put('/:id', protect, adminOnly, updateCourse);
router.delete('/:id', protect, adminOnly, deleteCourse);
router.post('/:id/enroll', protect, enrollCourse);

module.exports = router;
