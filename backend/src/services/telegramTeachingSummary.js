const crypto = require('crypto');
const TeachingSession = require('../models/TeachingSession');
const User = require('../models/User');
const { TelegramConversation } = require('../models/Telegram');
const { send, actionButton, enqueue } = require('./telegramMessages');
const { eventsForDate, eventLink, idOf } = require('./telegramData');
const { localTime } = require('./telegramApi');
const { sessionDayRange } = require('./teachingSessionDates');
const { conversationChatId, contextRouting } = require('./telegramContext');

function summaryDate(input) {
  if (!input) return localTime().date;
  let value = input;
  const match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) value = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Dùng /tomtat hoặc /luubuoi kèm ngày DD/MM/YYYY, ví dụ /tomtat 04/11/2026.');
  return value;
}

async function showTeachingSummaries(config, date, manual = false) {
  const events = await eventsForDate(date);
  if (!events.length) return send(config, 'Ngày này chưa có lịch dạy. Thêm lịch hoặc kế hoạch trên web trước.');
  await send(config, `Chọn buổi để ${manual ? 'nhập tóm tắt và lưu nhật ký' : 'tạo tóm tắt'} · ${date.split('-').reverse().join('/')}`);
  for (const event of events) await send(config, `${event.className} · ${event.startTime}–${event.endTime}\n${event.topic}`, [[await actionButton(config, manual ? 'Nhập / lưu buổi dạy' : 'Tạo tóm tắt buổi này', manual ? 'summaryManual' : 'summaryStart', { event }, 30)]]);
}

async function resolveTarget(config, event, admin, invoke) {
  const { getTeachingPlanner } = require('../controllers/teachingSessionController');
  const planner = await invoke(getTeachingPlanner, { user: admin, query: { classId: event.classId, date: event.date, startTime: event.startTime, fromSchedule: '1' } });
  const session = planner.currentSession;
  if (!planner.lesson?._id) throw new Error('Buổi này chưa có bài học. Chọn bài trong Kế hoạch tuần rồi lưu lại trước.');
  return {
    event: { ...event, lessonId: idOf(planner.lesson), topic: planner.lesson.title, sessionId: session?._id ? idOf(session) : null },
    sessionId: session?._id ? idOf(session) : null,
    updatedAt: session?.updatedAt ? new Date(session.updatedAt).toISOString() : null,
    originalSummary: session?.summary || '', status: session?.status || 'planned',
    homeworkLinks: (planner.homeworks || []).filter(homework => homework.parentPrintUrl).map(homework => ({ title: homework.title, url: new URL(homework.parentPrintUrl, config.websiteUrl).href })),
  };
}

async function previewSummary(config, state) {
  const { target, summary, draftId, revision } = state.payload;
  const event = target.event;
  const header = `📝 BẢN NHÁP TÓM TẮT\n${event.className} · ${event.date.split('-').reverse().join('/')} · ${event.startTime}–${event.endTime}\nBài: ${event.topic}\n\n`;
  const content = `${header}${summary || 'Chưa có nội dung. Bấm Sửa tóm tắt để nhập.'}`;
  for (let offset = 0; offset < content.length; offset += 3600) await send(config, content.slice(offset, offset + 3600));
  const payload = { conversationId: idOf(state), draftId, revision };
  const buttons = [];
  if (summary?.trim()) {
    buttons.push([await actionButton(config, 'Lưu buổi dạy', 'summarySave', { ...payload, status: target.status }, 30)]);
    buttons.push([
      await actionButton(config, 'Lưu & đã dạy xong', 'summarySave', { ...payload, status: 'completed' }, 30),
      await actionButton(config, 'Lưu & dạy một phần', 'summarySave', { ...payload, status: 'partial' }, 30),
    ]);
  }
  buttons.push([
    await actionButton(config, 'Sửa tóm tắt', 'summaryEdit', payload, 30),
    await actionButton(config, 'Tạo lại tóm tắt', 'summaryRegenerate', payload, 30),
  ]);
  return send(config, 'Bản nháp chưa được lưu. Chọn cách lưu hoặc gửi nội dung mới để sửa. /huy để bỏ bản nháp.', buttons);
}

async function beginSummary(config, event, admin, invoke, manual = false) {
  const target = await resolveTarget(config, event, admin, invoke);
  const draftId = crypto.randomUUID();
  const state = await TelegramConversation.findOneAndUpdate({ chatId: conversationChatId(config) }, { $set: {
    type: 'summary', step: manual ? 'preview' : 'generating', files: [],
    payload: { draftId, revision: 1, target, summary: target.originalSummary },
    expiresAt: new Date(Date.now() + 30 * 60000),
  } }, { upsert: true, new: true });
  if (manual) return previewSummary(config, state);
  await enqueue(`summary:${draftId}`, { conversationId: idOf(state), draftId, revision: 1 }, new Date(), 'summary', contextRouting(config));
  return send(config, `Đang tạo tóm tắt cho ${target.event.className} · ${target.event.topic}. Bot sẽ gửi bản nháp để thầy kiểm tra trước khi lưu.`);
}

