const Class = require('../models/Class');
const Lesson = require('../models/Lesson');

// Old plans stored only a title. Resolve it only when one lesson in the
// class's courses matches exactly; never substitute the next lesson.
async function resolveWeeklyPlanLessons(entries) {
  const legacy = entries.filter(entry => !entry.lesson && entry.topic?.trim());
  if (!legacy.length) return entries;
  const classes = await Class.find({ _id: { $in: [...new Set(legacy.map(entry => String(entry.class)))] } }).select('courses');
  const classCourses = new Map(classes.map(cls => [String(cls._id), (cls.courses || []).map(course => String(course._id || course))]));
  const courseIds = [...new Set([...classCourses.values()].flat())];
  if (!courseIds.length) return entries;
  const lessons = await Lesson.find({ course: { $in: courseIds }, title: { $in: [...new Set(legacy.map(entry => entry.topic.trim()))] } }).select('title course');
  return entries.map(entry => {
    if (entry.lesson || !entry.topic?.trim()) return entry;
    const courses = classCourses.get(String(entry.class)) || [];
    const matches = lessons.filter(lesson => lesson.title === entry.topic.trim() && courses.includes(String(lesson.course?._id || lesson.course)));
    return matches.length === 1 ? { ...entry, lesson: matches[0]._id } : entry;
  });
}

module.exports = { resolveWeeklyPlanLessons };
