const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const WeeklyTeachingPlan = require('../src/models/WeeklyTeachingPlan');
const TeachingSession = require('../src/models/TeachingSession');
const Class = require('../src/models/Class');
const Lesson = require('../src/models/Lesson');
const { validateWeekStart, validateEntries, getWeeklyTeachingPlan, saveWeeklyTeachingPlan } = require('../src/controllers/weeklyTeachingPlanController');
const { getTeachingSessions } = require('../src/controllers/teachingSessionController');
const { sessionDayRange } = require('../src/services/teachingSessionDates');
const { syncWeeklyTeachingSessions } = require('../src/services/syncWeeklyTeachingSessions');

beforeEach(t => {
  t.mock.method(Class, 'find', () => ({ select: async () => [] }));
  t.mock.method(Lesson, 'find', () => ({ select: async () => [] }));
  t.mock.method(TeachingSession, 'find', async () => []);
  t.mock.method(TeachingSession, 'updateOne', async () => ({}));
  t.mock.method(TeachingSession, 'deleteMany', async () => ({}));
});

const classId = '507f1f77bcf86cd799439011';
const entry = { class: classId, date: '2026-11-02', startTime: '17:00', endTime: '18:30', topic: '  Ôn tập  ', note: 'Chuẩn bị đề' };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });

test('weekly plan validates Monday, dates, times and duplicate sessions', () => {
  assert.equal(validateWeekStart('2026-11-02').getUTCDay(), 1);
  for (const date of ['2026-11-03', '2026-02-30', 'invalid']) assert.throws(() => validateWeekStart(date));
  assert.equal(validateEntries('2026-11-02', [entry])[0].topic, 'Ôn tập');
  for (const invalid of [{ date: '2026-11-09' }, { date: '2026-11-01' }, { endTime: '16:00' }, { startTime: '25:00' }, { class: 'bad' }, { note: 'a'.repeat(2001) }]) {
    assert.throws(() => validateEntries('2026-11-02', [{ ...entry, ...invalid }]));
  }
  assert.throws(() => validateEntries('2026-11-02', [entry, entry]));
  assert.equal(validateEntries('2026-11-02', [entry, { ...entry, startTime: '19:00', endTime: '20:00' }]).length, 2);
});

test('plans persist by week; new weeks start empty and do not overwrite old plans', async t => {
  const plans = new Map();
  t.mock.method(WeeklyTeachingPlan, 'findOne', async ({ weekStart }) => plans.get(weekStart));
  t.mock.method(WeeklyTeachingPlan, 'findOneAndUpdate', async ({ weekStart }, { $set }) => {
    const plan = { weekStart, ...$set };
    plans.set(weekStart, plan);
    return plan;
  });
  const saved = response();
  await saveWeeklyTeachingPlan({ body: { weekStart: '2026-11-02', entries: [entry] }, user: { _id: classId } }, saved);
  assert.equal(saved.code, 200);
  const next = response();
  await getWeeklyTeachingPlan({ query: { weekStart: '2026-11-09' } }, next);
  assert.deepEqual(next.data.entries, []);
  const original = response();
  await getWeeklyTeachingPlan({ query: { weekStart: '2026-11-02' } }, original);
  assert.equal(original.data.entries[0].topic, 'Ôn tập');
  assert.equal(plans.size, 1);
});

test('invalid plan is rejected without writing', async t => {
  const write = t.mock.method(WeeklyTeachingPlan, 'findOneAndUpdate', () => { throw new Error('Unexpected write'); });
  const res = response();
  await saveWeeklyTeachingPlan({ body: { weekStart: '2026-11-03', entries: [] }, user: { _id: classId } }, res);
  assert.equal(res.code, 400);
  assert.equal(write.mock.callCount(), 0);
});

test('journal returns all dates for the same lesson and orders by teaching date', async t => {
  const sessions = [{ _id: 'new', class: classId, plannedLesson: 'lesson', date: '2026-11-04' }, { _id: 'old', class: classId, plannedLesson: 'lesson', date: '2026-11-02' }];
  let sort;
  t.mock.method(TeachingSession, 'find', () => ({ populate() { return this; }, sort(value) { sort = value; return Promise.resolve(sessions); } }));
  const res = response();
  await getTeachingSessions({ query: { classId } }, res);
  assert.deepEqual(sort, { date: -1, createdAt: -1 });
  assert.deepEqual(res.data.map(item => item._id), ['new', 'old']);
});

test('session lookup uses separate date ranges for repeated lessons', () => {
  const first = sessionDayRange('2026-11-02');
  const next = sessionDayRange('2026-11-04');
  assert.equal(first.$gte.toISOString(), '2026-11-02T00:00:00.000Z');
  assert(first.$lt <= next.$gte);
  assert.throws(() => sessionDayRange('bad'));
});

