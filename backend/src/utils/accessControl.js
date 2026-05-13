const ClassEnrollment = require('../models/ClassEnrollment');
const Class = require('../models/Class');

/**
 * Kiểm tra học sinh có quyền truy cập một khóa học
 * thông qua bất kỳ lớp học nào đang được duyệt có chứa khóa học đó.
 */
const hasAccessToCourse = async (userId, courseId) => {
  const classes = await Class.find({ courses: courseId }).select('_id');
  if (!classes.length) return false;
  const classIds = classes.map((c) => c._id);
  const approved = await ClassEnrollment.findOne({
    student: userId,
    class: { $in: classIds },
    status: 'approved',
  });
  return !!approved;
};

module.exports = { hasAccessToCourse };
