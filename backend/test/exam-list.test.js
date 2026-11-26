const { test } = require('node:test');
const assert = require('node:assert/strict');
const Exam = require('../src/models/Exam');
const Homework = require('../src/models/Homework');
const { getExams } = require('../src/controllers/examController');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
}

test('exam list includes linked homework classes without duplicates or deleted classes', async t => {
  const papers = [{ _id: 'both', classSchedules: [{ class: { _id: 'a', name: '6A' } }] }, { _id: 'unused' }];
  t.mock.method(Exam, 'find', () => ({ populate() { return this; }, sort: async () => papers }));
  t.mock.method(Homework, 'find', filter => {
    assert.deepEqual(filter, { sourceExam: { $in: ['both', 'unused'] } });
    return { select() { return this; }, populate() { return this; }, lean: async () => [
      { sourceExam: 'both', class: { _id: 'b', name: '6B' } },
      { sourceExam: 'both', class: { _id: 'b', name: '6B' } },
      { sourceExam: 'both', class: null },
    ] };
  });
  const res = response();
  await getExams({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.data[0].homeworkClasses, [{ _id: 'b', name: '6B' }]);
  assert.equal(res.data[0].classSchedules.length, 1);
  assert.deepEqual(res.data[1].homeworkClasses, []);
});

test('class filter includes both directly assigned exams and homework sources alongside other filters', async t => {
  t.mock.method(Homework, 'distinct', async (field, filter) => {
    assert.equal(field, 'sourceExam');
    assert.deepEqual(filter, { class: 'a' });
    return ['homework-paper', null];
  });
  t.mock.method(Exam, 'find', filter => {
    assert.deepEqual(filter, {
      $or: [{ 'classSchedules.class': 'a' }, { _id: { $in: ['homework-paper'] } }],
      level: 'level6', isTemplate: false,
    });
    return { populate() { return this; }, sort: async () => [] };
  });
  t.mock.method(Homework, 'find', () => ({ select() { return this; }, populate() { return this; }, lean: async () => [] }));
  const res = response();
  await getExams({ query: { classId: 'a', levelId: 'level6', isTemplate: 'false' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.data, []);
});
