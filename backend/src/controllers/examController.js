const Exam = require('../models/Exam');
const ExamResult = require('../models/ExamResult');
const Homework = require('../models/Homework');
const Lesson = require('../models/Lesson');
const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');
const SiteSettings = require('../models/SiteSettings');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs/promises');
const path = require('path');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const IMAGE_MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

async function generateGeminiContent(content) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(content);
      return result.response.text().trim();
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini] ${modelName} failed: ${error.message}`);
    }
  }

  throw lastError || new Error('Không gọi được Gemini');
}

function clampScore(value, maxScore) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(numeric, 0), maxScore);
}

// Tự động sinh nhận xét dựa trên điểm từng mức độ (fallback)
function generateAutoFeedback(exam, scores) {
  const levelResults = exam.levels.map((level) => {
    const levelScores = scores.filter(
      (s) => s.questionOrder >= level.fromQuestion && s.questionOrder <= level.toQuestion
    );
    const actual = levelScores.reduce((sum, s) => sum + (s.score || 0), 0);
    const pct = level.totalPoints > 0 ? actual / level.totalPoints : 0;
    return { name: level.name, actual, max: level.totalPoints, pct };
  });

  const totalActual = levelResults.reduce((s, l) => s + l.actual, 0);
  const totalMax = levelResults.reduce((s, l) => s + l.max, 0);
  const overallPct = totalMax > 0 ? totalActual / totalMax : 0;

  let summary;
  if (overallPct >= 0.9) summary = 'Xuất sắc! Em nắm vững kiến thức và kỹ năng.';
  else if (overallPct >= 0.8) summary = 'Giỏi! Em làm bài rất tốt.';
  else if (overallPct >= 0.65) summary = 'Khá. Em cần luyện tập thêm một số dạng bài.';
  else if (overallPct >= 0.5) summary = 'Trung bình. Em cần ôn tập lại kiến thức.';
  else summary = 'Yếu. Em cần ôn tập toàn bộ nội dung bài học.';

  const details = levelResults.map((l) => {
    const pctStr = (l.pct * 100).toFixed(0) + '%';
    if (l.pct >= 0.9) return `✔ ${l.name}: Tốt (${pctStr} - ${l.actual}/${l.max} điểm)`;
    if (l.pct >= 0.6) return `~ ${l.name}: Cần củng cố thêm (${pctStr} - ${l.actual}/${l.max} điểm)`;
    return `✘ ${l.name}: Cần ôn luyện nhiều hơn (${pctStr} - ${l.actual}/${l.max} điểm)`;
  });

  return summary + '\n' + details.join('\n');
}

// Sinh nhận xét tự động bằng Gemini AI
async function generateAIFeedbackGemini(exam, student, scores, settings) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not set, using fallback feedback');
      return generateAutoFeedback(exam, scores);
    }
    // Tính điểm từng mức độ
    const levelResults = exam.levels.map((level) => {
      const levelScores = scores.filter(
        (s) => s.questionOrder >= level.fromQuestion && s.questionOrder <= level.toQuestion
      );
      const actual = levelScores.reduce((sum, s) => sum + (s.score || 0), 0);
      const max = level.totalPoints;
      const pct = max > 0 ? (actual / max * 100).toFixed(1) : 0;
      return {
        name: level.name,
        score: actual,
        maxScore: max,
        percentage: pct,
        questions: `${level.fromQuestion}-${level.toQuestion}`,
      };
    });

    const totalScore = levelResults.reduce((s, l) => s + l.score, 0);
    const totalMax = levelResults.reduce((s, l) => s + l.maxScore, 0);
    const overallPct = totalMax > 0 ? ((totalScore / totalMax) * 100).toFixed(1) : 0;

    // Xây dựng prompt chi tiết cho Gemini
    const prompt = `Bạn là một giáo viên dạy học đáng tin cậy. Hãy viết một nhận xét ngắn gọn (3-5 dòng) cho học sinh về kết quả kiểm tra của em.

Thông tin bài kiểm tra:
- Tên đề: ${exam.title}
- Chủ đề: ${exam.lesson?.title || 'Không xác định'}
- Tổng số câu: ${exam.totalQuestions}

