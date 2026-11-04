const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs/promises');
const path = require('path');

test('Telegram integration: private pairing, reminders, callbacks, uploads and AI confirmation', { timeout: 60000 }, async t => {
  const database = `telegram_test_${Date.now()}_${process.pid}`;
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'telegram-integration-test-secret';
  let server;
  const uploadFiles = [];
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    const User = require('../src/models/User');
    const Class = require('../src/models/Class');
    const Course = require('../src/models/Course');
    const Lesson = require('../src/models/Lesson');
    const Session = require('../src/models/TeachingSession');
    const Plan = require('../src/models/WeeklyTeachingPlan');
    const Exam = require('../src/models/Exam');
    const Result = require('../src/models/ExamResult');
    const { TelegramConfig, TelegramAction, TelegramDelivery, TelegramTask, TelegramConversation } = require('../src/models/Telegram');
    const { processUpdate } = require('../src/services/telegramInteractions');
    const { eventsForDate, pendingSubmissions } = require('../src/services/telegramData');
    const { scheduleNotifications } = require('../src/services/telegramScheduler');
    const { deliveryContent, drainDeliveries } = require('../src/services/telegramWorker');
    const { enqueue } = require('../src/services/telegramMessages');
    const { decryptToken } = require('../src/services/telegramApi');
    await Promise.all([TelegramConfig.init(), TelegramAction.init(), TelegramDelivery.init(), TelegramTask.init(), TelegramConversation.init(), Result.init()]);
    const [admin, student, outsider] = await User.create([
      { name: 'Teacher', email: 'teacher@telegram.invalid', role: 'admin' },
      { name: 'Student', email: 'student@telegram.invalid' },
      { name: 'Outside', email: 'outside@telegram.invalid' },
    ]);
    const course = await Course.create({ title: 'Math', description: 'Test', instructor: admin._id });
    const lesson = await Lesson.create({ title: 'Viet lesson', course: course._id });
    const classroom = await Class.create({ name: 'Test class', courses: [course._id], students: [student._id], schedules: [{ dayOfWeek: 3, startTime: '19:00', endTime: '21:00' }] });
    const otherClass = await Class.create({ name: 'Other class', students: [outsider._id] });
    const planEntry = { class: classroom._id, date: '2026-11-04', startTime: '19:00', endTime: '21:00', lesson: lesson._id, topic: lesson.title, note: '- Prepare exam\n- Print papers' };
    await Plan.create({ weekStart: '2026-11-02', entries: [planEntry] });
    const session = await Session.create({ class: classroom._id, date: new Date('2026-11-04'), startTime: '19:00', endTime: '21:00', plannedLesson: lesson._id, weeklyPlanKey: `2026-11-02:${classroom._id}:2026-11-04:19:00` });
    const exam = await Exam.create({ title: 'Exam', classSchedules: [{ class: classroom._id }] });
    const otherExam = await Exam.create({ title: 'Other exam', classSchedules: [{ class: otherClass._id }] });
    const nativeFetch = global.fetch;
    const sent = [];
    let messageId = 0;
    let pollActive = 0, maxPollActive = 0, pollCount = 0;
    t.mock.method(global, 'fetch', async (url, options) => {
      if (!String(url).startsWith('https://api.telegram.org/')) return nativeFetch(url, options);
      if (String(url).includes('/file/bot')) return new Response(Buffer.from([255, 216, 255, 0, 1]));
      const method = String(url).split('/').at(-1), body = JSON.parse(options.body);
      let result = true;
      if (method === 'getMe') result = { id: 9001, is_bot: true, username: 'test_teacher_bot' };
      if (method === 'getWebhookInfo') result = { url: '' };
      if (method === 'sendMessage') { sent.push(body); result = { message_id: ++messageId }; }
      if (method === 'getFile') result = { file_size: 5, file_path: 'photos/test.jpg' };
      if (method === 'getUpdates') {
        pollActive += 1; pollCount += 1; maxPollActive = Math.max(maxPollActive, pollActive);
        await new Promise(resolve => setTimeout(resolve, 40));
        pollActive -= 1; result = [];
      }
      return { ok: true, json: async () => ({ ok: true, result }) };
    });
    const app = express(); app.use(express.json()); app.use('/api/telegram', require('../src/routes/telegram'));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}/api/telegram`;
    async function request(method, endpoint, body, user = admin) {
      const response = await nativeFetch(`${base}${endpoint}`, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    }
    const cfg = () => TelegramConfig.findOne({ key: 'default' }).select('+encryptedToken +pairingHash');
    const message = text => ({ message: { message_id: ++messageId, from: { id: 777 }, chat: { id: 777, type: 'private' }, text } });
    const click = async action => processUpdate(await cfg(), { callback_query: { id: `cb-${messageId++}`, data: `a:${action._id}`, from: { id: 777 }, message: { message_id: messageId, chat: { id: 777, type: 'private' } } } });

    await t.test('admin API is protected and never returns the bot token', async () => {
      assert.equal((await request('GET', '/settings', null, null)).status, 401);
      assert.equal((await request('GET', '/settings', null, student)).status, 403);
      const token = '123456:abcdefghijklmnopqrstuvwxyz123456';
      const saved = await request('PUT', '/settings', { token, websiteUrl: 'https://example.com' });
      assert.equal(saved.status, 200);
      assert(!JSON.stringify(saved.data).includes(token));
      assert.equal(decryptToken((await cfg()).encryptedToken), token);
    });

    await t.test('pairing link is one-use and unrelated users cannot bind or send commands', async () => {
      const paired = await request('POST', '/pair');
      assert.equal(paired.status, 200);
      const code = new URL(paired.data.url).searchParams.get('start');
      await processUpdate(await cfg(), message(`/start ${'a'.repeat(36)}`));
      assert(!(await cfg()).chatId);
      await processUpdate(await cfg(), message(`/start ${code}`));
      assert.equal((await cfg()).chatId, '777');
      await processUpdate(await cfg(), { message: { from: { id: 888 }, chat: { id: 888, type: 'private' }, text: `/start ${code}` } });
      assert.equal((await cfg()).chatId, '777');
      const before = sent.length;
      await processUpdate(await cfg(), { message: { from: { id: 888 }, chat: { id: 888, type: 'private' }, text: '/homnay' } });
      assert.equal(sent.length, before);
      assert.equal((await request('PUT', '/settings', { enabled: true, quietStart: '00:00', quietEnd: '00:00', notifications: { morning: false, evening: false, weekly: false, grading: false, tuition: false } })).status, 200);
    });

    await t.test('reminders deduplicate and exact lesson/date/class are preserved', async () => {
      const events = await eventsForDate('2026-11-04');
      assert.equal(events[0].className, classroom.name);
      assert.equal(events[0].topic, lesson.title);
      assert.equal(String(events[0].sessionId), String(session._id));
      const now = new Date('2026-11-04T11:30:00Z');
      await scheduleNotifications(await cfg(), now); await scheduleNotifications(await cfg(), now);
      assert.equal(await TelegramDelivery.countDocuments({ key: /^preparation:/ }), 1);
      assert.equal(await TelegramTask.countDocuments({ doneAt: null }), 2);
      const delivery = await TelegramDelivery.findOne({ key: /^preparation:/ });
      const content = await deliveryContent(await cfg(), delivery, now);
      assert(content.text.includes(lesson.title));
      const url = new URL(content.buttons[0][0].url);
      assert.equal(url.searchParams.get('classId'), String(classroom._id));
      assert.equal(url.searchParams.get('date'), '2026-11-04');
      assert.equal(url.searchParams.get('lessonId'), String(lesson._id));
      await TelegramDelivery.updateMany({ key: /^preparation:/ }, { state: 'canceled' });
    });

    await t.test('delivery queue sends once, honors quiet hours and reflects web changes', async () => {
      await enqueue('unit-delivery', { text: 'Test queue delivery', type: 'daily' });
      const quietConfig = await cfg(); quietConfig.quietStart = '00:00'; quietConfig.quietEnd = '23:59';
      const count = sent.length;
      await drainDeliveries(quietConfig, new Date('2026-11-04T03:00:00Z'));
      assert.equal(sent.length, count);
      await drainDeliveries(await cfg()); await drainDeliveries(await cfg());
      assert.equal(sent.filter(item => item.text === 'Test queue delivery').length, 1);
      assert.equal((await TelegramDelivery.findOne({ key: 'unit-delivery' })).state, 'sent');
    });

    await t.test('buttons update one session and cannot run twice', async () => {
      const action = await TelegramAction.create({ type: 'sessionStatus', payload: { sessionId: String(session._id), status: 'completed' }, chatId: '777', expiresAt: new Date(Date.now() + 60000) });
      await click(action); await click(action);
      assert.equal((await Session.findById(session._id)).status, 'completed');
      assert((await TelegramAction.findById(action._id)).consumedAt);
      const event = (await eventsForDate('2026-11-04'))[0];
      assert.equal(await deliveryContent(await cfg(), { payload: { type: 'journal', event } }), null);
      const note = await TelegramAction.create({ type: 'note', payload: { sessionId: String(session._id) }, chatId: '777', expiresAt: new Date(Date.now() + 60000) });
      await click(note); await processUpdate(await cfg(), message('Teacher comment for the exact session'));
      assert.equal((await Session.findById(session._id)).teacherNote, 'Teacher comment for the exact session');
    });

    await t.test('tasks can be postponed from Telegram and completed on the website', async () => {
      const task = await TelegramTask.findOne({ doneAt: null });
      const action = await TelegramAction.create({ type: 'taskPostpone', payload: { taskId: String(task._id) }, chatId: '777', expiresAt: new Date(Date.now() + 60000) });
      await click(action);
      assert((await TelegramTask.findById(task._id)).dueAt > new Date());
      assert.equal((await request('POST', `/tasks/${task._id}/complete`)).status, 200);
      assert((await TelegramTask.findById(task._id)).doneAt);
      assert.equal(await deliveryContent(await cfg(), { payload: { type: 'task', taskId: String(task._id), text: 'Do not remind' } }), null);
    });

    await t.test('tuition command reports stored unpaid balances without changing payments', async () => {
      const Tuition = require('../src/models/TuitionRecord');
      const { localTime } = require('../src/services/telegramApi');
      const date = localTime().date;
      const tuition = await Tuition.create({ class: classroom._id, month: Number(date.slice(5, 7)), year: Number(date.slice(0, 4)), totalSessions: 4, holidaySessions: 0, feePerSession: 100000, studentAdjustments: [{ student: student._id, studentName: student.name, absentSessions: 1 }] });
      await processUpdate(await cfg(), message('/hocphi'));
      assert(sent.at(-1).text.includes('300.000'));
      assert.equal((await Tuition.findById(tuition._id)).studentAdjustments[0].isPaid, false);
    });

    await t.test('photo wizard validates membership and saves to the selected student/exam only', async () => {
      await processUpdate(await cfg(), { message: { message_id: ++messageId, from: { id: 777 }, chat: { id: 777, type: 'private' }, photo: [{ file_id: 'photo-test-1' }] } });
      let state = await TelegramConversation.findOne({ chatId: '777' });
      assert.equal(state.step, 'class');
      const pick = (step, id) => TelegramAction.findOne({ type: 'uploadPick', consumedAt: null, 'payload.step': step, 'payload.id': String(id) });
      await click(await pick('class', classroom._id));
      await click(await pick('exercise', exam._id));
      const invalid = await TelegramAction.create({ type: 'uploadPick', payload: { conversationId: String(state._id), step: 'student', id: String(outsider._id) }, chatId: '777', expiresAt: new Date(Date.now() + 60000) });
      await assert.rejects(() => click(invalid), /không thuộc lớp/);
      await click(await pick('student', student._id));
      const save = await TelegramAction.findOne({ type: 'uploadSave', consumedAt: null });
      await click(save); await click(save);
      const result = await Result.findOne({ exam: exam._id, student: student._id });
      assert(result); assert.equal(result.status, 'pending');
      assert.equal(result.submissionImages.length, 1);
      uploadFiles.push(result.submissionImages[0].url);
      assert.equal(await Result.countDocuments({ exam: otherExam._id }), 0);
      assert.equal(await Result.countDocuments({ student: outsider._id }), 0);
      assert.equal((await pendingSubmissions()).total, 1);
    });

    await t.test('AI is queued only after explicit confirmation and repeated clicks cannot queue twice', async () => {
      const ask = await TelegramAction.findOne({ type: 'askAi', consumedAt: null });
      assert(ask);
      await click(ask);
      assert.equal(await TelegramDelivery.countDocuments({ kind: 'ai' }), 0);
      const confirmation = await TelegramAction.findOne({ type: 'confirmAi', consumedAt: null });
      await click(confirmation); await click(confirmation);
      assert.equal(await TelegramDelivery.countDocuments({ kind: 'ai' }), 1);
      await TelegramDelivery.updateMany({ kind: 'ai' }, { state: 'canceled' });
    });

    await t.test('AI jobs use the existing grading controller and send the result only to the paired chat', async () => {
      const controller = require('../src/controllers/examController');
      const { executeAiJob } = require('../src/services/telegramInteractions');
      const result = await Result.findOne({ exam: exam._id, student: student._id });
      const grade = t.mock.method(controller, 'aiGradeExamResult', async (req, res) => {
        assert.equal(req.params.id, String(exam._id));
        assert.equal(req.params.studentId, String(student._id));
        assert.equal(String(req.user._id), String(admin._id));
        await Result.updateOne({ _id: result._id }, { status: 'graded', totalScore: 8, maxScore: 10, teacherNote: 'Good work' });
        res.json({});
      });
      const before = sent.length;
      await executeAiJob(await cfg(), { kind: 'exam', submissionId: String(result._id) });
      await executeAiJob(await cfg(), { kind: 'exam', submissionId: String(result._id) });
      assert.equal(grade.mock.callCount(), 1);
      assert(sent.slice(before).some(item => item.text.includes('Good work')));
      assert(sent.slice(before).every(item => item.chat_id === '777'));
    });

    await t.test('disconnect cancels queued messages and invalidates old actions', async () => {
      await enqueue('after-disconnect', { text: 'Must not send' });
      assert.equal((await request('POST', '/disconnect')).status, 200);
      assert.equal((await cfg()).enabled, false);
      assert(!(await cfg()).chatId);
      assert.equal(await TelegramAction.countDocuments(), 0);
      assert.equal((await TelegramDelivery.findOne({ key: 'after-disconnect' })).state, 'canceled');
    });

    await t.test('multiple workers use a database lease and never poll concurrently', async () => {
      const { startTelegramWorker } = require('../src/services/telegramWorker');
      const stopFirst = startTelegramWorker(), stopSecond = startTelegramWorker();
      try {
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline && !(await cfg()).lastPollAt) await new Promise(resolve => setTimeout(resolve, 20));
        assert((await cfg()).lastPollAt);
        assert(pollCount >= 1);
        assert.equal(maxPollActive, 1);
      } finally {
        stopFirst(); stopSecond();
        await new Promise(resolve => setTimeout(resolve, 80));
      }
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    const directory = path.resolve(__dirname, '../uploads');
    for (const url of uploadFiles) {
      const file = path.resolve(directory, path.basename(url));
      if (file.startsWith(directory + path.sep) && path.basename(file).startsWith('telegram-')) await fs.unlink(file).catch(() => {});
    }
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  }
});
