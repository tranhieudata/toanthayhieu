const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const { validateQuestion, isCorrect } = require('../src/utils/mathArena');
const { currentYear, gradeFromBirthYear } = require('../src/utils/classGrade');

test('class grade follows the current Vietnam calendar year and matches the form preview', async () => {
  const preview = await import('../../frontend/src/utils/classGrade.js');
  const cases = [
    [2014, '2026-06-01T00:00:00Z', 7], [2014, '2027-06-01T00:00:00Z', 8],
    [2014, '2026-12-31T16:59:59Z', 7], [2014, '2026-12-31T17:00:00Z', 8],
    [2020, '2026-06-01T00:00:00Z', 1], [2009, '2026-06-01T00:00:00Z', 12],
    [null, '2026-06-01T00:00:00Z', null], [2027, '2026-06-01T00:00:00Z', null],
    [2014.5, '2026-06-01T00:00:00Z', null], [2000, '2026-06-01T00:00:00Z', null],
  ];
  for (const [birthYear, date, grade] of cases) {
    assert.equal(gradeFromBirthYear(birthYear, new Date(date)), grade);
    assert.equal(preview.gradeFromBirthYear(birthYear, new Date(date)), grade);
  }
});

test('short answers normalize decimal commas, fractions and signs without evaluating expressions', () => {
  const q = { kind: 'short', answer: '1/2' };
  for (const answer of ['0,5', '0.5', ' 1 / 2 ', '2/4', '０.５']) assert.equal(isCorrect(q, answer), true, answer);
  for (const answer of ['1/0', '0.5001', '1+1', '', 'Math.random()', null, 0]) assert.equal(isCorrect(q, answer), false, String(answer));
  assert.equal(isCorrect({ kind: 'short', answer: '-2' }, '−2'), true);
  assert.equal(isCorrect({ kind: 'short', answer: '9007199254740993' }, '9007199254740992'), false);
  assert.equal(isCorrect({ kind: 'short', answer: '0' }, '0.0000000001'), false);
  assert.equal(isCorrect({ kind: 'short', answer: '1/10000000000' }, '0.0000000001'), true);
  assert.throws(() => validateQuestion({ grade: 6, difficulty: 'easy', prompt: '1+1?', kind: 'choice', options: ['2','2','3','4'], correctIndex: 0, published: true }));
});

