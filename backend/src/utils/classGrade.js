function currentYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date));
}
function gradeFromBirthYear(birthYear, date = new Date()) {
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear(date)) return null;
  const grade = currentYear(date) - birthYear - 5;
  return grade >= 1 && grade <= 12 ? grade : null;
}
const classGrade = (cls, date = new Date()) => gradeFromBirthYear(cls?.birthYear, date);
module.exports = { currentYear, gradeFromBirthYear, classGrade };
