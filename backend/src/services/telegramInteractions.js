const crypto = require('crypto');
const mongoose = require('mongoose');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const Homework = require('../models/Homework');
const ExamResult = require('../models/ExamResult');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const TeachingSession = require('../models/TeachingSession');
const User = require('../models/User');
const { TelegramConfig, TelegramAction, TelegramTask, TelegramConversation } = require('../models/Telegram');
const { telegramApi, localTime, weekStart, addDateDays, websiteLink } = require('./telegramApi');
const { send, actionButton, linkButton, eventButtons, enqueue } = require('./telegramMessages');
const { eventsForDate, syncEventTasks, pendingSubmissions, tuitionSummary, idOf } = require('./telegramData');
const { dailyText, weeklyText } = require('./telegramScheduler');
const { summaryDate, showTeachingSummaries, handleSummaryAction, handleSummaryText } = require('./telegramTeachingSummary');
const { processGroupUpdate } = require('./telegramGroups');
const { replyChatId, conversationChatId, updateContext, contextRouting } = require('./telegramContext');

const HELP = '📚 Trợ lý Toán Thầy Hiếu\n/homnay — Lịch và việc hôm nay\n/tomtat — Chọn buổi và tạo tóm tắt\n/luubuoi — Nhập tóm tắt và lưu buổi dạy\n/tuan — Kế hoạch tuần này\n/chuacham — Bài làm cần chấm\n/vieccanlam — Công việc chưa xong\n/hocphi — Khoản học phí chưa thanh toán\n/nopbai — Gửi ảnh bài làm lên web\n/xong — Chọn nơi lưu ảnh đã gửi\n/huy — Hủy thao tác nhập\n\n/tomtat và /luubuoi nhận ngày DD/MM/YYYY, ví dụ /tomtat 04/11/2026. Tóm tắt là bản nháp; thầy xem/sửa rồi bấm Lưu buổi dạy.\nTrả lời tin nhắc buổi dạy để lưu nhận xét. Chấm AI cần xác nhận; kết quả gửi ngay tại chat hoặc nhóm nơi thầy yêu cầu.';

function isAuthorized(config, update) {
  const message = update.callback_query?.message || update.message;
  const from = update.callback_query?.from || update.message?.from;
  const privateChat = message?.chat?.type === 'private' && String(message.chat.id) === String(config.chatId);
  const linkedGroup = ['group', 'supergroup'].includes(message?.chat?.type) && Boolean(config.groupChatId) && String(message.chat.id) === String(config.groupChatId);
  return (privateChat || linkedGroup) && String(from?.id) === String(config.telegramUserId);
}

async function invokeController(controller, req) {
  let code = 200, result;
  await controller(req, { status(value) { code = value; return this; }, json(value) { result = value; return this; } });
  if (code >= 400) throw new Error(result?.message || 'Không thực hiện được thao tác');
  return result;
}

async function submissionById(kind, submissionId) {
  if (!mongoose.isValidObjectId(submissionId)) throw new Error('Bài làm không hợp lệ');
  const Model = kind === 'exam' ? ExamResult : HomeworkSubmission;
  const item = await Model.findById(submissionId).populate(kind === 'exam' ? 'exam' : 'homework', 'title class classSchedules').populate('student', 'name').populate('class', 'name');
  if (!item || !item.student || !(kind === 'exam' ? item.exam : item.homework)) throw new Error('Bài làm đã bị xóa');
  return item;
}

const submissionLink = (config, kind, item) => kind === 'exam'
  ? websiteLink(config, `/admin/exam-grading/${idOf(item.exam)}`, { studentId: idOf(item.student) })
  : websiteLink(config, '/admin/homeworks', { homeworkId: idOf(item.homework) });

async function submissionButtons(config, kind, item) {
  const buttons = [[{ text: 'Mở bài làm trên web', url: submissionLink(config, kind, item) }]];
  buttons.push([await actionButton(config, item.status === 'graded' ? 'Xem phiếu kết quả' : 'Chấm bằng AI', item.status === 'graded' ? 'report' : 'askAi', { kind, submissionId: idOf(item) })]);
  return buttons;
}

async function showPending(config, offset = 0) {
  const { items, total } = await pendingSubmissions(offset + 6);
  const slice = items.slice(offset, offset + 5);
  await send(config, `📝 Có ${total} bài làm có ảnh đang chờ chấm.${slice.length ? '\nDanh sách bên dưới:' : ''}`, [[linkButton(config, 'Chấm đề kiểm tra', '/admin/exam-grading'), linkButton(config, 'Bài tập', '/admin/homeworks')]]);
  for (const item of slice) await send(config, `${item.class?.name || ''} · ${item.student.name}\n${item.exercise.title}`, await submissionButtons(config, item.kind, item));
  if (total > offset + 5) await send(config, 'Xem các bài tiếp theo:', [[await actionButton(config, 'Trang tiếp', 'pendingPage', { offset: offset + 5 }, 30)]]);
}