test('math arena integration: invitations, grade isolation, live scoring and durable rewards', { timeout: 60000 }, async t => {
  process.env.JWT_SECRET = 'arena-integration-test-only';
  const database = `math_arena_test_${Date.now()}_${process.pid}`;
  let server, originalGemini;
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    const User = require('../src/models/User'), Class = require('../src/models/Class');
    const { Policy, Profile } = require('../src/models/Community');
    const { ArenaQuestion, ArenaMatch, ArenaSeat } = require('../src/models/MathArena');
    const Level = require('../src/models/Level');
    await Promise.all([User, Class, Policy, Profile, ArenaQuestion, ArenaMatch, ArenaSeat, Level].map(m => m.init()));
    await Level.create([{ name: 'Lớp 6', order: 0 }, ...[7, 8, 9].map(grade => ({ name: `Khối ${grade}`, grade, order: grade }))]);
    await Policy.create({ curfewEnabled: false, homeworkAccessMode: 'none' });
    const admin = await User.create({ name: 'Thầy', email: 'admin@arena.invalid', role: 'admin' });
    const app = express(); app.use(express.json()); app.use('/api/community', require('../src/routes/community')); app.use('/api/classes', require('../src/routes/classes')); app.use('/api/levels', require('../src/routes/levels'));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/community/arena`;
    const request = async (user, method, path, body) => {
      const response = await fetch(path.startsWith('/api/') ? new URL(base).origin + path : base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET)}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, data: await response.json() };
    };
    const question = (grade = 6, difficulty = 'easy', i = 0) => ({ grade, difficulty, prompt: `${i + 1} + 1 = ?`, kind: 'choice', options: [String(i + 2), '100', '200', '300'], correctIndex: 0, published: true, explanation: 'Cộng một đơn vị' });
    await ArenaQuestion.insertMany(Array.from({ length: 15 }, (_, i) => question(6, 'easy', i)));
    await ArenaQuestion.insertMany(Array.from({ length: 10 }, (_, i) => ({ ...question(7, 'hard', i), correctIndex: 1 })));
    let fixtureIndex = 0;
    async function fixture(size = 2, grade = 6) {
      const n = ++fixtureIndex;
      const users = await User.create(Array.from({ length: size }, (_, i) => ({ name: `Bạn ${n}-${i}`, email: `u${n}-${i}@arena.invalid` })));
      const cls = await Class.create({ name: `Lớp ${n}`, students: users.map(u => u._id), birthYear: grade === null ? null : currentYear() - grade - 5 });
      return { users, cls };
    }
    async function create(f, format = '1v1', mode = 'race', overrides = {}) {
      const [host, partner, a, b] = f.users;
      return request(host, 'POST', '/matches', { classId: String(f.cls._id), format, mode, difficulty: 'easy', opponents: format === '1v1' ? [String(partner._id)] : [String(a._id), String(b._id)], ...(format === '2v2' ? { teammate: String(partner._id) } : {}), ...overrides });
    }
    async function start(f, format = '1v1', mode = 'race') {
      const created = await create(f, format, mode); assert.equal(created.status, 201, JSON.stringify(created.data));
      for (const user of f.users.slice(1)) assert.equal((await request(user, 'POST', `/matches/${created.data._id}/accept`, {})).status, 200);
      const started = await request(f.users[0], 'POST', `/matches/${created.data._id}/start`, {}); assert.equal(started.status, 200, JSON.stringify(started.data));
      return started.data;
    }
    async function running(match) { await ArenaMatch.updateOne({ _id: match._id }, { $set: { startsAt: new Date(Date.now() - 2000), deadline: new Date(Date.now() + 58000) } }); }

    await t.test('shared grade catalog preserves legacy IDs and controls arena question eligibility', async () => {
      const f = await fixture();
      const legacy = await Level.findOne({ name: 'Lớp 6' });
      const response = await request(admin, 'GET', '/api/levels');
      const grade6 = response.data.find(level => level.grade === 6);
      assert.equal(grade6._id, String(legacy._id)); assert.equal(grade6.name, 'Khối 6');
      assert.equal((await request(f.users[0], 'POST', '/api/levels', { name: 'Khối 5', grade: 5 })).status, 403);
      assert.equal((await request(admin, 'POST', '/api/levels', { name: 'Khối 13', grade: 13 })).status, 400);
      const created = await request(admin, 'POST', '/api/levels', { name: 'Khối 5', grade: 5 });
      assert.equal(created.status, 201);
      assert.equal((await request(admin, 'POST', '/api/levels', { name: 'Toán tiểu học', grade: 5 })).status, 400);
      assert.equal((await request(admin, 'POST', '/questions', { grade: 4, difficulty: 'easy', kind: 'short', prompt: '1+1?', answer: '2', published: false })).status, 400);
      const q = await request(admin, 'POST', '/questions', { grade: 5, difficulty: 'easy', kind: 'short', prompt: '1+1?', answer: '2', published: false });
      assert.equal(q.status, 201);
      assert.equal((await request(admin, 'DELETE', `/api/levels/${created.data._id}`)).status, 400);
      assert.equal((await request(admin, 'PUT', `/api/levels/${created.data._id}`, { name: 'Khối 4', grade: 4 })).status, 400);
      const renamed = await request(admin, 'PUT', `/api/levels/${created.data._id}`, { name: 'Toán nền tảng', bgColor: 'bg-green-100' });
      assert.equal(renamed.data.grade, 5);
      assert.equal((await request(f.users[0], 'GET', '/lobby')).data.grades.find(level => level.grade === 5).name, 'Toán nền tảng');
      await request(admin, 'DELETE', `/questions/${q.data._id}`);
      assert.equal((await request(admin, 'DELETE', `/api/levels/${created.data._id}`)).status, 200);
      assert.equal((await request(admin, 'GET', '/questions?grade=5&difficulty=easy')).status, 400);
    });
    await t.test('class birth years are admin-only and automatically determine question grade', async () => {
      const f = await fixture();
      assert.equal((await request(null, 'GET', '/lobby')).status, 401);
      assert.equal((await request(f.users[0], 'GET', '/questions')).status, 403);
      assert.equal((await request(f.users[0], 'PUT', `/api/classes/${f.cls._id}`, { birthYear: currentYear() - 13 })).status, 403);
      for (const birthYear of [1899, currentYear() + 1, 2014.5]) assert.equal((await request(admin, 'PUT', `/api/classes/${f.cls._id}`, { birthYear })).status, 400);
      const updated = await request(admin, 'PUT', `/api/classes/${f.cls._id}`, { birthYear: currentYear() - 11 });
      assert.equal(updated.status, 200); assert.equal(updated.data.currentGrade, 6);
      const listed = await request(admin, 'GET', '/api/classes');
      assert.equal(listed.data.find(c => c._id === String(f.cls._id)).currentGrade, 6);
      const createdClass = await request(admin, 'POST', '/api/classes', { name: 'Lớp theo năm sinh', birthYear: currentYear() - 12 });
      assert.equal(createdClass.status, 201); assert.equal(createdClass.data.currentGrade, 7);
      assert.equal((await request(admin, 'POST', '/api/classes', { name: 'Năm sinh sai', birthYear: currentYear() + 1 })).status, 400);
      const lobby = await request(f.users[0], 'GET', '/lobby');
      assert.equal(lobby.data.classes[0].grade, 6);
      const created = await request(admin, 'POST', '/questions', { ...question(), kind: 'short', answer: '1/2', published: false });
      assert.equal(created.status, 201);
      assert.equal((await request(admin, 'PUT', `/questions/${created.data._id}`, { ...created.data, published: true })).status, 200);
      assert.equal((await request(admin, 'DELETE', `/questions/${created.data._id}`)).status, 200);
      const room = await create(f, '1v1', 'race', { grade: 7 });
      assert.equal(room.status, 201); assert.equal(room.data.grade, 6);
    });
    await t.test('birth year selects the matching bank and pending rooms recheck a changed cohort', async () => {
      const f = await fixture(2, 7);
      const room = await create(f, '1v1', 'race', { grade: 6, difficulty: 'hard' });
      assert.equal(room.status, 201); assert.equal(room.data.grade, 7);
      await request(f.users[1], 'POST', `/matches/${room.data._id}/accept`, {});
      await request(admin, 'PUT', `/api/classes/${f.cls._id}`, { birthYear: currentYear() - 11 });
      assert.equal((await request(f.users[0], 'POST', `/matches/${room.data._id}/start`, {})).status, 403);
      await request(f.users[0], 'POST', `/matches/${room.data._id}/cancel`, {});
      await request(admin, 'PUT', `/api/classes/${f.cls._id}`, { birthYear: currentYear() - 12 });
      const next = await create(f, '1v1', 'archery', { difficulty: 'hard' });
      await request(f.users[1], 'POST', `/matches/${next.data._id}/accept`, {});
      assert.equal((await request(f.users[0], 'POST', `/matches/${next.data._id}/start`, {})).status, 200);
      const stored = await ArenaMatch.findById(next.data._id);
      assert.equal(stored.grade, 7); assert.ok(stored.questions.every(q => q.correctIndex === 1));
    });
    await t.test('admin publishes every draft across pages in the selected grade and difficulty only', async () => {
      const f = await fixture();
      const drafts = await ArenaQuestion.insertMany(Array.from({ length: 25 }, (_, i) => ({ ...question(8, 'medium', i), published: false })));
      const other = await ArenaQuestion.insertMany([{ ...question(8, 'hard'), published: false }, { ...question(9, 'medium'), published: false }]);
      const list = await request(admin, 'GET', '/questions?grade=8&difficulty=medium');
      assert.equal(list.data.questions.length, 20); assert.equal(list.data.draftCount, 25);
      assert.equal((await request(f.users[0], 'POST', '/questions/publish', { grade: 8, difficulty: 'medium' })).status, 403);
      assert.equal((await request(admin, 'POST', '/questions/publish', {})).status, 400);
      assert.equal((await request(admin, 'POST', '/questions/publish', { grade: 8, difficulty: 'medium' })).status, 400);
      assert.equal((await request(admin, 'POST', '/questions/publish', { grade: 8, difficulty: 'medium', questionIds: [] })).status, 400);
      assert.equal((await request(admin, 'POST', '/questions/publish', { grade: 8, difficulty: 'medium', questionIds: ['invalid'] })).status, 400);
      const chosen = await request(admin, 'POST', '/questions/publish', { grade: 8, difficulty: 'medium', questionIds: [String(drafts[0]._id), String(drafts[1]._id), String(other[0]._id)] });
      assert.equal(chosen.data.publishedCount, 2);
      assert.equal(await ArenaQuestion.countDocuments({ grade: 8, difficulty: 'medium', published: false }), 23);
      const result = await request(admin, 'POST', '/questions/publish', { grade: 8, difficulty: 'medium', all: true, excludedIds: [String(drafts[24]._id)] });
      assert.equal(result.status, 200); assert.equal(result.data.publishedCount, 22);
      assert.equal((await ArenaQuestion.findById(drafts[24]._id)).published, false);
      assert.equal((await request(admin, 'POST', '/questions/publish', { grade: 8, difficulty: 'medium', questionIds: [String(drafts[24]._id)] })).data.publishedCount, 1);
      assert.equal(await ArenaQuestion.countDocuments({ _id: { $in: drafts.map(q => q._id) }, published: true }), 25);
      assert.equal(await ArenaQuestion.countDocuments({ _id: { $in: other.map(q => q._id) }, published: false }), 2);
      assert.equal((await request(admin, 'GET', '/questions?grade=8&difficulty=medium&page=2')).data.draftCount, 0);
      assert.equal((await request(admin, 'POST', '/questions/publish', { grade: 8, difficulty: 'medium', all: true })).data.publishedCount, 0);
    });
    await t.test('unconfigured classes, other classes, duplicate players and insufficient banks are rejected', async () => {
      const f = await fixture(4), outside = await fixture();
      assert.equal((await create(f, '1v1', 'race', { opponents: [String(outside.users[0]._id)] })).status, 400);
      assert.equal((await create(f, '1v1', 'race', { opponents: [String(f.users[0]._id)] })).status, 400);
      assert.equal((await create(f, '2v2', 'race', { teammate: String(f.users[2]._id) })).status, 400);
      assert.equal((await create(f, '1v1', 'race', { difficulty: 'hard' })).status, 400);
      await Class.updateOne({ _id: f.cls._id }, { $set: { birthYear: null } });
      assert.equal((await create(f)).status, 403);
    });
    await t.test('concurrent room creation reserves each player only once; decline frees all seats', async () => {
      const f = await fixture();
      const results = await Promise.all([create(f), create(f)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      const room = results.find(r => r.status === 201).data;
      assert.equal(await ArenaSeat.countDocuments({ match: room._id }), 2);
      assert.equal((await request(f.users[1], 'POST', `/matches/${room._id}/cancel`, {})).data.status, 'cancelled');
      assert.equal(await ArenaSeat.countDocuments({ match: room._id }), 0);
      assert.equal((await create(f)).status, 201);
    });
    await t.test('consent, host permissions and countdown are enforced and answers remain private', async () => {
      const f = await fixture(), outside = await fixture();
      const room = (await create(f)).data;
      assert.equal((await request(f.users[0], 'POST', `/matches/${room._id}/start`, {})).status, 409);
      assert.equal((await request(outside.users[0], 'GET', `/matches/${room._id}`)).status, 404);
      assert.equal((await request(f.users[1], 'POST', `/matches/${room._id}/accept`, {})).status, 200);
      assert.equal((await request(f.users[1], 'POST', `/matches/${room._id}/start`, {})).status, 403);
      const begun = await request(f.users[0], 'POST', `/matches/${room._id}/start`, {});
      assert.equal(begun.status, 200);
      assert.equal(new Date(begun.data.deadline) - new Date(begun.data.startsAt), 60000);
      assert.equal(begun.data.question, null, 'countdown does not reveal questions early');
      assert.equal(begun.data.questions, undefined);
      assert.equal((await request(f.users[0], 'POST', `/matches/${room._id}/answer`, { index: 0, answer: 0 })).status, 409);
      const snapshot = await ArenaMatch.findById(room._id);
      assert.ok(snapshot.questions.every(q => q.correctIndex === 0));
      await running(room);
      const live = await request(f.users[0], 'GET', `/matches/${room._id}`);
      assert.deepEqual(Object.keys(live.data.question).sort(), ['index', 'kind', 'options', 'prompt']);
      const answers = await Promise.all([0, 1].map(() => request(f.users[0], 'POST', `/matches/${room._id}/answer`, { index: 0, answer: 0 })));
      assert.ok(answers.every(r => r.status === 200));
      const stored = await ArenaMatch.findById(room._id);
      assert.equal(stored.participants[0].score, 1); assert.equal(stored.participants[0].index, 1);
      assert.equal((await request(f.users[0], 'POST', `/matches/${room._id}/answer`, { index: 2, answer: 0 })).status, 409);
      assert.equal((await request(f.users[0], 'POST', `/matches/${room._id}/cancel`, {})).status, 409);
    });
    await t.test('simultaneous finish-line answers select one winner and grant energy once across replays', async () => {
      const f = await fixture(); const room = await start(f); await running(room);
      await ArenaMatch.updateOne({ _id: room._id }, { $set: { 'participants.0.score': 9, 'participants.0.index': 9, 'participants.1.score': 9, 'participants.1.index': 9 } });
      await Promise.all(f.users.map(user => request(user, 'POST', `/matches/${room._id}/answer`, { index: 9, answer: 0 })));
      const finished = await ArenaMatch.findById(room._id);
      assert.equal(finished.status, 'finished'); assert.ok([0, 1].includes(finished.winner));
      assert.deepEqual(finished.participants.map(p => p.score).sort((a, b) => a - b), [9, 10]);
      await Promise.all(Array.from({ length: 4 }, () => request(f.users[0], 'GET', `/matches/${room._id}`)));
      const profiles = await Profile.find({ user: { $in: f.users.map(u => u._id) } });
      assert.equal(profiles.reduce((sum, p) => sum + p.energy, 0), 10);
      assert.equal(profiles.reduce((sum, p) => sum + p.studyPoints, 0), 10);
      assert.equal(await ArenaSeat.countDocuments({ match: room._id }), 0);
    });
    await t.test('2v2 archery combines teammate scores and rewards both winners', async () => {
      const f = await fixture(4); const room = await start(f, '2v2', 'archery'); await running(room);
      await ArenaMatch.updateOne({ _id: room._id }, { $set: { 'participants.0.score': 5, 'participants.1.score': 4 } });
      const result = await request(f.users[1], 'POST', `/matches/${room._id}/answer`, { index: 0, answer: 0 });
      assert.equal(result.data.status, 'finished'); assert.equal(result.data.winner, 0);
      for (const user of f.users.slice(0, 2)) assert.equal((await Profile.findOne({ user: user._id })).energy, 10);
      assert.equal(await Profile.countDocuments({ user: { $in: f.users.slice(2).map(u => u._id) } }), 0);
    });
    await t.test('server deadline rejects late scores, settles ties and recovers interrupted rewards', async () => {
      const f = await fixture(); const room = await start(f);
      await ArenaMatch.updateOne({ _id: room._id }, { $set: { startsAt: new Date(Date.now() - 61000), deadline: new Date(Date.now() - 1000) } });
      const result = await request(f.users[0], 'POST', `/matches/${room._id}/answer`, { index: 0, answer: 0 });
      assert.equal(result.data.status, 'finished'); assert.equal(result.data.winner, null); assert.equal(result.data.participants[0].score, 0);
      assert.equal(await Profile.countDocuments({ user: { $in: f.users.map(u => u._id) } }), 0);
      // Simulate a process stopping after persisting the result, before reward delivery.
      await ArenaMatch.updateOne({ _id: room._id }, { $set: { winner: 1, rewardsGranted: false } });
      await request(f.users[1], 'GET', `/matches/${room._id}`);
      assert.equal((await Profile.findOne({ user: f.users[1]._id })).energy, 10);
      await request(f.users[1], 'GET', '/lobby');
      assert.equal((await Profile.findOne({ user: f.users[1]._id })).energy, 10);
    });
    await t.test('expired invitations free seats; class membership is checked again at match start', async () => {
      const f = await fixture(); const room = (await create(f)).data;
      await ArenaMatch.updateOne({ _id: room._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      assert.equal((await request(f.users[1], 'POST', `/matches/${room._id}/accept`, {})).status, 409);
      assert.equal(await ArenaSeat.countDocuments({ match: room._id }), 0);
      const next = (await create(f)).data;
      await request(f.users[1], 'POST', `/matches/${next._id}/accept`, {});
      await Class.updateOne({ _id: f.cls._id }, { $pull: { students: f.users[1]._id } });
      assert.equal((await request(f.users[0], 'POST', `/matches/${next._id}/start`, {})).status, 403);
      assert.equal((await request(f.users[1], 'GET', `/matches/${next._id}`)).status, 403);
    });
    await t.test('Gemini output is validated and remains unsaved until admin review', async () => {
      const ai = require('../src/controllers/lessonController'); originalGemini = ai.generateWithGemini;
      const SiteSettings = require('../src/models/SiteSettings');
      const f = await fixture();
      assert.equal((await request(f.users[0], 'GET', '/chapters?grade=6')).status, 403);
      const initialChapters = await request(admin, 'GET', '/chapters?grade=6');
      assert.equal(initialChapters.status, 200); assert.ok(initialChapters.data.chapters.some(chapter => chapter.name === 'Chương 1. Số tự nhiên'));
      const chapterName = 'Chương 6. Phân số';
      await SiteSettings.findOneAndUpdate({ key: 'default' }, { $set: { curriculum: { 6: { [chapterName]: ['Quy đồng', 'Cộng phân số'] }, 7: { 'Chương 1. Số hữu tỉ': ['Số hữu tỉ'] }, 8: {} } } }, { upsert: true });
      const chapters = await request(admin, 'GET', '/chapters?grade=6');
      assert.deepEqual(chapters.data.chapters, [{ name: chapterName, topics: ['Quy đồng', 'Cộng phân số'] }]);
      assert.deepEqual((await request(admin, 'GET', '/chapters?grade=8')).data.chapters, []);
      const before = await ArenaQuestion.countDocuments();
      let generatedPrompt = '';
      ai.generateWithGemini = async prompt => { generatedPrompt = prompt; return JSON.stringify({ questions: Array.from({ length: 10 }, (_, i) => question(6, 'easy', i)) }); };
      assert.equal((await request(admin, 'POST', '/generate', { grade: 6, difficulty: 'easy', count: 10, topic: 'Chương 1. Số hữu tỉ' })).status, 400);
      assert.equal(generatedPrompt, '');
      const result = await request(admin, 'POST', '/generate', { grade: 6, difficulty: 'easy', count: 10, topic: chapterName });
      assert.equal(result.status, 200); assert.equal(result.data.questions.length, 10); assert.ok(result.data.questions.every(q => !q.published));
      assert.ok(generatedPrompt.includes(chapterName)); assert.ok(generatedPrompt.includes('Quy đồng; Cộng phân số'));
      assert.equal(await ArenaQuestion.countDocuments(), before);
      ai.generateWithGemini = async () => 'not json';
      assert.equal((await request(admin, 'POST', '/generate', { grade: 6, difficulty: 'easy', count: 10, topic: chapterName })).status, 502);
      await SiteSettings.updateOne({ key: 'default' }, { $set: { 'curriculum.6': { 'Chương mới': [] } } });
      assert.deepEqual((await request(admin, 'GET', '/chapters?grade=6')).data.chapters.map(chapter => chapter.name), ['Chương mới']);
      assert.equal((await request(admin, 'POST', '/generate', { grade: 6, difficulty: 'easy', count: 10, topic: chapterName })).status, 400);
      ai.generateWithGemini = originalGemini; originalGemini = null;
    });
    await t.test('curfew blocks new challenges', async () => {
      await Policy.updateOne({}, { $set: { curfewEnabled: true, curfewStart: '00:00', curfewEnd: '23:59' } });
      const f = await fixture(); assert.equal((await create(f)).status, 403);
    });
  } finally {
    if (originalGemini) require('../src/controllers/lessonController').generateWithGemini = originalGemini;
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