Thông tin kết quả học sinh:
- Tên học sinh: ${student?.name || 'Học sinh'}
- Tổng điểm: ${totalScore.toFixed(2)}/${totalMax} (${overallPct}%)

Phân tích từng mức độ:
${levelResults.map(l => `- ${l.name}: ${l.score}/${l.maxScore} điểm (${l.percentage}%) - Câu ${l.questions}`).join('\n')}

Hướng dẫn viết nhận xét:
- Viết để cho Phụ huynh cũng có thể đọc được và hiểu được tình hình học tập của con mình.
- Gửi kết quả có số điểm, cụ thể mức độ nào làm tốt, mức độ nào cần cải thiện.
- Viết tự nhiên như giáo viên đang nhận xét trực tiếp.
- Chú ý các trường hợp đặc biệt:
   + Sai bài dễ nhưng đúng bài vừa hoặc khó → có thể do thiếu cẩn thận hoặc bỏ sót dữ kiện.
   + Đúng phần lý thuyết nhưng sai phần vận dụng → kiến thức nền tốt nhưng cần luyện áp dụng.
   + Đúng bài khó nhưng sai bài cơ bản → kiểm tra lại sự tập trung và cách đọc đề.
   + Làm đúng nhiều bài cùng dạng nhưng sai dạng mới → cần tăng khả năng linh hoạt.
- Chỉ nhận xét những điều có dữ liệu hỗ trợ, không suy đoán quá mức.
- kết hợp với tiêu chí được gán cho từng mức độ (nếu có) để đưa ra nhận xét chính xác hơn.
- Không viết dạng báo cáo khô cứng.
- Không dùng từ: yếu, kém, dở.
- Nêu điểm mạnh trước, sau đó góp ý cải thiện.
- Độ dài khoảng 50–80 từ.
- Dựa trên cài đặt mức độ khó của admin (nếu có) để đưa ra nhận xét phù hợp.
- Dùng từ thầy và con thông qua gọi tên học sinh để tạo sự gần gũi.
- Viết để cho Phụ huynh cũng có thể đọc được và hiểu được tình hình học tập của con mình.
- ví dụ : Kết quả học tập của con bài kiểm tra vừa rồi con được 8,5 điểm . Con nắm vững kiến thức
và kỹ năng ở mức độ Nhận biết và Thông hiểu, tuy nhiên con cần luyện tập thêm một số dạng bài ở mức độ Vận dụng cao để cải thiện hơn nữa.