async function showTasks(config) {
  const events = await eventsForDate(localTime().date);
  await syncEventTasks(events);
  const tasks = await TelegramTask.find({ doneAt: null, archivedAt: null }).sort({ dueAt: 1 }).limit(15);
  if (!tasks.length) return send(config, '✅ Chưa có việc cần làm. Việc được lấy từ từng dòng ghi chú trong Kế hoạch tuần.');
  for (const task of tasks) await send(config, `📌 ${task.className} · ${task.date}\n${task.text}`, [[
    await actionButton(config, 'Hoàn thành', 'taskDone', { taskId: idOf(task) }),
    await actionButton(config, 'Dời sang ngày mai', 'taskPostpone', { taskId: idOf(task) }),
  ]]);
}

async function showReport(config, kind, item) {
  if (item.status !== 'graded') return send(config, 'Bài này chưa được chấm.');
  const report = item.gradingReport;
  const text = [
    '📋 PHIẾU KẾT QUẢ CHẤM BÀI', item.student.name, (kind === 'exam' ? item.exam : item.homework).title,
    `Tổng điểm: ${kind === 'exam' ? item.totalScore : item.score}/${item.maxScore}`,
    ...(report?.objective?.length ? ['TRẮC NGHIỆM', ...report.objective.map(row => `${row.label}: HS ${row.studentAnswer || '—'} · Đáp án ${row.expectedAnswer} · ${row.correct ? 'Đ' : 'S'} · ${row.score}/${row.maxScore}`)] : []),
    ...(report?.essay?.length ? ['TỰ LUẬN', ...report.essay.map(row => `${row.label}: ${row.score}/${row.maxScore} · ${row.note}`)] : []),
    'NHẬN XÉT CỦA THẦY', item.teacherNote || report?.feedback || item.autoFeedback || item.feedback || '',
  ].join('\n');
  for (let offset = 0; offset < text.length; offset += 3800) await send(config, text.slice(offset, offset + 3800));
  await send(config, 'Mở web để in hoặc lưu PDF phiếu kết quả.', [[{ text: 'Xem phiếu trên web', url: submissionLink(config, kind, item) }]]);
}

async function executeAiJob(config, payload) {
  const admin = await User.findById(config.admin).select('role isActive');
  if (admin?.role !== 'admin' || admin.isActive === false) throw new Error('Tài khoản liên kết không còn quyền quản trị');
  const item = await submissionById(payload.kind, payload.submissionId);
  if (item.status === 'graded') return;
  const req = { user: admin, params: { id: idOf(payload.kind === 'exam' ? item.exam : item.homework), studentId: idOf(item.student) }, body: { aiModel: 'gemini' } };
  const controller = payload.kind === 'exam' ? require('../controllers/examController').aiGradeExamResult : require('../controllers/homeworkController').gradeSubmission;
  await invokeController(controller, req);
  await showReport(config, payload.kind, await submissionById(payload.kind, payload.submissionId));
}

async function startConversation(config, type, payload = {}, files = []) {
  return TelegramConversation.findOneAndUpdate({ chatId: conversationChatId(config) }, { $set: { type, step: type === 'upload' ? 'class' : 'note', payload, files, expiresAt: new Date(Date.now() + 30 * 60000) } }, { upsert: true, new: true });
}

