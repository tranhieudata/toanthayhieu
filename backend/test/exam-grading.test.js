const { test } = require('node:test');
const assert = require('node:assert/strict');
const { teacherAnswerText, normalizeGradingReport, gradingPrompt } = require('../src/services/examGrading');
const Exam = require('../src/models/Exam');
const ExamResult = require('../src/models/ExamResult');
const User = require('../src/models/User');
const fs = require('fs/promises');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { saveExamResult, aiGradeExamResult } = require('../src/controllers/examController');

const report = () => ({
  objective: [{ label: '7a', studentAnswer: 'Đúng', expectedAnswer: 'Đúng', correct: true, score: 3, maxScore: 3 }],
  essay: [{ label: '1b', score: 5, maxScore: 7, note: 'Thiếu kết luận' }],
  feedback: 'Cần bổ sung kết luận.', levels: [],
});
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } });
function query(value) { return { populate() { return this; }, select() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
function mockGrading(t, exam, outputs) {
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only';
  t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original; });
  t.mock.method(Exam, 'findById', () => query(exam));
  t.mock.method(User, 'findById', () => query({ name: 'Student' }));
  t.mock.method(ExamResult, 'findOne', async () => ({ submissionImages: [{ url: '/uploads/student.jpg' }] }));
  t.mock.method(fs, 'readFile', async () => Buffer.from('image-test'));
  const prompts = [];
  t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({ generateContent: async (input) => {
    prompts.push(input);
    const next = outputs.shift();
    if (!next) throw new Error('Unexpected AI call');
    return { response: { text: () => JSON.stringify(next) } };
  } }));
  const save = t.mock.method(ExamResult, 'findOneAndUpdate', (_, update) => query(update.$set));
  return { prompts, save };
}
const request = { params: { id: 'exam', studentId: 'student' }, user: { _id: 'admin' } };

test('teacher rubric takes priority, image-only rubric suppresses package answers', () => {
  const exam = { solutionContent: 'My rubric', examPackage: { questions: { essay: [{ number: 1, solution: 'Package answer' }] } } };
  assert.equal(teacherAnswerText(exam), 'My rubric');
  assert.equal(teacherAnswerText({ ...exam, solutionContent: '<p><br></p>', solutionImages: [{ url: '/uploads/key.jpg' }] }), '');
  assert.match(teacherAnswerText({ ...exam, solutionContent: '' }), /Package answer/);
  assert.equal(teacherAnswerText({ examPackage: { questions: { essay: [{ question: 'No answer' }] } } }), '');
});

test('report preserves subquestion labels and derives total; rejects invalid rubrics', () => {
  const normalized = normalizeGradingReport(report(), 10);
  assert.equal(normalized.totalScore, 8);
  assert.equal(normalized.objective[0].label, '7a');
  assert.equal(normalized.essay[0].label, '1b');
  assert.throws(() => normalizeGradingReport(report(), 20));
  assert.throws(() => normalizeGradingReport({ objective: [], essay: [] }, 10));
  assert.throws(() => normalizeGradingReport({ ...report(), essay: [{ label: '1b', score: 8, maxScore: 7 }] }, 10));
  assert.throws(() => normalizeGradingReport({ ...report(), essay: [report().essay[0], report().essay[0]] }, 10));
});

test('manual grading saves total and comment without invoking AI', async (t) => {
  const { prompts } = mockGrading(t, { levels: [], classSchedules: [] }, []);
  const res = response();
  await saveExamResult({ ...request, body: { studentId: 'student', totalScore: 8.75, teacherNote: 'Good work' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.totalScore, 8.75);
  assert.equal(res.data.gradingMethod, 'manual');
  assert.equal(res.data.gradingReport, null);
  assert.equal(res.data.teacherNote, 'Good work');
  assert.equal(prompts.length, 0);
});

test('manual grading rejects out-of-range scores without saving', async (t) => {
  const { save } = mockGrading(t, { levels: [], classSchedules: [] }, []);
  for (const totalScore of ['', -1, 11, 'invalid']) {
    const res = response();
    await saveExamResult({ ...request, body: { studentId: 'student', totalScore } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(save.mock.callCount(), 0);
});

test('AI uses teacher answer images with one grading call and saves the report', async (t) => {
  const exam = { title: 'Exam', solutionImages: [{ url: '/uploads/key.jpg' }], levels: [], classSchedules: [] };
  const { prompts } = mockGrading(t, exam, [report()]);
  const res = response();
  await aiGradeExamResult(request, res);
  assert.equal(res.statusCode, 200);
  assert.equal(prompts.length, 1);
  assert.equal(res.data.totalScore, 8);
  assert.equal(res.data.gradingReport.answerSource, 'teacher');
  assert.equal(res.data.gradingReport.generatedAnswerKey, '');
  assert.equal(res.data.gradingReport.essay[0].note, 'Thiếu kết luận');
});

test('without a rubric AI solves the exam before receiving student images', async (t) => {
  const exam = { title: 'Exam', content: 'Questions', levels: [], classSchedules: [] };
  const { prompts } = mockGrading(t, exam, [{ answerKey: 'Generated rubric' }, report()]);
  const res = response();
  await aiGradeExamResult(request, res);
  assert.equal(res.statusCode, 200);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].some(part => part.inlineData), false);
  assert.match(prompts[1][0], /Generated rubric/);
  assert.equal(res.data.gradingReport.answerSource, 'generated');
  assert.equal(res.data.gradingReport.generatedAnswerKey, 'Generated rubric');
});

test('unreadable images do not overwrite an existing result', async (t) => {
  const { save } = mockGrading(t, { title: 'Exam', solutionContent: 'Teacher rubric' }, [{ error: 'Ảnh bị mờ' }]);
  const res = response();
  await aiGradeExamResult(request, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.message, 'Ảnh bị mờ');
  assert.equal(save.mock.callCount(), 0);
});