Viết bằng tiếng Việt, lời lẽ thân thiện, phù hợp với học sinh.`;

    return await generateGeminiContent(prompt);
  } catch (error) {
    console.error('Gemini API error:', error.message);
    // Fallback to simple feedback
    return generateAutoFeedback(exam, scores);
  }
}

// Hàm dùng chung: gọi Gemini với fallback pro -> flash -> flash-lite
async function callGemini(prompt) {
  return generateGeminiContent(prompt);
}

// Chuẩn hoá JSON từ response Gemini (bỏ markdown fences, tìm {...})
function extractJSON(text) {
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e !== -1) text = text.substring(s, e + 1);
  return text;
}

async function uploadImageToGeminiPart(image) {
  const rawUrl = typeof image === 'string' ? image : image?.url;
  if (!rawUrl) return null;

  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl, 'http://local').pathname;
  } catch {
    pathname = rawUrl;
  }

  if (!pathname.startsWith('/uploads/')) {
    throw new Error(`Image is not in uploads: ${rawUrl}`);
  }

  const relativePath = decodeURIComponent(pathname.replace(/^\/uploads\//, ''));
  const filePath = path.resolve(UPLOADS_DIR, relativePath);
  if (!filePath.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error('Invalid image path');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new Error(`Unsupported image type: ${ext}`);
  }

  const data = await fs.readFile(filePath);
  return {
    inlineData: {
      data: data.toString('base64'),
      mimeType,
    },
  };
}

async function buildImageParts(images) {
  const parts = [];
  for (const image of images || []) {
    const part = await uploadImageToGeminiPart(image);
    if (part) parts.push(part);
  }
  return parts;
}

function examPackageToText(examPackage) {
  if (!examPackage) return '';
  const mc = (examPackage.questions?.multipleChoice || []).map((q, i) => {
    const options = ['A', 'B', 'C', 'D'].map(key => `${key}. ${q.options?.[key] || ''}`).join('\n');
    return `Câu ${q.number || i + 1}. ${q.question || ''}\n${options}`;
  });
  const essay = (examPackage.questions?.essay || []).map((q, i) => {
    return `Bài ${i + 1}. ${q.question || ''}`;
  });
  const answer = [
    ...(examPackage.questions?.multipleChoice || []).map((q, i) => `Câu ${q.number || i + 1}: ${q.answer || ''}`),
    ...(examPackage.questions?.essay || []).map((q, i) => `Bài ${i + 1}: ${q.solution || ''}`),
  ];
  return [
    examPackage.title || '',
    mc.length ? 'I. Trắc nghiệm\n' + mc.join('\n\n') : '',
    essay.length ? 'II. Tự luận\n' + essay.join('\n\n') : '',
    answer.length ? 'Đáp án tham khảo\n' + answer.join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

function examPackageToHomeworkText(examPackage) {
  if (!examPackage) return '';
  const hasQuestions = Boolean(
    (examPackage.questions?.multipleChoice || []).length ||
    (examPackage.questions?.essay || []).length
  );
  if (!hasQuestions) return '';
  const mc = (examPackage.questions?.multipleChoice || []).map((q, i) => {
    const options = ['A', 'B', 'C', 'D'].map(key => `${key}. ${q.options?.[key] || ''}`).join('\n');
    return `Cau ${q.number || i + 1}. ${q.question || ''}\n${options}`;
  });
  const essay = (examPackage.questions?.essay || []).map((q, i) => `Bai ${i + 1}. ${q.question || ''}`);
  return [
    examPackage.title || '',
    mc.length ? 'I. Trac nghiem\n' + mc.join('\n\n') : '',
    essay.length ? 'II. Tu luan\n' + essay.join('\n\n') : '',
  ].filter(Boolean).join('\n\n');
}

function examPackageToAnswerKey(examPackage) {
  if (!examPackage) return '';
  return [
    ...(examPackage.questions?.multipleChoice || []).map((q, i) => `Cau ${q.number || i + 1}: ${q.answer || ''}`),
    ...(examPackage.questions?.essay || []).map((q, i) => `Bai ${i + 1}: ${q.solution || ''}`),
  ].filter(Boolean).join('\n');
}

function maxScoreForQuestion(exam, questionOrder) {
  const mc = exam.examPackage?.questions?.multipleChoice || [];
  const essay = exam.examPackage?.questions?.essay || [];
  if (mc.length || essay.length) {
    if (questionOrder <= mc.length) return Number(mc[questionOrder - 1]?.points) || 0;
    return Number(essay[questionOrder - mc.length - 1]?.points) || 0;
  }

  if (exam.examPackage?.matrix?.length) {
    const levels = exam.examPackage.cognitiveLevels || [];
    let cursor = 1;
    for (const row of exam.examPackage.matrix) {
      for (const level of levels) {
        for (const type of ['tn', 'tl']) {
          const cell = row[type]?.[level.key || level.name];
          const count = Number(cell?.count) || 0;
          const pointEach = count > 0 ? (Number(cell?.points) || 0) / count : 0;
          if (questionOrder >= cursor && questionOrder < cursor + count) return pointEach;
          cursor += count;
        }
      }
    }
  }

  const level = (exam.levels || []).find((l) => questionOrder >= l.fromQuestion && questionOrder <= l.toQuestion);
  if (!level) return 0;
  const count = level.toQuestion - level.fromQuestion + 1;
  return count > 0 ? level.totalPoints / count : 0;
}

function maxScoreForExam(exam) {
  if (exam.examPackage?.totals?.totalPoints) return Number(exam.examPackage.totals.totalPoints) || 0;
  const fromQuestions = [
    ...(exam.examPackage?.questions?.multipleChoice || []),
    ...(exam.examPackage?.questions?.essay || []),
  ].reduce((sum, question) => sum + (Number(question.points) || 0), 0);
  if (fromQuestions > 0) return Number(fromQuestions.toFixed(2));
  return (exam.levels || []).reduce((sum, level) => sum + (Number(level.totalPoints) || 0), 0);
}

function examDueDateForClass(exam, classId) {
  const schedule = (exam.classSchedules || []).find((item) => {
    const scheduleClassId = item.class?._id || item.class;
    return String(scheduleClassId) === String(classId);
  });
  return schedule?.endDate || undefined;
}

async function syncSourceExamHomeworks(exam) {
  const linkedHomeworks = await Homework.find({ sourceExam: exam._id });
  if (!linkedHomeworks.length) return;

  await Promise.all(linkedHomeworks.map(async (homework) => {
    homework.title = exam.title;
    homework.description = examPackageToHomeworkText(exam.examPackage) || exam.content || exam.title;
    homework.examPackage = exam.examPackage || null;
    homework.pdfAttachments = exam.pdfAttachments || [];
    homework.answerKey = examPackageToAnswerKey(exam.examPackage);
    homework.maxScore = maxScoreForExam(exam) || homework.maxScore || 10;
    if (exam.lesson) homework.lesson = exam.lesson?._id || exam.lesson;
    homework.dueDate = examDueDateForClass(exam, homework.class) || homework.dueDate;
    await homework.save({ validateBeforeSave: false });
  }));
}

function pickClassForStudent(exam, studentId) {
  return (exam.classSchedules || []).find((schedule) => {
    const cls = schedule.class;
    const students = cls?.students || [];
    return students.some((student) => String(student?._id || student) === String(studentId));
  })?.class?._id || (exam.classSchedules || []).find((schedule) => schedule.class)?.class?._id || undefined;
}

function normalizeExamForAdmin(examDoc) {
  const exam = examDoc.toObject ? examDoc.toObject() : examDoc;
  const firstSchedule = (exam.classSchedules || []).find((schedule) => schedule.class) || null;
  return {
    ...exam,
    class: firstSchedule?.class || null,
    startDate: firstSchedule?.startDate || null,
    endDate: firstSchedule?.endDate || null,
  };
}

// GET /api/exams
const getExams = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter['classSchedules.class'] = req.query.classId;
    if (req.query.lessonId) filter.lesson = req.query.lessonId;
    if (req.query.levelId) filter.level = req.query.levelId;
    if (req.query.isTemplate === 'true') filter.isTemplate = true;
    if (req.query.isTemplate === 'false') filter.isTemplate = false;

    const exams = await Exam.find(filter)
      .populate('course', 'title')
      .populate('lesson', 'title criteria course')
      .populate('classSchedules.class', 'name')
      .populate('level', 'name bgColor textColor')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json(exams.map(normalizeExamForAdmin));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exams/:id
const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('course', 'title')
      .populate('lesson', 'title criteria course')
      .populate('classSchedules.class', 'name students')
      .populate('level', 'name bgColor textColor')
      .populate('createdBy', 'name');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });
    res.json(normalizeExamForAdmin(exam));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams
const createExam = async (req, res) => {
  try {
    console.log('[createExam] classSchedules received:', JSON.stringify(req.body.classSchedules));
    const allowed = ['title', 'content', 'course', 'lesson', 'level', 'totalQuestions', 'isTemplate', 'note', 'pdfAttachments', 'levels', 'classSchedules', 'examPackage'];
    const data = {};
    allowed.forEach(field => { if (field in req.body) data[field] = req.body[field]; });
    data.createdBy = req.user._id;
    const exam = await Exam.create(data);
    res.status(201).json(exam);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/exams/:id
const updateExam = async (req, res) => {
  try {
    console.log('[updateExam] classSchedules received:', JSON.stringify(req.body.classSchedules));
    const allowed = ['title', 'content', 'course', 'lesson', 'level', 'totalQuestions', 'isTemplate', 'note', 'pdfAttachments', 'levels', 'classSchedules', 'examPackage'];
    const $set = {};
    allowed.forEach(field => {
      if (field in req.body) $set[field] = req.body[field];
    });

    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      { $set },
      { new: true, runValidators: false }
    )
      .populate('course', 'title')
      .populate('lesson', 'title criteria course')
      .populate('classSchedules.class', 'name')
      .populate('level', 'name bgColor textColor');

    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });
    await syncSourceExamHomeworks(exam);
    res.json(exam);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/exams/:id
const deleteExam = async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    await ExamResult.deleteMany({ exam: req.params.id });
    res.json({ message: 'Đã xóa đề kiểm tra' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exams/:id/results  (lấy kết quả của tất cả học sinh)
const getExamResults = async (req, res) => {
  try {
    const results = await ExamResult.find({ exam: req.params.id })
      .populate('student', 'name email')
      .populate('gradedBy', 'name')
      .sort({ createdAt: 1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams/:id/results  (chấm điểm / cập nhật kết quả)
const saveExamResult = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('lesson', 'title');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    const { studentId, scores, teacherNote } = req.body;
    if (!studentId) return res.status(400).json({ message: 'Thiếu studentId' });

    // Lấy thông tin học sinh từ User model
    const User = require('../models/User');
    const student = await User.findById(studentId).select('name email');

    const normalizedScores = [];
    for (let q = 1; q <= exam.totalQuestions; q += 1) {
      const found = (scores || []).find((score) => Number(score.questionOrder) === q);
      normalizedScores.push({
        questionOrder: q,
        score: clampScore(found?.score ?? 0, maxScoreForQuestion(exam, q)),
      });
    }
    const totalScore = normalizedScores.reduce((sum, s) => sum + (s.score || 0), 0);
    const maxScore = maxScoreForExam(exam);
    
    // Lấy cài đặt mức độ từ admin
    const settings = await SiteSettings.findOne({ key: 'default' });
    
    // Sinh nhận xét AI
    const autoFeedback = await generateAIFeedbackGemini(exam, student, normalizedScores, settings);

    const result = await ExamResult.findOneAndUpdate(
      { exam: req.params.id, student: studentId },
      {
        $set: {
          class: (() => {
            // Tìm lớp học mà học sinh thuộc vào trong danh sách classSchedules
            const s = (exam.classSchedules || []).find(s => s.class);
            return s ? s.class : undefined;
          })(),
          scores: normalizedScores,
          totalScore,
          maxScore,
          autoFeedback,
          teacherNote: teacherNote || '',
          gradedBy: req.user._id,
          gradedAt: new Date(),
          status: 'graded',
        },
        $setOnInsert: {
          exam: req.params.id,
          student: studentId,
        },
      },
      { upsert: true, new: true, runValidators: true }
    )
      .populate('student', 'name email')
      .populate('gradedBy', 'name');

    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET /api/exams/:id/results/:studentId
const getStudentResult = async (req, res) => {
  try {
    const result = await ExamResult.findOne({ exam: req.params.id, student: req.params.studentId })
      .populate('student', 'name email')
      .populate('gradedBy', 'name');
    if (!result) return res.status(404).json({ message: 'Chưa có kết quả' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams/student/:id/submit - học sinh nộp ảnh bài làm
const adminSubmitExamImages = async (req, res) => {
  try {
    const { submissionImages } = req.body;
    const { studentId } = req.params;
    if (!Array.isArray(submissionImages)) {
      return res.status(400).json({ message: 'Danh sách ảnh không hợp lệ' });
    }

    const exam = await Exam.findById(req.params.id).populate('classSchedules.class', 'students');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    const normalizedImages = submissionImages
      .filter((img) => img?.url)
      .map((img) => ({ url: img.url, uploadedAt: img.uploadedAt || new Date() }));

    const result = await ExamResult.findOneAndUpdate(
      { exam: req.params.id, student: studentId },
      {
        $set: {
          class: pickClassForStudent(exam, studentId),
          submissionImages: normalizedImages,
          submittedAt: normalizedImages.length > 0 ? new Date() : undefined,
          status: 'pending',
        },
        $setOnInsert: {
          exam: req.params.id,
          student: studentId,
        },
      },
      { upsert: true, new: true, runValidators: false }
    )
      .populate('student', 'name email')
      .populate('gradedBy', 'name');

    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const aiGradeExamResult = async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ message: 'GEMINI_API_KEY chưa được cấu hình' });
    }

    const exam = await Exam.findById(req.params.id)
      .populate('lesson', 'title')
      .populate('classSchedules.class', 'students');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    const resultDoc = await ExamResult.findOne({ exam: req.params.id, student: req.params.studentId });
    if (!resultDoc || !resultDoc.submissionImages?.length) {
      return res.status(400).json({ message: 'Học sinh chưa có ảnh bài làm để AI chấm' });
    }

    const User = require('../models/User');
    const student = await User.findById(req.params.studentId).select('name email');
    const maxScore = maxScoreForExam(exam);
    const questionMaxScores = [];
    for (let q = 1; q <= exam.totalQuestions; q++) {
      questionMaxScores.push({ questionOrder: q, maxScore: +maxScoreForQuestion(exam, q).toFixed(2) });
    }

    const submissionParts = await buildImageParts(resultDoc.submissionImages);
    if (submissionParts.length === 0) {
      return res.status(400).json({ message: 'Không đọc được ảnh bài làm' });
    }

    const examText = examPackageToText(exam.examPackage) || exam.content || exam.title;
    const prompt = `Bạn là giáo viên Toán Việt Nam. Hãy chấm bài kiểm tra từ ảnh bài làm của học sinh.