async function uploadMenu(config, state, page = 0) {
  const size = 8, payload = state.payload || {};
  let items = [], label = '';
  if (state.step === 'class') {
    label = 'Chọn lớp cho ảnh bài làm:';
    items = (await Class.find({ isActive: { $ne: false } }).select('name').sort({ name: 1 })).map(cls => ({ id: idOf(cls), text: cls.name }));
  } else if (state.step === 'exercise') {
    label = 'Chọn đề hoặc bài tập đã giao cho lớp:';
    const [exams, homeworks] = await Promise.all([
      Exam.find({ 'classSchedules.class': payload.classId }).select('title').sort({ createdAt: -1 }),
      Homework.find({ class: payload.classId }).select('title').sort({ createdAt: -1 }),
    ]);
    items = [...exams.map(exam => ({ id: idOf(exam), kind: 'exam', text: `Đề: ${exam.title}` })), ...homeworks.map(hw => ({ id: idOf(hw), kind: 'homework', text: `BT: ${hw.title}` }))];
  } else if (state.step === 'student') {
    label = 'Chọn học sinh:';
    const cls = await Class.findById(payload.classId).populate('students', 'name');
    items = (cls?.students || []).map(student => ({ id: idOf(student), text: student.name }));
  } else if (state.step === 'ready') {
    return send(config, `Đã nhận ${state.files.length} ảnh. Thầy có thể gửi thêm ảnh rồi bấm Lưu ảnh.`, [[await actionButton(config, 'Lưu ảnh lên web', 'uploadSave', { conversationId: idOf(state) }, 30)]]);
  }
  const buttons = [];
  for (const item of items.slice(page * size, (page + 1) * size)) buttons.push([await actionButton(config, item.text.slice(0, 60), 'uploadPick', { conversationId: idOf(state), step: state.step, id: item.id, kind: item.kind }, 30)]);
  if (items.length > (page + 1) * size) buttons.push([await actionButton(config, 'Trang tiếp', 'uploadPage', { conversationId: idOf(state), page: page + 1 }, 30)]);
  return send(config, items.length ? label : 'Chưa có dữ liệu phù hợp. Thêm lớp, đề hoặc học sinh trên web rồi gõ /nopbai để bắt đầu lại.', buttons);
}

async function handleAction(config, action, admin) {
  const payload = action.payload || {};
  if (action.type.startsWith('summary')) return handleSummaryAction(config, action, admin, invokeController);
  if (action.type === 'pendingPage') return showPending(config, payload.offset);
  if (action.type === 'prepared') {
    await TelegramTask.updateOne({ key: `prepared:${payload.event.key}` }, { $set: { doneAt: new Date(), preparedAt: new Date() }, $setOnInsert: { slotKey: payload.event.key, text: 'Chuẩn bị buổi dạy', className: payload.event.className, date: payload.event.date } }, { upsert: true });
    return send(config, `✅ Đã chuẩn bị: ${payload.event.className} · ${payload.event.startTime}`);
  }
  if (action.type === 'snooze') {
    await enqueue(`snooze:${action._id}`, { type: payload.type, event: payload.event, text: `⏰ Nhắc lại\n${payload.event.className} · ${payload.event.startTime}\n${payload.event.topic}\n${payload.event.note || ''}` }, new Date(Date.now() + 15 * 60000), 'message', contextRouting(config));
    return send(config, 'Đã hẹn nhắc lại sau 15 phút.');
  }
  if (action.type === 'sessionStatus') {
    const session = await TeachingSession.findById(payload.sessionId);
    if (!session || session.status !== 'planned') return send(config, 'Buổi dạy đã được cập nhật trước đó. Mở web để xem hoặc sửa.');
    await invokeController(require('../controllers/teachingSessionController').updateTeachingSession, { params: { id: payload.sessionId }, body: { status: payload.status }, user: admin, expectedStatus: 'planned' });
    return send(config, `✅ Đã lưu trạng thái: ${payload.status === 'completed' ? 'Đã dạy xong' : 'Dạy một phần'}.`);
  }
  if (action.type === 'note') {
    const session = await TeachingSession.findById(payload.sessionId);
    if (!session) throw new Error('Buổi dạy đã bị xóa');
    await startConversation(config, 'note', payload);
    return send(config, 'Nhập nhận xét cho buổi dạy này. Nội dung sẽ được lưu vào “Nhận xét của giáo viên”. Gõ /huy để hủy.');
  }
  if (action.type === 'taskDone' || action.type === 'taskPostpone') {
    const task = await TelegramTask.findOneAndUpdate({ _id: payload.taskId, doneAt: null }, { $set: action.type === 'taskDone' ? { doneAt: new Date() } : { dueAt: new Date(`${addDateDays(localTime().date, 1)}T08:00:00+07:00`) } }, { new: true });
    return send(config, task ? `✅ ${action.type === 'taskDone' ? 'Đã hoàn thành' : 'Đã dời sang 08:00 ngày mai'}: ${task.text}` : 'Việc này đã hoàn thành hoặc không còn tồn tại.');
  }
  if (['askAi', 'confirmAi', 'report'].includes(action.type)) {
    const item = await submissionById(payload.kind, payload.submissionId);
    if (action.type === 'report') return showReport(config, payload.kind, item);
    if (item.status === 'graded') return send(config, 'Bài đã được chấm. Mở web nếu cần chấm lại.', await submissionButtons(config, payload.kind, item));
    if (action.type === 'askAi') return send(config, `Xác nhận chấm bằng AI cho ${item.student.name}, bài “${(payload.kind === 'exam' ? item.exam : item.homework).title}”? Kết quả sẽ lưu vào web và gửi tại cuộc trò chuyện này.`, [[await actionButton(config, 'Xác nhận chấm AI', 'confirmAi', payload, 10)]]);
    await enqueue(`ai:${action._id}`, payload, new Date(), 'ai', contextRouting(config));
    return send(config, 'Đã nhận yêu cầu chấm AI. Bot sẽ gửi phiếu khi chấm xong.');
  }
  if (action.type.startsWith('upload')) return handleUploadAction(config, action, admin);
}

