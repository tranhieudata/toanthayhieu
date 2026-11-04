const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Lesson = require('../src/models/Lesson');
const Class = require('../src/models/Class');
const { generateParentSummary } = require('../src/controllers/teachingSessionController');
const { plainSummaryText, hasMathSyntax, plainTopic } = require('../src/services/teachingSummaryText');

test('plain summaries detect math syntax while preserving homework URLs', () => {
  for (const text of ['Vi-et: \\(x_1+x_2=-b/a\\)', '$a^2+b^2$', 'x + y = 2', '2 + 3', '√9', '\\frac{a}{b}']) assert(hasMathSyntax(text), text);
  assert(!hasMathSyntax('Ôn định lý Vi-et và luyện tập giải bài tập.'));
  const url = 'https://example.com/print/homework/token?class=6&value=$x';
  assert(!hasMathSyntax(`Bài tập: ${url}`));
  assert.equal(plainSummaryText(`**Ôn tập**\n[Bài tập](${url})`), `Ôn tập\nBài tập: ${url}`);
  assert.equal(plainTopic('Định lý Vi-et $x_1+x_2$'), 'Định lý Vi-et');
});

function query(value) { return { populate() { return this; }, select() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
async function generate(t, output) {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'summary-test-only';
  t.after(() => { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; });
  t.mock.method(Lesson, 'findById', () => query({ title: 'Định lý Vi-et', content: '<p>Công thức: \\(x_1+x_2=-b/a\\).</p>' }));
  t.mock.method(Class, 'findById', () => query({ name: 'K2015' }));
  let prompt;
  t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({ generateContent: async input => { prompt = input; return { response: { text: () => output } }; } }));
  const url = 'https://example.com/print/homework/token?class=6';
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await generateParentSummary({ body: { lessonId: 'lesson', classId: 'class', homeworkLinks: [{ title: 'Bài tập', url }] } }, res);
  assert.equal(res.code, 200);
  assert(prompt.includes('Không có công thức toán'));
  return { ...res.data, url };
}

test('Gemini lesson summary uses plain language without adding formatting', async t => {
  const result = await generate(t, '**Hôm nay lớp ôn định lý Vi-et và luyện tập vận dụng.**');
  assert.equal(result.source, 'gemini');
  assert.equal(result.summary, 'Hôm nay lớp ôn định lý Vi-et và luyện tập vận dụng.');
  assert(!hasMathSyntax(result.summary));
});

test('formulas in Gemini output or lesson content cannot leak into the fallback summary', async t => {
  const result = await generate(t, 'Hôm nay học Vi-et: \\(x_1+x_2=-b/a\\).');
  assert.equal(result.source, 'fallback');
  assert(!hasMathSyntax(result.summary));
  assert(result.summary.includes('Định lý Vi-et'));
  assert(result.summary.includes(result.url));
});
