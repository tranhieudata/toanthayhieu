const Class = require('../models/Class');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const { Policy } = require('../models/Community');

async function assignedHomeworkFilter(student) {
  const classes = await Class.find({ students: student, isActive: true }).select('_id').lean();
  return { class: { $in: classes.map(item => item._id) }, isPublished: true };
}

async function communityAccess(user) {
  if (user.role === 'admin') return { allowed: true, remaining: 0, homeworks: [] };
  const settings = await Policy.findOne({ key: 'default' }).select('homeworkAccessMode').lean();
  const homeworkAccessMode = settings?.homeworkAccessMode || 'submitted';
  const allowed = { allowed: true, remaining: 0, homeworks: [], homeworkAccessMode };
  if (homeworkAccessMode === 'none') return allowed;
  const homeworks = await Homework.find(await assignedHomeworkFilter(user._id))
    .select('title class dueDate').populate('class', 'name').sort({ dueDate: 1, createdAt: 1 }).lean();
  if (!homeworks.length) return allowed;
  // Empty records created by the teacher are not submitted work. Paper work
  // graded by a teacher counts, as do uploaded submissions awaiting grading.
  const completed = await HomeworkSubmission.find({
    student: user._id, homework: { $in: homeworks.map(item => item._id) },
    ...(homeworkAccessMode === 'graded' ? { status: 'graded' } : {
      $or: [{ 'submissionImages.0': { $exists: true } }, { status: 'graded' }],
    }),
  }).select('homework').lean();
  const ids = new Set(completed.map(item => String(item.homework)));
  const pending = homeworks.filter(item => !ids.has(String(item._id)));
  return { allowed: pending.length === 0, remaining: pending.length, homeworks: pending, homeworkAccessMode };
}

module.exports = { assignedHomeworkFilter, communityAccess };