test('selected lesson is saved by ID with its actual title from a course in the class', async t => {
  const lessonId = '507f1f77bcf86cd799439012';
  const courseId = '507f1f77bcf86cd799439013';
  t.mock.method(Class, 'find', () => ({ select: async () => [{ _id: classId, courses: [courseId] }] }));
  t.mock.method(Lesson, 'find', () => ({ select: async () => [{ _id: lessonId, title: 'Bài học trong khóa', course: courseId }] }));
  t.mock.method(WeeklyTeachingPlan, 'findOneAndUpdate', async (_, { $set }) => $set);
  const res = response();
  await saveWeeklyTeachingPlan({ body: { weekStart: '2026-11-02', entries: [{ ...entry, lesson: lessonId, topic: 'Forged title' }] }, user: { _id: classId } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.data.entries[0].lesson, lessonId);
  assert.equal(res.data.entries[0].topic, 'Bài học trong khóa');
});

test('lesson from a course outside the class is rejected without saving', async t => {
  const lessonId = '507f1f77bcf86cd799439012';
  t.mock.method(Class, 'find', () => ({ select: async () => [{ _id: classId, courses: ['course-a'] }] }));
  t.mock.method(Lesson, 'find', () => ({ select: async () => [{ _id: lessonId, title: 'Other course lesson', course: 'course-b' }] }));
  const write = t.mock.method(WeeklyTeachingPlan, 'findOneAndUpdate', () => { throw new Error('Unexpected write'); });
  const res = response();
  await saveWeeklyTeachingPlan({ body: { weekStart: '2026-11-02', entries: [{ ...entry, lesson: lessonId }] }, user: { _id: classId } }, res);
  assert.equal(res.code, 400);
  assert.equal(write.mock.callCount(), 0);
});

function mockSessionStore(t, initial = []) {
  const sessions = initial.map(session => ({ ...session }));
  t.mock.method(TeachingSession, 'find', async () => sessions);
  t.mock.method(TeachingSession, 'updateOne', async (filter, update) => {
    const current = sessions.find(session => filter._id ? session._id === filter._id && session.status === filter.status : session.weeklyPlanKey === filter.weeklyPlanKey);
    if (current && update.$set) Object.assign(current, update.$set);
    if (!current && update.$setOnInsert) sessions.push({ _id: `session-${sessions.length}`, ...update.$setOnInsert });
  });
  t.mock.method(TeachingSession, 'deleteMany', async filter => {
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].status === 'planned' && sessions[i].weeklyPlanKey?.startsWith('2026-11-02:') && !filter.weeklyPlanKey.$nin.includes(sessions[i].weeklyPlanKey)) sessions.splice(i, 1);
    }
  });
  return sessions;
}

test('saving a weekly plan creates sessions with date, lesson, class and note; repeated saves do not duplicate', async t => {
  const sessions = mockSessionStore(t);
  const planned = { ...entry, lesson: 'lesson-a' };
  await syncWeeklyTeachingSessions('2026-11-02', [planned], 'admin');
  await syncWeeklyTeachingSessions('2026-11-02', [planned], 'admin');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].class, classId);
  assert.equal(sessions[0].date.toISOString().slice(0, 10), entry.date);
  assert.equal(sessions[0].plannedLesson, 'lesson-a');
  assert.equal(sessions[0].planningNote, entry.note);
  assert.equal(sessions[0].status, 'planned');
  await syncWeeklyTeachingSessions('2026-11-02', [{ ...planned, lesson: 'lesson-b' }], 'admin');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].plannedLesson, 'lesson-b');
});

test('sync preserves completed sessions and clears only drafts owned by the plan', async t => {
  const key = `2026-11-02:${classId}:${entry.date}:${entry.startTime}`;
  const sessions = mockSessionStore(t, [
    { _id: 'completed', weeklyPlanKey: key, class: classId, date: new Date(entry.date), status: 'completed', actualLesson: 'actual', summary: 'Taught' },
    { _id: 'draft', weeklyPlanKey: `${key}-other`, status: 'planned', date: new Date(entry.date) },
    { _id: 'manual', status: 'planned', date: new Date(entry.date) },
  ]);
  await syncWeeklyTeachingSessions('2026-11-02', [{ ...entry, lesson: 'new' }], 'admin');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].actualLesson, 'actual');
  assert.equal(sessions[0].summary, 'Taught');
  assert(sessions.some(session => session._id === 'manual'));
});

test('sync reuses an existing draft for the same date, lesson and class', async t => {
  const sessions = mockSessionStore(t, [{ _id: 'existing', class: classId, date: new Date(entry.date), plannedLesson: 'lesson-a', status: 'planned', teacherNote: 'Teacher note' }]);
  await syncWeeklyTeachingSessions('2026-11-02', [{ ...entry, lesson: 'lesson-a' }], 'admin');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]._id, 'existing');
  assert.equal(sessions[0].teacherNote, 'Teacher note');
  assert.equal(sessions[0].startTime, entry.startTime);
});