Tên đề: ${exam.title}
Chủ đề/bài học: ${exam.lesson?.title || ''}
Học sinh: ${student?.name || 'Học sinh'}
Tổng điểm: ${maxScore}
Số câu: ${exam.totalQuestions}

Nội dung đề và đáp án/hướng dẫn chấm nếu có:
${examText}

Điểm tối đa từng câu:
${questionMaxScores.map((q) => `- Câu ${q.questionOrder}: ${q.maxScore}`).join('\n')}

Yêu cầu:
- Chỉ chấm dựa trên ảnh bài làm đính kèm.
- Nếu không thấy lời giải/câu trả lời của một câu, cho 0 điểm câu đó.
- Điểm mỗi câu không vượt quá điểm tối đa.
- Trả về JSON hợp lệ, không markdown, đúng format:
{"scores":[{"questionOrder":1,"score":0,"note":"nhận xét ngắn"}],"teacherNote":"nhận xét chung ngắn bằng tiếng Việt"}`;

    const responseText = await generateGeminiContent([prompt, ...submissionParts]);
    const parsed = JSON.parse(extractJSON(responseText));
    const scores = [];
    for (let q = 1; q <= exam.totalQuestions; q++) {
      const raw = (parsed.scores || []).find((s) => Number(s.questionOrder) === q);
      scores.push({ questionOrder: q, score: clampScore(raw?.score ?? 0, maxScoreForQuestion(exam, q)) });
    }

    const totalScore = scores.reduce((sum, s) => sum + (s.score || 0), 0);
    const saved = await ExamResult.findOneAndUpdate(
      { exam: req.params.id, student: req.params.studentId },
      {
        $set: {
          class: pickClassForStudent(exam, req.params.studentId),
          scores,
          totalScore,
          maxScore,
          autoFeedback: parsed.teacherNote || generateAutoFeedback(exam, scores),
          teacherNote: parsed.teacherNote || '',
          gradedBy: req.user._id,
          gradedAt: new Date(),
          status: 'graded',
        },
      },
      { new: true, runValidators: true }
    )
      .populate('student', 'name email')
      .populate('gradedBy', 'name');

    res.json(saved);
  } catch (err) {
    console.error('[Exam AI grade] error:', err.message);
    res.status(400).json({ message: err.message });
  }
};

const submitExamImages = async (req, res) => {
  try {
    const { imageUrls } = req.body;
    if (!Array.isArray(imageUrls) || imageUrls.length === 0)
      return res.status(400).json({ message: 'Không có ảnh được gửi lên' });

    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    // Tìm lịch của lớp mà học sinh đã đăng ký
    let myClassId = null;
    if (exam.classSchedules && exam.classSchedules.length > 0) {
      const classIds = exam.classSchedules.map(s => s.class);
      const enrollment = await ClassEnrollment.findOne({
        student: req.user._id,
        class: { $in: classIds },
        status: 'approved',
      });
      if (!enrollment) return res.status(403).json({ message: 'Bạn không có quyền nộp bài này' });
      myClassId = enrollment.class;

      // Kiểm tra thời gian theo lịch của lớp học sinh
      const schedule = exam.classSchedules.find(s => s.class.toString() === myClassId.toString());
      if (schedule) {
        const now = new Date();
        if (schedule.startDate && now < schedule.startDate)
          return res.status(403).json({ message: 'Đề kiểm tra chưa mở. Vui lòng chờ đến thời gian bắt đầu.' });
        if (schedule.endDate && now > schedule.endDate)
          return res.status(403).json({ message: 'Đã hết thời gian nộp bài.' });
      }
    }

    const images = imageUrls.map(url => ({ url, uploadedAt: new Date() }));

    let result = await ExamResult.findOne({ exam: req.params.id, student: req.user._id });
    if (result) {
      result.submissionImages = images;
      result.submittedAt = new Date();
      if (result.status !== 'graded') result.status = 'pending';
      await result.save();
    } else {
      result = await ExamResult.create({
        exam: req.params.id,
        student: req.user._id,
        class: myClassId,
        submissionImages: images,
        submittedAt: new Date(),
        status: 'pending',
      });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET /api/exams/student - học sinh xem danh sách đề của lớp mình
const getStudentExams = async (req, res) => {
  try {
    const enrollments = await ClassEnrollment.find({ student: req.user._id, status: 'approved' }).select('class');
    const classIds = enrollments.map(e => e.class);
    

    const exams = await Exam.find({ 'classSchedules.class': { $in: classIds } })
      .populate('lesson', 'title')
      .populate('classSchedules.class', 'name')
      .sort({ createdAt: -1 })
      .select('-content'); // không gửi nội dung ở danh sách

    const examIds = exams.map(e => e._id);
    const results = await ExamResult.find({ exam: { $in: examIds }, student: req.user._id })
      .select('exam totalScore maxScore status gradedAt createdAt')
      .lean();
    const resultMap = {};
    results.forEach(r => { resultMap[r.exam.toString()] = r; });

    const data = exams.map(e => {
      const examObj = e.toObject();
      // Inject lịch của lớp học sinh để frontend hiển thị đúng
      const mySchedule = examObj.classSchedules?.find(s =>
        classIds.some(id => id.toString() === (s.class?._id?.toString() || s.class?.toString()))
      );
      return {
        ...examObj,
        class: mySchedule?.class || null,
        startDate: mySchedule?.startDate || null,
        endDate: mySchedule?.endDate || null,
        myResult: resultMap[e._id.toString()] || null,
      };
    });
    
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exams/student/:id - học sinh xem chi tiết đề + điểm
const getStudentExamDetail = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('lesson', 'title')
      .populate('classSchedules.class', 'name');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    // Tìm lịch của lớp học sinh
    const enrollments = await ClassEnrollment.find({ student: req.user._id, status: 'approved' }).select('class');
    const myClassIds = enrollments.map(e => e.class.toString());
    const mySchedule = exam.classSchedules?.find(s =>
      myClassIds.includes(s.class?._id?.toString() || s.class?.toString())
    );

    if (exam.classSchedules?.length > 0 && !mySchedule)
      return res.status(403).json({ message: 'Bạn không có quyền xem đề này' });

    // Kiểm tra thời gian mở đề theo lịch lớp học sinh
    if (mySchedule) {
      const now = new Date();
      if (mySchedule.startDate && now < new Date(mySchedule.startDate)) {
        return res.status(403).json({
          message: 'Đề kiểm tra chưa mở.',
          startDate: mySchedule.startDate,
        });
      }
    }

    const result = await ExamResult.findOne({ exam: exam._id, student: req.user._id });
    res.json({
      ...exam.toObject(),
      class: mySchedule?.class || null,
      startDate: mySchedule?.startDate || null,
      endDate: mySchedule?.endDate || null,
      myResult: result ? result.toObject() : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams/:id/generate-practice  (admin only)
const generateSharedPractice = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('lesson', 'title');
    if (!exam) return res.status(404).json({ message: 'Không tìm thấy đề kiểm tra' });

    const results = await ExamResult.find({ exam: req.params.id, status: 'graded' });
    if (results.length === 0)
      return res.status(400).json({ message: 'Chưa có học sinh nào được chấm điểm' });

    // Tính điểm trung bình mỗi mức độ
    const levelStats = exam.levels.map(level => {
      const earnedList = results.map(r => {
        const ls = (r.scores || []).filter(
          s => s.questionOrder >= level.fromQuestion && s.questionOrder <= level.toQuestion
        );
        return ls.reduce((sum, s) => sum + (s.score || 0), 0);
      });
      const avg = earnedList.reduce((a, b) => a + b, 0) / results.length;
      const pct = level.totalPoints > 0 ? avg / level.totalPoints : 1;
      return { name: level.name, avg: +avg.toFixed(2), max: level.totalPoints, pct: +pct.toFixed(3) };
    });

    // Tính điểm trung bình mỗi câu
    const questionStats = [];
    for (let q = 1; q <= exam.totalQuestions; q++) {
      const qScores = results.map(r => {
        const s = (r.scores || []).find(sc => sc.questionOrder === q);
        return s ? s.score : 0;
      });
      const avg = qScores.reduce((a, b) => a + b, 0) / results.length;
      questionStats.push({ q, avg: +avg.toFixed(2) });
    }

    // Chỉ tạo câu ôn luyện cho các mức độ chưa đạt 100% trung bình
    const weakLevels = levelStats.filter(l => l.pct < 1.0);
    if (weakLevels.length === 0)
      return res.status(400).json({ message: 'Tất cả mức độ đều đạt điểm tối đa trung bình, không cần đề ôn tập' });

    const lessonTitle = exam.lesson?.title || exam.title;
    const prompt = `Bạn là giáo viên Toán. Hãy tạo bộ bài tập ôn luyện chung cho lớp dựa trên thống kê bài kiểm tra.

