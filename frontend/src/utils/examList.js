export function examGradeLabel(exam) {
  const name = exam.level?.name;
  if (name) return /^(khối|lớp)\s*/i.test(name) ? name.replace(/^(khối|lớp)\s*/i, 'Khối ') : `Khối ${name}`;
  const grade = exam.examPackage?.meta?.grade;
  return grade ? `Khối ${String(grade).replace(/^(khối|lớp)\s*/i, '')}` : '';
}

export function examClassNames(exam) {
  return [...new Set([
    ...(exam.classSchedules || []).map(schedule => schedule.class?.name),
    ...(exam.homeworkClasses || []).map(cls => cls.name),
  ].filter(Boolean))];
}

export function filterAndSortExams(exams, search, usage, sort) {
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const query = normalize(search).trim();
  return exams.filter(exam => {
    if (usage === 'homework' && !exam.homeworkClasses?.length) return false;
    if (usage === 'exam' && !exam.classSchedules?.some(schedule => schedule.class)) return false;
    return normalize(exam.title).includes(query);
  }).sort((a, b) => {
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'vi');
    const field = sort === 'updated' ? 'updatedAt' : 'createdAt';
    return (Date.parse(b[field]) || 0) - (Date.parse(a[field]) || 0);
  });
}
