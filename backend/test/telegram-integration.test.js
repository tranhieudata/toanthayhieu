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
    let groupBotAdmin = true, groupOwnerAdmin = true, groupSendFailures = 0;
    t.mock.method(global, 'fetch', async (url, options) => {
      if (!String(url).startsWith('https://api.telegram.org/')) return nativeFetch(url, options);
      if (String(url).includes('/file/bot')) return new Response(Buffer.from([255, 216, 255, 0, 1]));
      const method = String(url).split('/').at(-1), body = JSON.parse(options.body);
      let result = true;
      if (method === 'getMe') result = { id: 9001, is_bot: true, username: 'test_teacher_bot' };
      if (method === 'getWebhookInfo') result = { url: '' };
      if (method === 'sendMessage') {
        if (String(body.chat_id).startsWith('-') && groupSendFailures > 0) {
          groupSendFailures -= 1;
          return { ok: false, json: async () => ({ ok: false, error_code: 503 }) };
        }
        sent.push(body); result = { message_id: ++messageId };
      }
      if (method === 'getChatMember') result = { status: body.user_id === 9001 ? (groupBotAdmin ? 'administrator' : 'member') : (groupOwnerAdmin ? 'administrator' : 'member') };
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
    const cfg = () => TelegramConfig.findOne({ key: 'default' }).select('+encryptedToken +pairingHash +groupPairingHash');
    const message = text => ({ message: { message_id: ++messageId, from: { id: 777 }, chat: { id: 777, type: 'private' }, text } });
    const click = async action => processUpdate(await cfg(), { callback_query: { id: `cb-${messageId++}`, data: `a:${action._id}`, from: { id: 777 }, message: { message_id: messageId, chat: { id: 777, type: 'private' } } } });
    const groupMessage = (text, thread = 77, userId = 777) => ({ message: { message_id: ++messageId, from: { id: userId }, chat: { id: -100123, type: 'supergroup' }, message_thread_id: thread, text } });
    const groupClick = async (action, thread = 77, userId = 777) => processUpdate(await cfg(), { callback_query: { id: `group-${messageId++}`, data: `a:${action._id}`, from: { id: userId }, message: { message_id: messageId, chat: { id: -100123, type: 'supergroup' }, message_thread_id: thread } } });
    const groupState = async (thread = 77) => {
      const { conversationChatId, withReplyContext } = require('../src/services/telegramContext');
      return TelegramConversation.findOne({ chatId: conversationChatId(withReplyContext(await cfg(), '-100123', thread)) });
    };

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

    await t.test('resaving the same token preserves connection, enabled state and queued messages', async () => {
      await enqueue('preserve-same-token', { text: 'Keep pending' });
      const saved = await request('PUT', '/settings', { token: '123456:abcdefghijklmnopqrstuvwxyz123456', enabled: true });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.enabled, true);
      assert.equal(saved.data.connected, true);
      assert.equal((await TelegramDelivery.findOne({ key: 'preserve-same-token' })).state, 'pending');
      await TelegramDelivery.updateOne({ key: 'preserve-same-token' }, { state: 'canceled' });
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

    await t.test('summary draft is generated for the selected lesson but is not saved without confirmation', async () => {
      const controller = require('../src/controllers/teachingSessionController');
      const { executeSummaryJob } = require('../src/services/telegramTeachingSummary');
      const { invokeController } = require('../src/services/telegramInteractions');
      const generate = t.mock.method(controller, 'generateParentSummary', async (req, res) => {
        assert.equal(req.body.classId, String(classroom._id));
        assert.equal(String(req.body.lessonId), String(lesson._id));
        res.json({ summary: 'Initial lesson summary', source: 'test' });
      });
      await processUpdate(await cfg(), message('/tomtat 04/11/2026'));
      const start = await TelegramAction.findOne({ type: 'summaryStart', 'payload.event.date': '2026-11-04' }).sort({ createdAt: -1 });
      assert(start); await click(start);
      const state = await TelegramConversation.findOne({ chatId: '777', type: 'summary' });
      assert.equal(state.step, 'generating');
      assert.equal((await Session.findById(session._id)).summary, '');
      const job = await TelegramDelivery.findOne({ kind: 'summary', 'payload.draftId': state.payload.draftId });
      await executeSummaryJob(await cfg(), job.payload, invokeController);
      assert.equal(generate.mock.callCount(), 1);
      const preview = await TelegramConversation.findById(state._id);
      assert.equal(preview.step, 'preview');
      assert.equal(preview.payload.summary, 'Initial lesson summary');
      assert.equal((await Session.findById(session._id)).summary, '');
    });

    await t.test('editing a summary invalidates old buttons and saves exactly the selected teaching session', async () => {
      const state = await TelegramConversation.findOne({ chatId: '777', type: 'summary' });
      const oldSave = await TelegramAction.findOne({ type: 'summarySave', 'payload.draftId': state.payload.draftId, 'payload.status': 'completed' });
      const edit = await TelegramAction.findOne({ type: 'summaryEdit', 'payload.draftId': state.payload.draftId });
      await click(edit);
      await processUpdate(await cfg(), message('Edited summary approved by teacher'));
      await assert.rejects(() => click(oldSave), /đã thay đổi/);
      const updated = await TelegramConversation.findById(state._id);
      const save = await TelegramAction.findOne({ type: 'summarySave', 'payload.draftId': updated.payload.draftId, 'payload.revision': updated.payload.revision, 'payload.status': 'completed' });
      await click(save); await click(save);
      const stored = await Session.findById(session._id);
      assert.equal(stored.summary, 'Edited summary approved by teacher');
      assert.equal(stored.status, 'completed');
      assert.equal(String(stored.class), String(classroom._id));
      assert.equal(stored.date.toISOString().slice(0, 10), '2026-11-04');
      assert.equal(String(stored.plannedLesson), String(lesson._id));
      assert.equal(stored.teacherNote, 'Teacher comment for the exact session');
      assert.equal(await Session.countDocuments({ class: classroom._id, date: new Date('2026-11-04') }), 1);
      assert.equal(await TelegramConversation.countDocuments({ chatId: '777' }), 0);
    });

    await t.test('summary saving refuses to overwrite changes made on the website', async () => {
      await processUpdate(await cfg(), message('/luubuoi 04/11/2026'));
      const start = await TelegramAction.findOne({ type: 'summaryManual', 'payload.event.date': '2026-11-04' }).sort({ createdAt: -1 });
      await click(start);
      await processUpdate(await cfg(), message('Stale Telegram draft'));
      const state = await TelegramConversation.findOne({ chatId: '777', type: 'summary' });
      await Session.updateOne({ _id: session._id }, { $set: { summary: 'Newer website summary', updatedAt: new Date(Date.now() + 5000) } }, { timestamps: false });
      const save = await TelegramAction.findOne({ type: 'summarySave', 'payload.draftId': state.payload.draftId, 'payload.revision': state.payload.revision });
      await assert.rejects(() => click(save), /đã được cập nhật/);
      assert.equal((await Session.findById(session._id)).summary, 'Newer website summary');
      await processUpdate(await cfg(), message('/huy'));
    });

    await t.test('manual Telegram summary creates a missing session with the exact date, class and lesson', async () => {
      await Plan.updateOne({ weekStart: '2026-11-02' }, { $push: { entries: { ...planEntry, date: '2026-11-05' } } });
      await processUpdate(await cfg(), message('/luubuoi 05/11/2026'));
      const start = await TelegramAction.findOne({ type: 'summaryManual', 'payload.event.date': '2026-11-05' }).sort({ createdAt: -1 });
      await click(start);
      await processUpdate(await cfg(), message('New session summary'));
      const state = await TelegramConversation.findOne({ chatId: '777', type: 'summary' });
      const save = await TelegramAction.findOne({ type: 'summarySave', 'payload.draftId': state.payload.draftId, 'payload.revision': state.payload.revision, 'payload.status': 'partial' });
      await click(save); await click(save);
      const stored = await Session.findOne({ class: classroom._id, date: new Date('2026-11-05'), startTime: '19:00' });
      assert(stored);
      assert.equal(stored.summary, 'New session summary');
      assert.equal(stored.status, 'partial');
      assert.equal(String(stored.actualLesson), String(lesson._id));
      assert.equal(stored.endTime, '21:00');
      assert.equal(await Session.countDocuments({ class: classroom._id, date: new Date('2026-11-05') }), 1);
    });

    await t.test('canceling a summary prevents a late generation job from restoring its draft', async () => {
      const { executeSummaryJob } = require('../src/services/telegramTeachingSummary');
      const { invokeController } = require('../src/services/telegramInteractions');
      await processUpdate(await cfg(), message('/tomtat 04/11/2026'));
      const start = await TelegramAction.findOne({ type: 'summaryStart', 'payload.event.date': '2026-11-04' }).sort({ createdAt: -1 });
      await click(start);
      const state = await TelegramConversation.findOne({ chatId: '777', type: 'summary' });
      const job = await TelegramDelivery.findOne({ kind: 'summary', 'payload.draftId': state.payload.draftId });
      await processUpdate(await cfg(), message('/huy'));
      const before = sent.length;
      await executeSummaryJob(await cfg(), job.payload, invokeController);
      assert.equal(sent.length, before);
      assert.equal(await TelegramConversation.countDocuments({ chatId: '777' }), 0);
    });

    await t.test('groups require a one-use code, paired owner and administrator membership', async () => {
      const result = await request('POST', '/group/pair');
      assert.equal(result.status, 200);
      const groupMessage = { from: { id: 777 }, chat: { id: -100123, type: 'supergroup', title: 'Teacher staff group' }, message_thread_id: 77, text: result.data.command };
      await processUpdate(await cfg(), { message: { ...groupMessage, from: { id: 888 } } });
      assert(!(await cfg()).groupChatId);
      groupOwnerAdmin = false;
      await processUpdate(await cfg(), { message: groupMessage });
      assert(!(await cfg()).groupChatId);
      assert((await cfg()).groupLastError);
      groupOwnerAdmin = true; groupBotAdmin = false;
      await processUpdate(await cfg(), { message: groupMessage });
      assert(!(await cfg()).groupChatId);
      groupBotAdmin = true;
      await processUpdate(await cfg(), { message: groupMessage });
      const config = await cfg();
      assert.equal(config.groupChatId, '-100123');
      assert.equal(config.groupThreadId, 77);
      assert.equal(config.groupTitle, 'Teacher staff group');
      assert.equal(config.groupEnabled, false);
      assert(!config.groupPairingHash);
      await processUpdate(await cfg(), { message: { ...groupMessage, chat: { id: -100999, type: 'supergroup', title: 'Wrong group' } } });
      assert.equal((await cfg()).groupChatId, '-100123');
      const publicSettings = await request('GET', '/settings');
      assert.equal(publicSettings.data.groupConnected, true);
      assert(!JSON.stringify(publicSettings.data).includes(result.data.command.split(' ').at(-1)));
      assert.equal((await request('POST', '/group/test')).status, 200);
      assert.equal(sent.at(-1).chat_id, '-100123');
      assert.equal(sent.at(-1).message_thread_id, 77);
    });

    await t.test('unlinked members cannot execute commands or administrative callbacks in the group', async () => {
      const before = sent.length;
      await processUpdate(await cfg(), groupMessage('/tomtat 04/11/2026', 77, 888));
      const action = await TelegramAction.create({ type: 'taskDone', payload: { taskId: String(new mongoose.Types.ObjectId()) }, chatId: '777', expiresAt: new Date(Date.now() + 60000) });
      await groupClick(action, 77, 888);
      assert.equal(sent.length, before);
      assert(!(await TelegramAction.findById(action._id)).consumedAt);
    });

    await t.test('all read commands respond in the originating group topic without intercepting ordinary conversation', async () => {
      for (const command of ['/help', '/homnay', '/tuan', '/chuacham', '/vieccanlam', '/hocphi']) {
        const before = sent.length;
        await processUpdate(await cfg(), groupMessage(command));
        assert(sent.length > before, command);
        assert(sent.slice(before).every(item => item.chat_id === '-100123' && item.message_thread_id === 77), command);
      }
      const before = sent.length;
      await processUpdate(await cfg(), groupMessage('Ordinary discussion in the staff group'));
      await processUpdate(await cfg(), groupMessage('/help@other_bot'));
      assert.equal(sent.length, before);
    });

    await t.test('group summary can be edited and saved while private upload state stays isolated', async () => {
      await processUpdate(await cfg(), message('/nopbai'));
      const privateState = await TelegramConversation.findOne({ chatId: '777' });
      assert.equal(privateState.type, 'upload');
      await processUpdate(await cfg(), groupMessage('/luubuoi 04/11/2026'));
      const start = await TelegramAction.findOne({ type: 'summaryManual', chatId: '-100123', threadId: 77, 'payload.event.date': '2026-11-04' }).sort({ createdAt: -1 });
      assert(start); assert.equal(start.userId, '777');
      await groupClick(start);
      await processUpdate(await cfg(), groupMessage('Summary edited inside group'));
      const state = await groupState();
      assert.equal(state.type, 'summary');
      assert.equal(state.payload.summary, 'Summary edited inside group');
      assert.equal((await TelegramConversation.findById(privateState._id)).type, 'upload');
      const save = await TelegramAction.findOne({ type: 'summarySave', chatId: '-100123', 'payload.draftId': state.payload.draftId, 'payload.revision': state.payload.revision, 'payload.status': 'completed' });
      await groupClick(save, 77, 888);
      assert(!(await TelegramAction.findById(save._id)).consumedAt);
      await groupClick(save, 78);
      assert(!(await TelegramAction.findById(save._id)).consumedAt);
      await groupClick(save);
      assert.equal((await Session.findById(session._id)).summary, 'Summary edited inside group');
      assert.equal(sent.at(-1).chat_id, '-100123');
      assert.equal(sent.at(-1).message_thread_id, 77);
      assert(await TelegramConversation.findById(privateState._id));
    });

    await t.test('queued summary generation returns its preview to the group even when group notifications are off', async () => {
      await processUpdate(await cfg(), groupMessage('/tomtat 04/11/2026'));
      const start = await TelegramAction.findOne({ type: 'summaryStart', chatId: '-100123', 'payload.event.date': '2026-11-04' }).sort({ createdAt: -1 });
      await groupClick(start);
      const state = await groupState();
      const job = await TelegramDelivery.findOne({ kind: 'summary', 'payload.draftId': state.payload.draftId });
      assert.equal(job.target, 'group');
      assert.equal(job.targetThreadId, 77);
      assert.equal(job.interactive, true);
      assert.equal(job.requestedBy, '777');
      assert.equal((await cfg()).groupEnabled, false);
      const before = sent.length;
      await drainDeliveries(await cfg());
      assert.equal((await groupState()).step, 'preview');
      assert(sent.slice(before).some(item => item.text.includes('Initial lesson summary')));
      assert(sent.slice(before).every(item => item.chat_id === '-100123' && item.message_thread_id === 77));
      await processUpdate(await cfg(), groupMessage('/huy'));
      assert(await TelegramConversation.findOne({ chatId: '777', type: 'upload' }));
    });

    await t.test('group photo wizard saves to the right student and AI confirmation returns the report to the group', async () => {
      await processUpdate(await cfg(), { message: { ...groupMessage('').message, photo: [{ file_id: 'group-photo-test' }] } });
      const state = await groupState();
      assert.equal(state.type, 'upload');
      const pick = (step, id) => TelegramAction.findOne({ type: 'uploadPick', chatId: '-100123', threadId: 77, consumedAt: null, 'payload.step': step, 'payload.id': String(id) }).sort({ createdAt: -1 });
      await groupClick(await pick('class', classroom._id));
      await groupClick(await pick('exercise', exam._id));
      await groupClick(await pick('student', student._id));
      const save = await TelegramAction.findOne({ type: 'uploadSave', chatId: '-100123', consumedAt: null }).sort({ createdAt: -1 });
      await groupClick(save);
      const result = await Result.findOne({ exam: exam._id, student: student._id });
      assert.equal(result.status, 'pending');
      assert.equal(result.submissionImages.length, 2);
      uploadFiles.push(...result.submissionImages.filter(image => image.url.includes(String(state._id))).map(image => image.url));
      assert(await TelegramConversation.findOne({ chatId: '777', type: 'upload' }));
      const ask = await TelegramAction.findOne({ type: 'askAi', chatId: '-100123', consumedAt: null }).sort({ createdAt: -1 });
      await groupClick(ask);
      const confirmation = await TelegramAction.findOne({ type: 'confirmAi', chatId: '-100123', consumedAt: null }).sort({ createdAt: -1 });
      await groupClick(confirmation);
      const job = await TelegramDelivery.findOne({ kind: 'ai', target: 'group', state: 'pending' });
      assert(job); assert.equal(job.targetThreadId, 77);
      const before = sent.length;
      await drainDeliveries(await cfg());
      assert.equal((await Result.findById(result._id)).status, 'graded');
      assert(sent.slice(before).some(item => item.text.includes('Good work')));
      assert(sent.slice(before).every(item => item.chat_id === '-100123' && item.message_thread_id === 77));
      await processUpdate(await cfg(), message('/huy'));
    });

    await t.test('group task controls and note entry operate in the group without leaking across topics', async () => {
      await processUpdate(await cfg(), groupMessage('/vieccanlam'));
      const taskAction = await TelegramAction.findOne({ type: 'taskDone', chatId: '-100123', consumedAt: null }).sort({ createdAt: -1 });
      assert(taskAction); await groupClick(taskAction);
      assert((await TelegramTask.findById(taskAction.payload.taskId)).doneAt);
      const { actionButton } = require('../src/services/telegramMessages');
      const { withReplyContext } = require('../src/services/telegramContext');
      const button = await actionButton(withReplyContext(await cfg(), '-100123', 77), 'Note', 'note', { sessionId: String(session._id) });
      const note = await TelegramAction.findById(button.callback_data.slice(2));
      await groupClick(note);
      const before = sent.length;
      await processUpdate(await cfg(), groupMessage('Unrelated message in other topic', 78));
      assert.equal(sent.length, before);
      await processUpdate(await cfg(), groupMessage('Teacher note entered in group'));
      assert.equal((await Session.findById(session._id)).teacherNote, 'Teacher note entered in group');
      assert.equal(sent.at(-1).chat_id, '-100123');
    });

    await t.test('automatic messages fan out independently to private chat and group without duplicate sends', async () => {
      const { enqueueNotification } = require('../src/services/telegramGroups');
      assert.equal((await request('PUT', '/settings', { groupEnabled: true, notifications: { morning: true }, groupNotifications: { morning: true } })).status, 200);
      const body = { type: 'daily', text: 'Group and private daily test' };
      await enqueueNotification(await cfg(), 'morning:group-test', body);
      await enqueueNotification(await cfg(), 'morning:group-test', body);
      const deliveries = await TelegramDelivery.find({ 'payload.text': body.text });
      assert.equal(deliveries.length, 2);
      groupSendFailures = 1;
      await drainDeliveries(await cfg());
      assert.equal(sent.filter(item => item.text === body.text && item.chat_id === '777').length, 1);
      const group = await TelegramDelivery.findOne({ 'payload.text': body.text, target: 'group' });
      assert.equal(group.state, 'pending');
      await TelegramDelivery.updateOne({ _id: group._id }, { dueAt: new Date(Date.now() - 1000) });
      await drainDeliveries(await cfg());
      const delivered = sent.filter(item => item.text === body.text);
      assert.equal(delivered.filter(item => item.chat_id === '777').length, 1);
      assert.equal(delivered.filter(item => item.chat_id === '-100123').length, 1);
      const groupMessage = delivered.find(item => item.chat_id === '-100123');
      assert.equal(groupMessage.message_thread_id, 77);
      assert((groupMessage.reply_markup?.inline_keyboard || []).flat().every(button => !button.callback_data));
    });

    await t.test('group-only mode retains private commands and filters unselected group categories', async () => {
      const { enqueueNotification } = require('../src/services/telegramGroups');
      assert.equal((await request('PUT', '/settings', { privateNotificationsEnabled: false })).status, 200);
      await enqueueNotification(await cfg(), 'morning:group-only', { type: 'daily', text: 'Only group' });
      assert.equal(await TelegramDelivery.countDocuments({ 'payload.text': 'Only group' }), 1);
      await enqueueNotification(await cfg(), 'tuition:private-sensitive', { type: 'tuition', text: 'Must not be queued' });
      assert.equal(await TelegramDelivery.countDocuments({ 'payload.text': 'Must not be queued' }), 0);
      await processUpdate(await cfg(), message('/help'));
      assert.equal(sent.at(-1).chat_id, '777');
      await drainDeliveries(await cfg());
      assert.equal(sent.filter(item => item.text === 'Only group' && item.chat_id === '-100123').length, 1);
      assert.equal(sent.filter(item => item.text === 'Only group' && item.chat_id === '777').length, 0);
    });

    await t.test('a group upgraded to supergroup keeps its connection and reroutes pending notifications', async () => {
      const { enqueueNotification } = require('../src/services/telegramGroups');
      const before = await cfg();
      await enqueueNotification(before, 'morning:group-migration', { type: 'daily', text: 'Rerouted group message' });
      await processUpdate(before, { message: { chat: { id: -100123, type: 'group' }, migrate_to_chat_id: -100124 } });
      const after = await cfg();
      assert.equal(after.groupChatId, '-100124');
      assert.equal(after.groupConnectionId, before.groupConnectionId);
      assert.equal((await TelegramDelivery.findOne({ 'payload.text': 'Rerouted group message' })).targetChatId, '-100124');
      await drainDeliveries(after);
      assert.equal(sent.filter(item => item.text === 'Rerouted group message' && item.chat_id === '-100124').length, 1);
    });

    await t.test('disconnecting a group cancels group messages while private pairing is preserved', async () => {
      const { enqueueNotification } = require('../src/services/telegramGroups');
      await enqueueNotification(await cfg(), 'morning:cancel-group', { type: 'daily', text: 'Do not send after disconnect' });
      assert.equal((await request('POST', '/group/disconnect')).status, 200);
      const config = await cfg();
      assert(!config.groupChatId);
      assert.equal(config.groupEnabled, false);
      assert.equal(config.chatId, '777');
      assert(config.enabled);
      assert.equal((await TelegramDelivery.findOne({ 'payload.text': 'Do not send after disconnect' })).state, 'canceled');
      assert.equal((await request('PUT', '/settings', { groupEnabled: true })).status, 400);
      await request('PUT', '/settings', { privateNotificationsEnabled: true });
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
