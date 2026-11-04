const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const Homework = require('../models/Homework');
const ExamResult = require('../models/ExamResult');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const { telegramApi, decryptToken } = require('./telegramApi');

function imageExtension(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  throw new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP');
}

async function downloadImage(config, fileId, conversationId) {
  const info = await telegramApi(config, 'getFile', { file_id: fileId });
  const limit = 10 * 1024 * 1024;
  if (info.file_size > limit || !/^[\w/-]+\.[a-zA-Z0-9]+$/.test(info.file_path || '') || info.file_path.includes('..')) throw new Error('Ảnh không hợp lệ hoặc lớn hơn 10 MB');
  let response;
  try {
    response = await fetch(`https://api.telegram.org/file/bot${decryptToken(config.encryptedToken)}/${info.file_path}`, { signal: AbortSignal.timeout(20000) });
  } catch { throw new Error('Không tải được ảnh từ Telegram'); }
  if (!response.ok || !response.body) throw new Error('Không tải được ảnh từ Telegram');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) { await response.body.cancel?.().catch(() => {}); throw new Error('Ảnh lớn hơn 10 MB'); }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const extension = imageExtension(buffer);
  const filename = `telegram-${conversationId}-${crypto.createHash('sha256').update(fileId).digest('hex').slice(0, 24)}${extension}`;
  const directory = path.resolve(__dirname, '../../uploads');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), buffer, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  return { url: `/uploads/${filename}`, uploadedAt: new Date() };
}

async function saveTelegramImages(config, state, admin, invokeController) {
  const { classId, kind, exerciseId, studentId } = state.payload;
  if (!await Class.exists({ _id: classId, students: studentId })) throw new Error('Học sinh không còn thuộc lớp đã chọn');
  const valid = kind === 'exam' ? await Exam.exists({ _id: exerciseId, 'classSchedules.class': classId }) : await Homework.exists({ _id: exerciseId, class: classId });
  if (!valid) throw new Error('Đề/bài tập không còn thuộc lớp đã chọn');
  const images = [];
  for (const fileId of state.files) images.push(await downloadImage(config, fileId, String(state._id)));
  const Model = kind === 'exam' ? ExamResult : HomeworkSubmission;
  const current = await Model.findOne({ [kind === 'exam' ? 'exam' : 'homework']: exerciseId, student: studentId });
  const byUrl = new Map([...(current?.submissionImages || []), ...images].map(image => [image.url, image]));
  const controller = kind === 'exam' ? require('../controllers/examController').adminSubmitExamImages : require('../controllers/homeworkController').adminSubmitHomework;
  await invokeController(controller, { user: admin, params: { id: exerciseId, studentId }, body: { studentId, submissionImages: [...byUrl.values()] } });
  return Model.findOne({ [kind === 'exam' ? 'exam' : 'homework']: exerciseId, student: studentId }).populate('student', 'name').populate(kind === 'exam' ? 'exam' : 'homework', 'title').populate('class', 'name');
}

module.exports = { saveTelegramImages, imageExtension };
