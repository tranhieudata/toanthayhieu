import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, classLessonGroups, teachingSessionLink, weekStartFor, weekEntries } from '../src/utils/weeklyTeachingPlan.js';

test('week navigation handles Sunday and year boundaries', () => {
  assert.equal(weekStartFor('2026-11-08'), '2026-11-02');
  assert.equal(weekStartFor('2026-11-09'), '2026-11-09');
  assert.equal(weekStartFor('2027-01-01'), '2026-12-28');
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
});

const classes = [{ _id: 'class', schedules: [
  { dayOfWeek: 1, startTime: '19:00', endTime: '20:30' },
  { dayOfWeek: 1, startTime: '17:00', endTime: '18:30' },
  { dayOfWeek: 0, startTime: '08:00', endTime: '09:30' },
] }];

test('week entries retain multiple sessions per day and saved plans', () => {
  const entries = weekEntries(classes, '2026-11-02', [{ class: 'class', date: '2026-11-02', startTime: '17:00', endTime: '18:30', topic: 'Lesson', note: 'Prepare' }]);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].topic, 'Lesson');
  assert.equal(entries[1].startTime, '19:00');
  assert.equal(entries[2].date, '2026-11-08');
  assert(weekEntries(classes, '2026-11-09').every(entry => entry.topic === ''));
});

test('class dates and active state bound recurring schedules', () => {
  assert.equal(weekEntries([{ ...classes[0], isActive: false }], '2026-11-02').length, 0);
  assert.equal(weekEntries([{ ...classes[0], startDate: '2026-11-03', endDate: '2026-11-07' }], '2026-11-02').length, 0);
});

test('lesson options only include courses in the selected class and sort lesson order', () => {
  const catalog = { a: [{ _id: 'a2', order: 2 }, { _id: 'a1', order: 1 }], b: [{ _id: 'b1' }] };
  const groups = classLessonGroups({ courses: [{ _id: 'a', title: 'Course A' }] }, catalog);
  assert.deepEqual(groups.map(group => group.id), ['a']);
  assert.equal(groups[0].title, 'Course A');
  assert.deepEqual(groups[0].lessons.map(lesson => lesson._id), ['a1', 'a2']);
  assert.deepEqual(classLessonGroups({ courses: ['b'] }, catalog)[0].lessons.map(lesson => lesson._id), ['b1']);
  assert.deepEqual(classLessonGroups({ courses: [] }, catalog), []);
});

test('calendar links preserve the exact class, date, lesson and time for each slot', () => {
  const first = { class: 'class-a', date: '2026-11-04', startTime: '19:00', lesson: 'lesson-a' };
  const second = { ...first, class: 'class-b', startTime: '20:00', lesson: 'lesson-b' };
  for (const entry of [first, second]) {
    const link = new URL(teachingSessionLink(entry), 'http://localhost');
    assert.equal(link.pathname, '/admin/teaching-sessions');
    assert.equal(link.searchParams.get('classId'), entry.class);
    assert.equal(link.searchParams.get('date'), entry.date);
    assert.equal(link.searchParams.get('lessonId'), entry.lesson);
    assert.equal(link.searchParams.get('startTime'), entry.startTime);
    assert.equal(link.searchParams.get('fromSchedule'), '1');
  }
  const empty = new URL(teachingSessionLink({ ...first, lesson: null }), 'http://localhost');
  assert.equal(empty.searchParams.has('lessonId'), false);
});
