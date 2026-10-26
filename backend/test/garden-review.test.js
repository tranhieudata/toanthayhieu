const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');

test('lesson review, scoring, watering and class leaderboard with isolated MongoDB', { timeout: 60000 }, async t => {
  process.env.JWT_SECRET = 'garden-review-test-only-secret';
  const database = `garden_review_test_${Date.now()}_${process.pid}`;
  let server;
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    const User = require('../src/models/User'), Class = require('../src/models/Class'), Course = require('../src/models/Course'), Lesson = require('../src/models/Lesson');
    const { Policy, Profile } = require('../src/models/Community');
    const { ReviewQuiz, ReviewAttempt } = require('../src/models/GardenReview');
    await Promise.all([User, Class, Course, Lesson, Policy, Profile, ReviewQuiz, ReviewAttempt].map(model => model.init()));
    const [a, b, outsider, admin] = await User.create([{ name: 'An', email: 'a@review.invalid' }, { name: 'Bình', email: 'b@review.invalid' }, { name: 'Ngoài lớp', email: 'outside@review.invalid' }, { name: 'Thầy', email: 'admin@review.invalid', role: 'admin' }]);
    await Policy.create({ curfewEnabled: false });
    const course = await Course.create({ title: 'Toán 9', description: 'Ôn tập Toán', instructor: admin._id, isPublished: true });
    const lesson = await Lesson.create({ title: 'Phương trình bậc hai', content: '<p>ax²+bx+c=0</p>', course: course._id, isPublished: true });
    const cls = await Class.create({ name: 'Lớp ôn tập', students: [a._id, b._id, admin._id], courses: [course._id] });
    const foreign = await Class.create({ name: 'Lớp khác', students: [outsider._id] });
    const app = express(); app.use(express.json());
    app.use('/api/community', require('../src/routes/community')); app.use('/api/lessons', require('../src/routes/lessons'));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(user, method, route, body) {
      const r = await fetch(base + route, { method, headers: { ...(user ? { Authorization: `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET)}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, data: await r.json() };
    }
    const questions = count => Array.from({ length: count }, (_, i) => ({ prompt: `Câu ${i + 1}: 2 + 2 = ?`, options: ['4', '3', '2', '1'], correctIndex: 0, explanation: '2 + 2 = 4' }));
    const management = `/lessons/${lesson._id}/review`;
    const config = { title: 'Ôn tập tưới cây', questions: questions(10), isPublished: true };
    let quiz, attemptA, attemptB;
    await t.test('admin creates one quiz per lesson; only 10–20 valid questions are accepted', async () => {
      assert.equal((await request(null, 'PUT', management, config)).status, 401);
      assert.equal((await request(a, 'PUT', management, config)).status, 403);
      assert.equal((await request(a, 'GET', management)).status, 403);
      for (const count of [0, 9, 21]) assert.equal((await request(admin, 'PUT', management, { ...config, questions: questions(count) })).status, 400);
      const invalid = questions(10); invalid[0].correctIndex = 4;
      assert.equal((await request(admin, 'PUT', management, { ...config, questions: invalid })).status, 400);
      invalid[0].correctIndex = 0; invalid[0].options[1] = '4';
      assert.equal((await request(admin, 'PUT', management, { ...config, questions: invalid })).status, 400);
      const r = await request(admin, 'PUT', management, { ...config, isPublished: false });
      assert.equal(r.status, 200); quiz = r.data;
      assert.equal((await request(a, 'GET', '/community/garden/quizzes')).data.length, 0);
      await request(admin, 'PUT', management, config);
      assert.equal(await ReviewQuiz.countDocuments({ lesson: lesson._id }), 1);
    });
    await t.test('Gemini produces editable drafts without saving or publishing; malformed output is rejected', async () => {
      const ai = require('../src/controllers/lessonController'), original = ai.generateWithGemini;
      try {
        ai.generateWithGemini = async prompt => { assert.ok(prompt.includes(lesson.title)); return '```json\n' + JSON.stringify({ questions: questions(20) }) + '\n```'; };
        assert.equal((await request(a, 'POST', management + '/generate', { count: 20 })).status, 403);
        assert.equal((await request(admin, 'POST', management + '/generate', { count: 9 })).status, 400);
        const result = await request(admin, 'POST', management + '/generate', { count: 20 });
        assert.equal(result.status, 200); assert.equal(result.data.questions.length, 20); assert.equal(result.data.isPublished, false);
        assert.equal((await ReviewQuiz.findById(quiz._id)).questions.length, 10);
        ai.generateWithGemini = async () => 'invalid JSON';
        assert.equal((await request(admin, 'POST', management + '/generate', { count: 10 })).status, 502);
        ai.generateWithGemini = async () => JSON.stringify({ questions: questions(9) });
        assert.equal((await request(admin, 'POST', management + '/generate', { count: 10 })).status, 400);
      } finally { ai.generateWithGemini = original; }
    });
    await t.test('published quizzes are class-scoped and answer keys stay private before submission', async () => {
      const list = (await request(a, 'GET', '/community/garden/quizzes')).data;
      assert.equal(list.length, 1); assert.equal(list[0].count, 10);
      assert.equal('questions' in list[0], false);
      assert.equal((await request(outsider, 'GET', '/community/garden/quizzes')).data.length, 0);
      assert.equal((await request(outsider, 'POST', '/community/garden/task', { quiz: quiz._id })).status, 403);
      const starts = await Promise.all([request(a, 'POST', '/community/garden/task', { quiz: quiz._id }), request(a, 'POST', '/community/garden/task', { quiz: quiz._id })]);
      assert.equal(starts[0].status, 200); assert.equal(starts[0].data.attemptId, starts[1].data.attemptId);
      attemptA = starts[0].data;
      assert.equal(attemptA.questions.length, 10); assert.equal('correctIndex' in attemptA.questions[0], false); assert.equal('explanation' in attemptA.questions[0], false);
      attemptB = (await request(b, 'POST', '/community/garden/task', { quiz: quiz._id })).data;
    });
    await t.test('membership and publication are checked again at submission time', async () => {
      await Class.updateOne({ _id: cls._id }, { $pull: { students: b._id } });
      assert.equal((await request(b, 'POST', '/community/garden/water', { attemptId: attemptB.attemptId, answers: Array(10).fill(0) })).status, 403);
      await Class.updateOne({ _id: cls._id }, { $addToSet: { students: b._id } });
      await ReviewQuiz.updateOne({ _id: quiz._id }, { isPublished: false });
      assert.equal((await request(b, 'POST', '/community/garden/water', { attemptId: attemptB.attemptId, answers: Array(10).fill(0) })).status, 403);
      await ReviewQuiz.updateOne({ _id: quiz._id }, { isPublished: true });
    });
    await t.test('server scores the original snapshot and concurrent submissions grant energy only once', async () => {
      assert.equal((await request(outsider, 'POST', '/community/garden/water', { attemptId: attemptA.attemptId, answers: Array(10).fill(0) })).status, 404);
      for (const answers of [[], Array(9).fill(0), Array(10).fill('0'), Array(10).fill(4)]) assert.equal((await request(a, 'POST', '/community/garden/water', { attemptId: attemptA.attemptId, answers })).status, 400);
      const edited = questions(10).map(q => ({ ...q, correctIndex: 1 }));
      await request(admin, 'PUT', management, { ...config, questions: edited });
      const payload = { attemptId: attemptA.attemptId, answers: [...Array(9).fill(0), 3], score: 999, energyPoints: 999 };
      const results = await Promise.all([request(a, 'POST', '/community/garden/water', payload), request(a, 'POST', '/community/garden/water', payload)]);
      for (const result of results) { assert.equal(result.status, 200); assert.equal(result.data.correctCount, 9); assert.equal(result.data.score, 9); assert.equal(result.data.energyPoints, 9); }
      const p = await Profile.findOne({ user: a._id });
      assert.equal(p.energy, 9); assert.equal(p.studyPoints, 9); assert.equal(p.growth, 1);
      assert.equal(p.grantKeys.filter(key => key.startsWith('garden-review:')).length, 1);
      assert.equal((await request(a, 'POST', '/community/garden/task', { quiz: quiz._id })).status, 409);
      assert.equal(await ReviewAttempt.countDocuments({ quiz: quiz._id, student: a._id }), 1);
      const replay = await request(a, 'POST', '/community/garden/water', { attemptId: attemptA.attemptId, answers: Array(10).fill(1) });
      assert.equal(replay.data.correctCount, 9);
      assert.deepEqual(replay.data.answers, payload.answers, 'submitted answers cannot be changed');
      assert.equal((await Profile.findOne({ user: a._id })).energy, 9);
    });
    await t.test('topic list places unfinished topics before completed ones with stable ordering', async () => {
      const additionalLessons = await Lesson.create(Array.from({ length: 7 }, (_, i) => ({ title: `Topic ${i}`, course: course._id, isPublished: true })));
      const added = await ReviewQuiz.create(additionalLessons.map((l, i) => ({ lesson: l._id, title: `Topic ${i}`, questions: questions(10), isPublished: true })));
      try {
        const first = (await request(a, 'GET', '/community/garden/quizzes')).data;
        const second = (await request(a, 'GET', '/community/garden/quizzes')).data;
        assert.equal(first.length, 8);
        assert.ok(first.slice(0, 7).every(q => !q.completed));
        assert.equal(first[7]._id, String(quiz._id));
        assert.equal(first[7].completed, true);
        assert.deepEqual(first.map(q => q._id), second.map(q => q._id));
      } finally {
        await ReviewQuiz.deleteMany({ _id: { $in: added.map(q => q._id) } });
        await Lesson.deleteMany({ _id: { $in: additionalLessons.map(l => l._id) } });
      }
    });
    await t.test('retry recovers a failed award after durable grading without duplicate points', async () => {
      const original = Profile.findOneAndUpdate;
      try {
        Profile.findOneAndUpdate = function(filter, ...args) {
          if (filter.grantKeys) { const error = new Error('Simulated award interruption'); error.status = 503; throw error; }
          return original.call(this, filter, ...args);
        };
        assert.equal((await request(b, 'POST', '/community/garden/water', { attemptId: attemptB.attemptId, answers: Array(10).fill(0) })).status, 503);
      } finally { Profile.findOneAndUpdate = original; }
      assert.ok((await ReviewAttempt.findById(attemptB.attemptId)).submittedAt);
      const retry = await request(b, 'POST', '/community/garden/water', { attemptId: attemptB.attemptId, answers: [] });
      assert.equal(retry.status, 200); assert.equal(retry.data.energyPoints, 10);
      await request(b, 'POST', '/community/garden/water', { attemptId: attemptB.attemptId });
      assert.equal((await Profile.findOne({ user: b._id })).energy, 10);
    });
    await t.test('reopening yesterday’s result cannot farm tree growth on a new day', async () => {
      const yesterday = new Date(Date.now() - 86400000);
      await ReviewAttempt.updateOne({ _id: attemptA.attemptId }, { submittedAt: yesterday });
      await Profile.updateOne({ user: a._id }, { lastWatered: yesterday });
      const before = await Profile.findOne({ user: a._id });
      await request(a, 'POST', '/community/garden/task', { quiz: quiz._id });
      const after = await Profile.findOne({ user: a._id });
      assert.equal(after.growth, before.growth); assert.equal(after.energy, before.energy); assert.equal(+after.lastWatered, +yesterday);
    });
    await t.test('top ten are active classmates ranked by lifetime points; spending energy cannot lower rank', async () => {
      const peers = await User.create(Array.from({ length: 13 }, (_, i) => ({ name: `Bạn ${i}`, email: `peer-${i}@review.invalid` })));
      await Class.updateOne({ _id: cls._id }, { $push: { students: { $each: peers.map(p => p._id) } } });
      await Profile.create(peers.map((p, i) => ({ user: p._id, studyPoints: 100 + i, communityPoints: 5, energy: 999 - i })));
      await Profile.create({ user: outsider._id, studyPoints: 99999 });
      await User.updateOne({ _id: peers[12]._id }, { isActive: false });
      const result = await request(a, 'GET', '/community/garden/leaderboard');
      assert.equal(result.status, 200); assert.equal(result.data.rows.length, 10); assert.equal(result.data.classes.length, 1);
      assert.equal(result.data.rows[0]._id, String(peers[11]._id)); assert.equal(result.data.rows[0].points, 116);
      assert.equal(result.data.rows.some(row => 'email' in row || row._id === String(outsider._id)), false);
      await Profile.updateOne({ user: peers[11]._id }, { energy: 0 });
      assert.equal((await request(a, 'GET', '/community/garden/leaderboard')).data.rows[0].points, 116);
      assert.equal((await request(a, 'GET', `/community/garden/leaderboard?class=${foreign._id}`)).status, 403);
      const second = await Class.create({ name: 'Lớp thứ hai', students: [a._id, outsider._id] });
      assert.equal((await request(a, 'GET', `/community/garden/leaderboard?class=${second._id}`)).data.rows[0]._id, String(outsider._id));
      const empty = await User.create({ name: 'Chưa có lớp', email: 'no-class@review.invalid' });
      assert.deepEqual((await request(empty, 'GET', '/community/garden/leaderboard')).data.rows, []);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && database.startsWith('garden_review_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