async function handleUploadAction(config, action, admin) {
  const payload = action.payload;
  const state = await TelegramConversation.findOne({ _id: payload.conversationId, chatId: conversationChatId(config), type: 'upload', expiresAt: { $gt: new Date() } });
  if (!state) throw new Error('Phiên gửi ảnh đã hết hạn. Gửi ảnh hoặc gõ /nopbai để bắt đầu lại.');
  if (action.type === 'uploadPage') return uploadMenu(config, state, payload.page);
  if (action.type === 'uploadSave') {
    if (state.step !== 'ready' || !state.files.length) throw new Error('Chưa đủ thông tin hoặc chưa có ảnh');
    const { saveTelegramImages } = require('./telegramUpload');
    const item = await saveTelegramImages(config, state, admin, invokeController);
    await TelegramConversation.deleteOne({ _id: state._id });
    return send(config, `✅ Đã lưu ${state.files.length} ảnh bài làm cho ${item.student.name}.`, await submissionButtons(config, state.payload.kind, item));
  }
  if (state.step !== payload.step) throw new Error('Lựa chọn này thuộc bước cũ. Dùng tin nhắn mới nhất của bot.');
  const data = { ...state.payload };
  let nextStep;
  if (state.step === 'class') {
    if (!await Class.exists({ _id: payload.id })) throw new Error('Lớp không tồn tại');
    data.classId = payload.id; nextStep = 'exercise';
  } else if (state.step === 'exercise') {
    const valid = payload.kind === 'exam' ? await Exam.exists({ _id: payload.id, 'classSchedules.class': data.classId }) : await Homework.exists({ _id: payload.id, class: data.classId });
    if (!valid) throw new Error('Đề/bài tập không thuộc lớp đang chọn');
    data.kind = payload.kind; data.exerciseId = payload.id; nextStep = 'student';
  } else {
    if (!await Class.exists({ _id: data.classId, students: payload.id })) throw new Error('Học sinh không thuộc lớp đang chọn');
    data.studentId = payload.id; nextStep = 'ready';
  }
  state.payload = data; state.step = nextStep;
  await state.save();
  return uploadMenu(config, state);
}

