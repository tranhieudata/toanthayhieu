const { test } = require('node:test');
const assert = require('node:assert/strict');
const Exam = require('../src/models/Exam');
const Homework = require('../src/models/Homework');
const { createExamPrintLink, getPublicExamPrint } = require('../src/controllers/examController');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
}

test('a classless paper gets a stable share link without creating homework', async (t) => {
  const exam = { _id: 'paper', classSchedules: [] };
  t.mock.method(Exam, 'findById', () => ({
    then(resolve, reject) { return Promise.resolve({ ...exam }).then(resolve, reject); },
    select() { return Promise.resolve({ printShareToken: exam.printShareToken }); },
  }));
  const update = t.mock.method(Exam, 'updateOne', async (filter, update) => {
    exam.printShareToken ||= update.$set.printShareToken;
  });
  const homework = t.mock.method(Homework, 'create', () => { throw new Error('Must not create homework'); });
  const first = response();
  await createExamPrintLink({ params: { id: 'paper' } }, first);
  assert.equal(first.statusCode, 200);
  assert.match(first.data.parentPrintUrl, /^\/print\/exam\/[a-f0-9]{36}$/);
  const second = response();
  await createExamPrintLink({ params: { id: 'paper' } }, second);
  assert.deepEqual(second.data, first.data);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(homework.mock.callCount(), 0);
});

test('public paper includes questions and PDFs without exposing solutions or class data', async (t) => {
  const token = 'a'.repeat(36);
  t.mock.method(Exam, 'findOne', async () => ({
    title: 'Paper', content: '<p>Question</p>', solutionContent: 'PRIVATE', note: 'PRIVATE',
    classSchedules: [{ class: 'PRIVATE' }], pdfAttachments: [{ url: '/uploads/paper.pdf' }],
    examPackage: {
      answerKey: 'PRIVATE', meta: { grade: 6 },
      questions: {
        multipleChoice: [{ number: 1, question: '2+2?', options: { A: '4' }, answer: 'PRIVATE', explanation: 'PRIVATE' }],
        essay: [{ question: 'Solve', solution: 'PRIVATE' }],
      },
    },
  }));
  const res = response();
  await getPublicExamPrint({ params: { token } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.examPackage.questions.multipleChoice[0].question, '2+2?');
  assert.equal(res.data.pdfAttachments[0].url, '/uploads/paper.pdf');
  assert.equal(res.data.canViewAnswers, false);
  assert.equal(JSON.stringify(res.data).includes('PRIVATE'), false);
});

test('missing and malformed public links return 404', async (t) => {
  t.mock.method(Exam, 'findOne', async () => null);
  for (const token of ['bad-token', 'a'.repeat(36)]) {
    const res = response();
    await getPublicExamPrint({ params: { token } }, res);
    assert.equal(res.statusCode, 404);
  }
});

test('print links require admin access while viewing questions is public', async (t) => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const User = require('../src/models/User');
  const secret = 'exam-print-test-only';
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  t.after(() => { if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });
  t.mock.method(User, 'findById', async () => ({ _id: 'student', role: 'student' }));
  t.mock.method(Exam, 'findOne', async () => ({ title: 'Public paper', content: 'Question', pdfAttachments: [] }));
  const app = express();
  app.use('/api/exams', require('../src/routes/exams'));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/exams`;
  const token = 'b'.repeat(36);
  assert.equal((await fetch(`${base}/public-print/${token}`)).status, 200);
  assert.equal((await fetch(`${base}/public-print/${token}/answers`)).status, 401);
  assert.equal((await fetch(`${base}/paper/print-link`, { method: 'POST' })).status, 401);
  const headers = { Authorization: `Bearer ${jwt.sign({ id: 'student' }, secret)}` };
  assert.equal((await fetch(`${base}/public-print/${token}/answers`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/paper/print-link`, { method: 'POST', headers })).status, 403);
});
