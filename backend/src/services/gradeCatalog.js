const Level = require('../models/Level');
function gradeNumber(level) {
  if (Number.isInteger(level?.grade) && level.grade >= 1 && level.grade <= 12) return level.grade;
  const name = String(level?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const match = name.match(/^(?:(?:lop|khoi)\s*)?(\d{1,2})(?:\s|$)/i);
  const grade = match ? Number(match[1]) : null;
  return grade >= 1 && grade <= 12 ? grade : null;
}
function publicLevel(level) {
  const object = level.toObject ? level.toObject() : { ...level };
  const grade = gradeNumber(object);
  return { ...object, grade, name: grade ? object.name.replace(/^lớp\s*/i, 'Khối ') : object.name };
}
async function gradeCatalog() {
  const levels = await Level.find({ isActive: { $ne: false } }).sort({ order: 1, createdAt: 1, _id: 1 }).lean();
  const seen = new Set();
  return levels.map(publicLevel).filter(level => level.grade && !seen.has(level.grade) && seen.add(level.grade));
}
async function requireGrade(grade) {
  const found = (await gradeCatalog()).find(level => level.grade === grade);
  if (!found) { const error = new Error('Khối chưa được cấu hình hoặc đã tắt tại Cài đặt → Khối'); error.status = 400; throw error; }
  return found;
}
module.exports = { gradeNumber, publicLevel, gradeCatalog, requireGrade };