async function executeSummaryJob(config, payload, invoke) {
  const filter = { _id: payload.conversationId, chatId: conversationChatId(config), type: 'summary', step: 'generating', 'payload.draftId': payload.draftId, 'payload.revision': payload.revision, expiresAt: { $gt: new Date() } };
  const state = await TelegramConversation.findOne(filter);
  if (!state) return;
  const admin = await User.findById(config.admin).select('role isActive');
  if (admin?.role !== 'admin' || admin.isActive === false) throw new Error('Tài khoản liên kết không còn quyền quản trị');
  const { target } = state.payload;
  const result = await invoke(require('../controllers/teachingSessionController').generateParentSummary, {
    user: admin, body: { classId: target.event.classId, lessonId: target.event.lessonId, homeworkLinks: target.homeworkLinks },
  });
  if (!result?.summary?.trim()) throw new Error('Chưa tạo được tóm tắt. Gõ /luubuoi để nhập thủ công.');
  const saved = await TelegramConversation.findOneAndUpdate(filter, { $set: { step: 'preview', 'payload.summary': result.summary.slice(0, 10000) } }, { new: true });
  if (saved) await previewSummary(config, saved);
}

async function handleSummaryText(config, state, text) {
  if (state.step === 'generating') return send(config, 'Bot đang tạo tóm tắt. Đợi bản nháp hoặc gõ /huy để hủy.');
  if (state.step === 'saving') return send(config, 'Bot đang lưu buổi dạy.');
  if (!text.trim() || text.length > 10000) throw new Error('Tóm tắt phải có nội dung và tối đa 10.000 ký tự.');
  const updated = await TelegramConversation.findOneAndUpdate({ _id: state._id, type: 'summary', 'payload.draftId': state.payload.draftId, 'payload.revision': state.payload.revision, step: { $in: ['preview', 'editing'] } }, {
    $set: { step: 'preview', 'payload.summary': text.trim(), expiresAt: new Date(Date.now() + 30 * 60000) }, $inc: { 'payload.revision': 1 },
  }, { new: true });
  if (updated) await previewSummary(config, updated);
}

async function handleSummaryAction(config, action, admin, invoke) {
  const payload = action.payload;
  if (action.type === 'summaryStart' || action.type === 'summaryManual') return beginSummary(config, payload.event, admin, invoke, action.type === 'summaryManual');
  const filter = { _id: payload.conversationId, chatId: conversationChatId(config), type: 'summary', 'payload.draftId': payload.draftId, 'payload.revision': payload.revision, expiresAt: { $gt: new Date() } };
  const state = await TelegramConversation.findOne(filter);
  if (!state) throw new Error('Bản nháp này đã thay đổi hoặc hết hạn. Dùng các nút của bản nháp mới nhất hoặc gõ /tomtat.');
  if (action.type === 'summaryEdit') {
    await TelegramConversation.updateOne(filter, { $set: { step: 'editing' } });
    return send(config, 'Gửi nội dung tóm tắt mới. Bot sẽ cho xem lại trước khi lưu; /huy để hủy.');
  }
  if (action.type === 'summaryRegenerate') return beginSummary(config, state.payload.target.event, admin, invoke);
  if (action.type !== 'summarySave') return;
  if (!['planned', 'completed', 'partial', 'skipped', 'rescheduled'].includes(payload.status)) throw new Error('Trạng thái buổi dạy không hợp lệ');
  if (!state.payload.summary?.trim()) throw new Error('Nhập hoặc tạo tóm tắt trước khi lưu');
  const claimed = await TelegramConversation.findOneAndUpdate({ ...filter, step: 'preview' }, { $set: { step: 'saving' } }, { new: true });
  if (!claimed) throw new Error('Bản nháp đang xử lý. Vui lòng đợi hoặc dùng nút mới nhất.');
  try {
    const { target, summary } = claimed.payload;
    const event = target.event;
    const controller = require('../controllers/teachingSessionController');
    let result;
    if (target.sessionId) {
      result = await invoke(controller.updateTeachingSession, { user: admin, params: { id: target.sessionId }, expectedUpdatedAt: target.updatedAt, body: { summary, status: payload.status } });
    } else {
      const existing = await TeachingSession.findOne({ class: event.classId, date: sessionDayRange(event.date), startTime: event.startTime });
      if (existing) throw new Error('Buổi này vừa được tạo trên web. Gõ /tomtat để lấy lại thông tin trước khi lưu.');
      result = await invoke(controller.createTeachingSession, { user: admin, body: {
        class: event.classId, date: event.date, startTime: event.startTime, endTime: event.endTime,
        plannedLesson: event.lessonId, actualLesson: event.lessonId, summary, status: payload.status,
        weeklyPlanKey: event.key, planningNote: event.note || '',
      } });
    }
    await TelegramConversation.deleteOne({ _id: claimed._id, 'payload.draftId': payload.draftId });
    await send(config, `✅ Đã lưu buổi dạy\n${event.className} · ${event.date.split('-').reverse().join('/')} · ${event.startTime}–${event.endTime}\n${event.topic}\n${payload.status === 'completed' ? 'Đã dạy xong' : payload.status === 'partial' ? 'Dạy một phần' : 'Đã lưu nhật ký'}`, [[{ text: 'Mở buổi dạy đã lưu', url: eventLink(config, { ...event, sessionId: idOf(result) }) }]]);
  } catch (error) {
    await TelegramConversation.updateOne({ ...filter, step: 'saving' }, { $set: { step: 'preview' } });
    throw error;
  }
}

module.exports = { summaryDate, showTeachingSummaries, beginSummary, executeSummaryJob, handleSummaryText, handleSummaryAction };
