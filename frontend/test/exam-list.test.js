import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examGradeLabel, examClassNames, filterAndSortExams } from '../src/utils/examList.js';

const exams = [
  { _id: 'both', title: 'Đề ôn tập', createdAt: '2026-11-01', updatedAt: '2026-11-14', classSchedules: [{ class: { _id: 'a', name: '6A' } }], homeworkClasses: [{ _id: 'a', name: '6A' }, { _id: 'b', name: '6B' }] },
  { _id: 'homework', title: 'Bài tập cuối kỳ', createdAt: '2026-11-12', homeworkClasses: [{ _id: 'a', name: '6A' }] },
  { _id: 'unused', title: 'Đề mới', createdAt: '2026-11-14', classSchedules: [] },
];

test('assignment filters support both uses and do not classify unused papers as exams', () => {
  assert.deepEqual(filterAndSortExams(exams, '', 'homework', 'created').map(e => e._id), ['homework', 'both']);
  assert.deepEqual(filterAndSortExams(exams, '', 'exam', 'created').map(e => e._id), ['both']);
  assert.deepEqual(examClassNames(exams[0]), ['6A', '6B']);
});

test('search ignores Vietnamese accents and creation order stays independent of edits', () => {
  assert.deepEqual(filterAndSortExams(exams, '  DE ON  ', '', 'created').map(e => e._id), ['both']);
  assert.equal(filterAndSortExams(exams, '', '', 'created')[0]._id, 'unused');
  assert.equal(filterAndSortExams(exams, '', '', 'updated')[0]._id, 'both');
  assert.equal(exams[0]._id, 'both');
});

test('grade labels use explicit level or paper metadata without guessing from titles', () => {
  assert.equal(examGradeLabel({ level: { name: 'Lớp 6' } }), 'Khối 6');
  assert.equal(examGradeLabel({ level: { name: 'Khối 7' } }), 'Khối 7');
  assert.equal(examGradeLabel({ examPackage: { meta: { grade: 8 } } }), 'Khối 8');
  assert.equal(examGradeLabel({ title: 'Toán 6' }), '');
});
