export const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

export function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDays(key, days) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekStartFor(key = todayKey()) {
  const day = new Date(`${key}T00:00:00Z`).getUTCDay();
  return addDays(key, -((day + 6) % 7));
}

export const entryKey = entry => `${entry.class?._id || entry.class}:${entry.date}:${entry.startTime}`;
export const shortDate = key => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

export function teachingSessionLink(entry) {
  const params = new URLSearchParams({ classId: String(entry.class?._id || entry.class), date: entry.date, startTime: entry.startTime, fromSchedule: '1' });
  if (entry.lesson) params.set('lessonId', String(entry.lesson._id || entry.lesson));
  return `/admin/teaching-sessions?${params}`;
}

export function classLessonGroups(classroom, lessonsByCourse) {
  return (classroom?.courses || []).map(course => {
    const id = String(course._id || course);
    return {
      id, title: course.title || 'Khóa học',
      lessons: [...(lessonsByCourse[id] || [])].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.title || '').localeCompare(String(b.title || ''), 'vi')),
    };
  });
}

export function weekEntries(classes, weekStart, saved = []) {
  const entries = new Map();
  classes.filter(cls => cls.isActive !== false).forEach(cls => (cls.schedules || []).forEach(schedule => {
    if (!schedule.startTime || !schedule.endTime || schedule.endTime <= schedule.startTime) return;
    const day = Number(schedule.dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) return;
    const date = addDays(weekStart, (day + 6) % 7);
    if ((cls.startDate && date < cls.startDate.slice(0, 10)) || (cls.endDate && date > cls.endDate.slice(0, 10))) return;
    const entry = { class: cls._id, date, startTime: schedule.startTime, endTime: schedule.endTime, topic: '', note: '', room: schedule.room || '' };
    entries.set(entryKey(entry), entry);
  }));
  saved.forEach(entry => {
    const key = entryKey(entry);
    entries.set(key, { ...entries.get(key), ...entry });
  });
  return [...entries.values()].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || String(a.class).localeCompare(String(b.class)));
}