async function handleMessage(config, message, admin) {
  const text = String(message.text || '').trim();
  const addressedTo = text.match(/^\/\w+@(\w+)/)?.[1];
  if (addressedTo && addressedTo.toLowerCase() !== config.botUsername?.toLowerCase()) return;
  const command = text.split(/[\s@]/)[0].toLowerCase();
  if (command === '/huy') { await TelegramConversation.deleteOne({ chatId: conversationChatId(config) }); return send(config, 'Đã hủy thao tác nhập.'); }
  const photo = message.photo?.at(-1)?.file_id || (message.document?.mime_type?.startsWith('image/') ? message.document.file_id : null);
  let state = await TelegramConversation.findOne({ chatId: conversationChatId(config), expiresAt: { $gt: new Date() } });
  if (command === '/tomtat' || command === '/luubuoi') {
    return showTeachingSummaries(config, summaryDate(text.split(/\s+/)[1]), command === '/luubuoi');
  }
  if (state?.type === 'summary' && text && !text.startsWith('/')) return handleSummaryText(config, state, text);
  if (photo || command === '/nopbai') {
    if (!state || state.type !== 'upload' || command === '/nopbai') state = await startConversation(config, 'upload');
    if (photo) {
      if (state.files.length >= 20) return send(config, 'Mỗi lần nhận tối đa 20 ảnh. Lưu nhóm ảnh hiện tại rồi gửi tiếp.');
      state = await TelegramConversation.findByIdAndUpdate(state._id, { $addToSet: { files: photo } }, { new: true });
    }
    if (!message.media_group_id || state.files.length === 1) return uploadMenu(config, state);
    return;
  }
  if (command === '/xong') return state?.type === 'upload' ? uploadMenu(config, state) : send(config, 'Gửi ảnh hoặc gõ /nopbai trước.');
  if (command === '/homnay') {
    const date = localTime().date;
    const events = await eventsForDate(date);
    await syncEventTasks(events);
    await send(config, await dailyText(date));
    for (const event of events) await send(config, `${event.startTime}–${event.endTime} · ${event.className}\n${event.topic}`, await eventButtons(config, event, event.endAt <= new Date() ? 'journal' : 'preparation'));
    return;
  }
  if (command === '/tuan') return send(config, await weeklyText(weekStart(localTime().date)), [[linkButton(config, 'Mở kế hoạch tuần', '/admin')]]);
  if (command === '/chuacham') return showPending(config);
  if (command === '/vieccanlam') return showTasks(config);
  if (command === '/hocphi') return send(config, await tuitionSummary(), [[linkButton(config, 'Mở học phí', '/admin/tuition')]]);
  if (command === '/help' || command === '/start') return send(config, HELP);
  if (text && !text.startsWith('/')) {
    let sessionId = state?.type === 'note' ? state.payload?.sessionId : null;
    if (!sessionId && message.reply_to_message?.message_id) {
      const { TelegramDelivery } = require('../models/Telegram');
      const delivery = await TelegramDelivery.findOne({ messageId: message.reply_to_message.message_id, chatId: replyChatId(config), targetThreadId: config.replyThreadId || null, botUsername: config.botUsername, state: 'sent' });
      sessionId = delivery?.payload?.event?.sessionId;
    }
    if (sessionId) {
      await invokeController(require('../controllers/teachingSessionController').updateTeachingSession, { params: { id: sessionId }, body: { teacherNote: text.slice(0, 10000) }, user: admin });
      await TelegramConversation.deleteOne({ chatId: conversationChatId(config), type: 'note' });
      return send(config, '✅ Đã lưu nhận xét vào đúng buổi dạy trên web.');
    }
  }
  if (replyChatId(config) === String(config.groupChatId) && !text.startsWith('/')) return;
  return send(config, HELP);
}

async function processUpdate(config, update) {
  if (await processGroupUpdate(config, update)) return;
  const message = update.message;
  const pairingCode = message?.text?.match(/^\/start(?:@\w+)?\s+([a-f0-9]{36})$/)?.[1];
  if (pairingCode && message.chat.type === 'private' && String(message.chat.id) === String(message.from.id)) {
    const hash = crypto.createHash('sha256').update(pairingCode).digest('hex');
    const paired = await TelegramConfig.findOneAndUpdate({ key: 'default', pairingHash: hash, pairingExpiresAt: { $gt: new Date() } }, { $set: { chatId: String(message.chat.id), telegramUserId: String(message.from.id), connectedAt: new Date(), pairingHash: null, pairingExpiresAt: null, lastError: '' } }, { new: true });
    if (paired) await send({ ...config.toObject?.() || config, chatId: String(message.chat.id) }, '✅ Đã liên kết với website. Quay lại Cài đặt → Telegram để bật thông báo và gửi tin thử.');
    return;
  }
  if (!isAuthorized(config, update)) return;
  config = updateContext(config, update);
  const admin = await User.findById(config.admin).select('role isActive');
  if (admin?.role !== 'admin' || admin.isActive === false) return;
  if (update.callback_query) {
    await telegramApi(config, 'answerCallbackQuery', { callback_query_id: update.callback_query.id });
    if (!config.enabled) return send(config, 'Bot đang tắt. Bật lại trong Cài đặt → Telegram.');
    const id = update.callback_query.data?.match(/^a:([a-f0-9]{24})$/)?.[1];
    if (!id) return;
    const groupContext = replyChatId(config) === String(config.groupChatId);
    const action = await TelegramAction.findOneAndUpdate({ _id: id, chatId: replyChatId(config), threadId: config.replyThreadId || null, ...(groupContext ? { userId: String(config.telegramUserId), groupConnectionId: config.groupConnectionId || config.groupChatId } : { $or: [{ userId: null }, { userId: String(config.telegramUserId) }] }), consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
    if (!action) return send(config, 'Nút này đã dùng hoặc hết hạn. Gõ /homnay, /chuacham hoặc /vieccanlam để lấy thao tác mới.');
    await handleAction(config, action, admin);
    await telegramApi(config, 'editMessageReplyMarkup', { chat_id: replyChatId(config), message_id: update.callback_query.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  } else if (message) {
    if (!config.enabled) return send(config, 'Bot đang tắt. Bật lại trong Cài đặt → Telegram.');
    await handleMessage(config, message, admin);
  }
}

module.exports = { processUpdate, isAuthorized, executeAiJob, submissionById, submissionButtons, invokeController, showTasks, showPending };