Bài kiểm tra: "${exam.title}" (chủ đề: ${lessonTitle})
Số học sinh đã chấm điểm: ${results.length}

Các mức độ cần ôn luyện (điểm trung bình chưa đạt tối đa):
${weakLevels.map(l => `- ${l.name}: TB ${l.avg}/${l.max} điểm (${(l.pct * 100).toFixed(0)}%)`).join('\n')}

Với mỗi mức độ, tạo đúng 3 câu hỏi tương tự bài kiểm tra, kèm gợi ý ngắn định hướng (không cho đáp án).

Trả về JSON hợp lệ (không có markdown), đúng format:
{"exercises":[{"level":"tên mức độ","questions":[{"q":"câu hỏi","hint":"gợi ý ngắn"}]}]}

Yêu cầu:
- Câu hỏi sát chủ đề: ${lessonTitle}, độ khó tương đương từng mức độ
- Viết bằng tiếng Việt, phù hợp học sinh`;

    const rawText = await callGemini(prompt);
    const text = extractJSON(rawText);
    const parsed = JSON.parse(text);
    if (!parsed.exercises || !Array.isArray(parsed.exercises))
      return res.status(500).json({ message: 'AI không trả về đúng định dạng' });

    parsed.generatedAt = new Date().toISOString();
    parsed.stats = { totalGraded: results.length, levelStats, questionStats };

    exam.sharedPractice = JSON.stringify(parsed);
    await exam.save();

    res.json({ sharedPractice: parsed });
  } catch (err) {
    console.error('[SharedPractice] error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getExams,
  getExamById,
  createExam,
  updateExam,
  deleteExam,
  getExamResults,
  saveExamResult,
  getStudentResult,
  adminSubmitExamImages,
  aiGradeExamResult,
  getStudentExams,
  getStudentExamDetail,
  submitExamImages,
  generateSharedPractice,
};
