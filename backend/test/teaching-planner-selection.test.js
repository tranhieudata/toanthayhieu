const { test } = require('node:test');
const assert = require('node:assert/strict');
const TeachingSession = require('../src/models/TeachingSession');
const Class = require('../src/models/Class');
const Lesson = require('../src/models/Lesson');
const Exam = require('../src/models/Exam');
const Homework = require('../src/models/Homework');
const WeeklyTeachingPlan = require('../src/models/WeeklyTeachingPlan');
const { getTeachingPlanner } = require('../src/controllers/teachingSessionController');

function query(value) {
  return { populate() { return this; }, select() { return this; }, sort() { return this; }, limit() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });

function fixture(t) {
  t.mock.method(WeeklyTeachingPlan, 'findOne', async () => null);
  const sessions = [
    { _id: 'session-a', class: 'class-a', date: new Date('2026-11-04'), startTime: '19:00', plannedLesson: 'lesson-a', summary: 'Content A' },
    { _id: 'session-b', class: 'class-b', date: new Date('2026-11-04'), startTime: '19:00', plannedLesson: 'lesson-b', summary: 'Content B' },
    { _id: 'session-c', class: 'class-a', date: new Date('2026-11-04'), startTime: '20:00', plannedLesson: 'lesson-c', actualLesson: 'actual-c', summary: 'Content C' },
  ];
  const lessons = Object.fromEntries(['lesson-a', 'lesson-b', 'lesson-c', 'actual-c', 'suggested'].map(_id => [_id, { _id, title: _id, content: `Body ${_id}`, course: 'course' }]));
  t.mock.method(TeachingSession, 'findOne', filter => query(sessions.find(session => {
    if (filter.date?.$lt && !filter.date?.$gte) return false;
    return session.class === filter.class && session.date >= filter.date.$gte && session.date < filter.date.$lt
      && (!filter.startTime || session.startTime === filter.startTime)
      && (!filter.$or || filter.$or.some(item => Object.entries(item).every(([key, value]) => session[key] === value)));
  }) || null));
  t.mock.method(TeachingSession, 'findById', id => query(sessions.find(session => session._id === id)));
  t.mock.method(TeachingSession, 'find', () => query([]));
  t.mock.method(Class, 'findById', () => query({ courses: ['course'] }));
  t.mock.method(Lesson, 'findById', id => query(lessons[id]));
  t.mock.method(Lesson, 'find', () => query([lessons.suggested]));
  t.mock.method(Exam, 'find', () => query([]));
  t.mock.method(Homework, 'find', () => query([]));
}

test('opening a calendar slot returns only its class, date, lesson and content', async t => {
  fixture(t);
  for (const [classId, lessonId, expected] of [['class-a', 'lesson-a', 'Content A'], ['class-b', 'lesson-b', 'Content B']]) {
    const res = response();
    await getTeachingPlanner({ query: { classId, date: '2026-11-04', startTime: '19:00', lessonId, fromSchedule: '1' }, user: { _id: 'admin' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.data.currentSession.class, classId);
    assert.equal(res.data.currentSession.summary, expected);
    assert.equal(res.data.lesson._id, lessonId);
    assert.equal(res.data.lesson.content, `Body ${lessonId}`);
  }
});

test('same-day slots stay separate and show the lesson actually taught', async t => {
  fixture(t);
  const res = response();
  await getTeachingPlanner({ query: { classId: 'class-a', date: '2026-11-04', startTime: '20:00', lessonId: 'lesson-c', fromSchedule: '1' }, user: { _id: 'admin' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.data.currentSession._id, 'session-c');
  assert.equal(res.data.lesson._id, 'actual-c');
});

test('an unplanned calendar slot does not substitute a suggested lesson', async t => {
  fixture(t);
  const res = response();
  await getTeachingPlanner({ query: { classId: 'class-a', date: '2026-11-05', startTime: '19:00', fromSchedule: '1' }, user: { _id: 'admin' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.data.currentSession, null);
  assert.equal(res.data.lesson, null);
  assert.equal(res.data.suggestedLesson._id, 'suggested');
});

test('legacy calendar title resolves within the class courses and overrides an unrelated lesson parameter', async t => {
  fixture(t);
  t.mock.method(WeeklyTeachingPlan, 'findOne', async () => ({ entries: [{ class: 'class-a', date: '2026-11-05', startTime: '19:00', topic: 'Viet lesson', note: 'Prepare test' }] }));
  t.mock.method(Class, 'find', () => query([{ _id: 'class-a', courses: ['course'] }]));
  t.mock.method(Lesson, 'find', filter => query(filter.title ? [{ _id: 'lesson-viet', title: 'Viet lesson', course: 'course' }] : []));
  t.mock.method(Lesson, 'findById', id => query({ _id: id, title: id === 'lesson-viet' ? 'Viet lesson' : 'Wrong exam', content: 'Matching content', course: 'course' }));
  const res = response();
  await getTeachingPlanner({ query: { classId: 'class-a', date: '2026-11-05', startTime: '19:00', lessonId: 'wrong-exam', fromSchedule: '1' }, user: { _id: 'admin' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.data.lesson._id, 'lesson-viet');
  assert.equal(res.data.calendarEntry.note, 'Prepare test');
  assert.equal(res.data.currentSession, null);
});

test('an unresolved legacy plan never opens an unrelated suggested lesson', async t => {
  fixture(t);
  t.mock.method(WeeklyTeachingPlan, 'findOne', async () => ({ entries: [{ class: 'class-a', date: '2026-11-05', startTime: '19:00', topic: 'Missing lesson' }] }));
  t.mock.method(Class, 'find', () => query([{ _id: 'class-a', courses: ['course'] }]));
  t.mock.method(Lesson, 'find', () => query([]));
  const res = response();
  await getTeachingPlanner({ query: { classId: 'class-a', date: '2026-11-05', startTime: '19:00', lessonId: 'wrong-exam', fromSchedule: '1' }, user: { _id: 'admin' } }, res);
  assert.equal(res.code, 400);
  assert.equal(res.data.lesson, undefined);
});
