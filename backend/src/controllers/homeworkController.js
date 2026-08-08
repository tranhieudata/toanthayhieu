const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Class = require('../models/Class');
const User = require('../models/User');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

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

function getParentPrintUrl(homework) {
  const token = homework?.printShareToken;
  return token ? `/print/homework/${token}` : '';
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
    examPackage.title || examPackage.meta?.examName || '',
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

function hasExamPackageQuestions(examPackage) {
  return Boolean(
    (examPackage?.questions?.multipleChoice || []).length ||
    (examPackage?.questions?.essay || []).length
  );
}

async function ensurePrintShareToken(homework) {
  if (!homework) return homework;
  let shouldSave = false;
  if (!homework.printShareToken || homework.$isDefault?.('printShareToken')) {
    homework.printShareToken = crypto.randomBytes(18).toString('hex');
    shouldSave = true;
  }
  if (homework.printShareEnabled === undefined || homework.$isDefault?.('printShareEnabled')) {
    homework.printShareEnabled = true;
    shouldSave = true;
  }
  if (shouldSave || homework.isModified?.('printShareToken') || homework.isModified?.('printShareEnabled')) {
    await homework.save();
  }
  return homework;
}

function withParentPrintUrl(homework) {
  const obj = homework?.toObject ? homework.toObject() : homework;
  if (!obj) return obj;
  const sourceExam = obj.sourceExam && typeof obj.sourceExam === 'object' ? obj.sourceExam : null;
  const hasSourceExamDetail = sourceExam && (
    sourceExam.content !== undefined ||
    sourceExam.examPackage !== undefined ||
    sourceExam.pdfAttachments !== undefined
  );
  const sourceExamPackage = hasSourceExamDetail && hasExamPackageQuestions(sourceExam.examPackage)
    ? sourceExam.examPackage
    : null;
  const sourceDescription = hasSourceExamDetail
    ? (examPackageToHomeworkText(sourceExamPackage) || sourceExam.content || obj.description)
    : obj.description;

  return {
    ...obj,
    title: sourceExam?.title || obj.title,
    description: sourceDescription,
    examPackage: sourceExamPackage || (hasExamPackageQuestions(obj.examPackage) ? obj.examPackage : null),
    answerKey: hasSourceExamDetail ? (examPackageToAnswerKey(sourceExamPackage) || obj.answerKey || '') : obj.answerKey,
    pdfAttachments: hasSourceExamDetail ? (sourceExam.pdfAttachments || []) : (obj.pdfAttachments || []),
    parentPrintUrl: getParentPrintUrl(obj),
  };
}

async function generateGeminiContent(content) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

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

  throw lastError || new Error('Could not call Gemini');
}

function clampScore(value, maxScore) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(Math.max(numeric, 0), maxScore);
}

function extractJSON(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI did not return valid JSON');
  }
  return JSON.parse(cleaned.substring(start, end + 1));
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

async function imageToDataUrl(image) {
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
  return `data:${mimeType};base64,${data.toString('base64')}`;
}

async function buildOpenAIImageContent(images) {
  const content = [];
  for (const image of images || []) {
    const dataUrl = await imageToDataUrl(image);
    if (dataUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }
  }
  return content;
}

async function callOpenAIWithImages(prompt, images, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY chưa được cấu hình');
  }

  if (typeof fetch !== 'function') {
    throw new Error('Node.js fetch is not available for OpenAI calls');
  }

  const imageContent = await buildOpenAIImageContent(images);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContent,
          ],
        },
      ],
      temperature: options.temperature ?? 0.2,
      response_format: options.json ? { type: 'json_object' } : undefined,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI request failed (${response.status})`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('OpenAI returned an empty response');
  }
  return text;
}

// Generate a reference answer with Gemini AI
async function generateAnswerKey(homework) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const imageParts = await buildImageParts([
      homework.questionImage,
      ...(homework.solutionImages || []),
    ].filter(img => img?.url));
    

    const prompt = `You are an experienced Vietnamese math teacher. Create a detailed reference solution for this homework.

Homework title: ${homework.title}
Homework description: ${homework.description || ''}
Attached images: homework question image first if available, then teacher solution/reference images if available. Use teacher solution images as the answer key when present.

Return only the reference solution text in Vietnamese.`;

    const answerKey = await generateGeminiContent([prompt, ...imageParts]);
    if (!answerKey) throw new Error('AI could not create a reference answer');
    return answerKey;
  } catch (error) {
    console.error('Generate answer key error:', error.message);
    throw error;
  }
}

// Grade a homework submission with Gemini AI
async function generateAIFeedbackGemini(homework, student, submissionImages, answerKey) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const questionImageParts = await buildImageParts([
      homework.questionImage,
      ...(homework.solutionImages || []),
    ].filter(img => img?.url));
    const submissionImageParts = await buildImageParts(submissionImages);

    if (submissionImageParts.length === 0) {
      throw new Error('No submission image found for AI grading');
    }
    

    const prompt = `You are a kind Vietnamese math teacher. Grade this homework from 0 to ${homework.maxScore}.

Homework title: ${homework.title}
Homework description: ${homework.description || ''}
Reference solution:
${answerKey}
Max score: ${homework.maxScore}
Student: ${student?.name || 'Hoc sinh'}

Attached images order: homework question image first if available, teacher solution/reference images next if available, then all student submission images. Grade ONLY from the student submission images.

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
      - ví dụ : Em chào C . Em gửi kết quả học tập của con bài kiểm tra vừa rồi con được 8,5 điểm . Con nắm vững kiến thức
      và kỹ năng ở mức độ Nhận biết và Thông hiểu, tuy nhiên con cần luyện tập thêm một số dạng bài ở mức độ Vận dụng cao để cải thiện hơn nữa.

      Viết bằng tiếng Việt, lời lẽ thân thiện, phù hợp với học sinh

Return valid JSON only:
{"score": <number from 0 to ${homework.maxScore}>, "feedback": "<Vietnamese feedback>"}`;

    const responseText = await generateGeminiContent([prompt, ...questionImageParts, ...submissionImageParts]);

    const parsed = extractJSON(responseText);
    const finalScore = clampScore(parsed.score, homework.maxScore);
    if (finalScore === null) {
      throw new Error('AI returned an invalid score');
    }

    const finalFeedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '';
    if (!finalFeedback) {
      throw new Error('AI returned empty feedback');
    }

    return { score: finalScore, feedback: finalFeedback };
  } catch (error) {
    console.error('Gemini AI feedback error:', error.message);
    throw error;
  }
}

async function generateAnswerKeyChatGPT(homework) {
  const prompt = `You are an experienced Vietnamese math teacher. Create a detailed reference solution for this homework.

Homework title: ${homework.title}
Homework description: ${homework.description || ''}
Attached images: homework question image first if available, then teacher solution/reference images if available. Use teacher solution images as the answer key when present.

Return only the reference solution text in Vietnamese.`;
  
  const answerKey = await callOpenAIWithImages(prompt, [
    homework.questionImage,
    ...(homework.solutionImages || []),
  ].filter(img => img?.url));
    if (!answerKey) throw new Error('AI could not create a reference answer');
  return answerKey;
}

async function generateAIFeedbackChatGPT(homework, student, submissionImages, answerKey) {
  const submissionImageContent = await buildOpenAIImageContent(submissionImages);
  if (submissionImageContent.length === 0) {
    throw new Error('Bài làm chưa có ảnh để AI chấm');
  }
  

  const prompt = `You are a kind Vietnamese math teacher. Grade this homework from 0 to ${homework.maxScore}.

Homework title: ${homework.title}
Homework description: ${homework.description || ''}
Reference solution:
${answerKey}
Max score: ${homework.maxScore}
Student: ${student?.name || 'Hoc sinh'}

Attached images order: homework question image first if available, teacher solution/reference images next if available, then all student submission images. Grade from the student submission images.

Feedback requirements:
- Vietnamese.
- Positive and encouraging.
- Mention strengths first.
- Then mention weak points that need improvement and what to practice next.
- Keep it concise, about 2-4 sentences.

Return valid JSON only:
{"score": <number from 0 to ${homework.maxScore}>, "feedback": "<Vietnamese feedback>"}`;

  const responseText = await callOpenAIWithImages(
    prompt,
    [homework.questionImage, ...(homework.solutionImages || []), ...(submissionImages || [])].filter(img => img?.url),
    { json: true }
  );
  const parsed = extractJSON(responseText);
  const finalScore = clampScore(parsed.score, homework.maxScore);
  if (finalScore === null) {
    throw new Error('ChatGPT returned an invalid score');
  }

  const finalFeedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '';
  if (!finalFeedback) {
    throw new Error('ChatGPT returned empty feedback');
  }

  return { score: finalScore, feedback: finalFeedback };
}

async function generateAnswerKeyByModel(homework, aiModel) {
  if (aiModel === 'chatgpt') return generateAnswerKeyChatGPT(homework);
  return generateAnswerKey(homework);
}

async function generateAIFeedbackByModel(homework, student, submissionImages, answerKey, aiModel) {
  if (aiModel === 'chatgpt') {
    return generateAIFeedbackChatGPT(homework, student, submissionImages, answerKey);
  }
  return generateAIFeedbackGemini(homework, student, submissionImages, answerKey);
}

async function gradeHomeworkSubmission({ homework, submission, student, graderId, aiModel, score, feedback }) {
  let finalScore = score;
  let finalFeedback = feedback;
  let usedAI = false;
  const selectedAiModel = aiModel || 'manual';

  if (!['manual', 'gemini', 'chatgpt'].includes(selectedAiModel)) {
    const err = new Error('AI model không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  if (selectedAiModel !== 'manual') {
    if (!submission.submissionImages || submission.submissionImages.length === 0) {
      const err = new Error('Bài làm chưa có ảnh để AI chấm');
      err.statusCode = 400;
      throw err;
    }

    if (!homework.answerKey || homework.answerKey.trim() === '') {
      const generatedAnswerKey = await generateAnswerKeyByModel(homework, selectedAiModel);

      if (generatedAnswerKey) {
        homework.answerKey = generatedAnswerKey;
        homework.answerKeyGeneratedBy = selectedAiModel;
        homework.answerKeyGeneratedAt = new Date();
        await homework.save();
      }
    }

    const aiResult = await generateAIFeedbackByModel(
      homework,
      student,
      submission.submissionImages,
      homework.answerKey || 'No reference answer',
      selectedAiModel
    );

    finalScore = aiResult.score !== undefined ? aiResult.score : score;
    finalFeedback = aiResult.feedback || feedback;
    usedAI = true;
  } else {
    finalScore = clampScore(score, homework.maxScore);
    if (finalScore === null || Number(score) !== finalScore) {
      const err = new Error(`Điểm phải từ 0-${homework.maxScore}`);
      err.statusCode = 400;
      throw err;
    }
    finalFeedback = typeof feedback === 'string' ? feedback : '';
  }

  submission.score = finalScore;
  submission.maxScore = homework.maxScore;
  submission.feedback = finalFeedback;
  submission.gradedBy = graderId;
  submission.gradedAt = new Date();
  submission.status = 'graded';
  submission.aiModel = selectedAiModel;

  await submission.save();
  await submission.populate('student', 'name email');
  await submission.populate('gradedBy', 'name');

  return {
    ...submission.toObject(),
    aiUsed: usedAI
  };
}

// GET /api/homeworks/student/list - Get homeworks for the current student
const getStudentHomeworks = async (req, res) => {
  try {
    const studentId = req.user._id;
    
    // Find all enrolled classes for this student
    const ClassEnrollment = require('../models/ClassEnrollment');
    const enrollments = await ClassEnrollment.find({ student: studentId }).select('class');
    const classIds = enrollments.map(e => e.class);
    
   

    // Get all published homeworks for those classes
    const homeworks = await Homework.find({ class: { $in: classIds }, isPublished: true })
      .populate('class', 'name')
      .populate('lesson', 'title')
      .populate('sourceExam', 'title content examPackage pdfAttachments')
      .sort({ createdAt: -1 });
    
  

    for (const homework of homeworks) await ensurePrintShareToken(homework);
    res.json(homeworks.map(withParentPrintUrl));
  } catch (err) {
    console.error('Get student homeworks error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/homeworks - Lấy tất cả bài tập về nhà
const getHomeworks = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.class = req.query.classId;
    if (req.query.lessonId) filter.lesson = req.query.lessonId;
    if (req.query.sourceExam) filter.sourceExam = req.query.sourceExam;

    const homeworks = await Homework.find(filter)
      .populate('class', 'name')
      .populate('lesson', 'title')
      .populate('sourceExam', 'title content examPackage pdfAttachments')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    for (const homework of homeworks) await ensurePrintShareToken(homework);
    res.json(homeworks.map(withParentPrintUrl));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/homeworks/:id - Get homework detail
const getHomeworkById = async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id)
      .populate('class', 'name students')
      .populate('lesson', 'title')
      .populate('sourceExam', 'title content examPackage pdfAttachments')
      .populate('createdBy', 'name');
    
    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    await ensurePrintShareToken(homework);
    res.json(withParentPrintUrl(homework));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/homeworks - Create homework
const createHomework = async (req, res) => {
  try {
    const { title, description, classId, lessonId, questionImage, answerKey, maxScore, dueDate, sourceExam, examPackage, pdfAttachments, solutionImages, solutionPdfAttachments } = req.body;

    if (!title || !classId || (!questionImage?.url && !description?.trim() && !sourceExam && !pdfAttachments?.length)) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (title, classId và đề bài)' });
    }

    const homework = new Homework({
      title,
      description,
      class: classId,
      lesson: lessonId && lessonId.trim() ? lessonId : undefined, // Convert empty string to undefined
      questionImage: questionImage?.url ? questionImage : { url: '' },
      sourceExam: sourceExam || undefined,
      examPackage: examPackage || null,
      pdfAttachments: Array.isArray(pdfAttachments) ? pdfAttachments : [],
      solutionImages: Array.isArray(solutionImages) ? solutionImages : [],
      solutionPdfAttachments: Array.isArray(solutionPdfAttachments) ? solutionPdfAttachments : [],
      answerKey,
      maxScore: maxScore || 10,
      createdBy: req.user._id,
      dueDate,
      isPublished: true,
    });

    await homework.save();
    await ensurePrintShareToken(homework);
  
    await homework.populate('class', 'name');
    await homework.populate('lesson', 'title');
    await homework.populate('sourceExam', 'title content examPackage pdfAttachments');
    
    res.status(201).json(withParentPrintUrl(homework));
  } catch (err) {
    console.error('Homework creation error:', err);
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/homeworks/:id - Cập nhật bài tập
const updateHomework = async (req, res) => {
  try {
    const allowed = ['title', 'description', 'classId', 'lessonId', 'questionImage', 'answerKey', 'maxScore', 'dueDate', 'isPublished', 'sourceExam', 'examPackage', 'pdfAttachments', 'solutionImages', 'solutionPdfAttachments'];
    const $set = {};
    
    allowed.forEach(field => {
      if (field in req.body) {
        if (field === 'lessonId') {
          // Convert empty string to undefined/null for optional lesson field
          $set['lesson'] = req.body[field] && req.body[field].trim() ? req.body[field] : null;
        } else if (field === 'classId') {
          $set['class'] = req.body[field];
        } else if (field === 'sourceExam') {
          $set.sourceExam = req.body[field] || null;
        } else {
          $set[field] = req.body[field];
        }
      }
    });

    const homework = await Homework.findByIdAndUpdate(
      req.params.id,
      { $set },
      { new: true, runValidators: false }
    )
      .populate('class', 'name')
      .populate('lesson', 'title')
      .populate('sourceExam', 'title content examPackage pdfAttachments');

    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    await ensurePrintShareToken(homework);
    res.json(withParentPrintUrl(homework));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET /api/homeworks/public-print/:token - Public parent print link
const getPublicHomeworkPrintByToken = async (req, res) => {
  try {
    const homework = await Homework.findOne({ printShareToken: req.params.token })
      .populate('class', 'name')
      .populate('lesson', 'title')
      .populate('sourceExam', 'title content examPackage pdfAttachments');

    if (!homework || homework.printShareEnabled === false) {
      return res.status(404).json({ message: 'Link bài tập không tồn tại hoặc đã bị tắt' });
    }

    const sourceExam = homework.sourceExam?.examPackage !== undefined ? homework.sourceExam : null;
    const sourceExamObj = sourceExam?.toObject ? sourceExam.toObject() : sourceExam;
    const sourceExamPackage = hasExamPackageQuestions(sourceExamObj?.examPackage) ? sourceExamObj.examPackage : null;
    const homeworkPackage = hasExamPackageQuestions(homework.examPackage) ? homework.examPackage : null;

    res.json({
      title: sourceExamObj?.title || homework.title,
      description: sourceExamObj
        ? (examPackageToHomeworkText(sourceExamPackage) || sourceExamObj.content || homework.description)
        : (examPackageToHomeworkText(homeworkPackage) || homework.description),
      class: homework.class,
      lesson: homework.lesson,
      sourceExam: sourceExamObj ? { _id: sourceExamObj._id, title: sourceExamObj.title } : homework.sourceExam,
      examPackage: sourceExamPackage || homeworkPackage || null,
      dueDate: homework.dueDate,
      pdfAttachments: sourceExamObj ? (sourceExamObj.pdfAttachments || []) : (homework.pdfAttachments || []),
      parentPrintUrl: getParentPrintUrl(homework),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/homeworks/:id - Xóa bài tập
const deleteHomework = async (req, res) => {
  try {
    await Homework.findByIdAndDelete(req.params.id);
    await HomeworkSubmission.deleteMany({ homework: req.params.id });
    res.json({ message: 'Đã xóa bài tập' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/homeworks/:id/submissions - Get submissions for a homework
const getHomeworkSubmissions = async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id).populate('class', 'name');
    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    const submissions = await HomeworkSubmission.find({ homework: req.params.id })
      .populate('student', 'name email')
      .populate('gradedBy', 'name')
      .sort({ createdAt: 1 });

    res.json(submissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/homeworks/:id/my-submission - Get current student submission
const getStudentSubmission = async (req, res) => {
  try {
    const homeworkId = req.params.id;
    const studentId = req.user._id;
    
    const submission = await HomeworkSubmission.findOne({
      homework: homeworkId,
      student: studentId
    })
      .populate('homework')
      .populate('student', 'name email')
      .populate('gradedBy', 'name');

    if (!submission) {
      return res.status(404).json({ message: 'Không tìm thấy bài làm' });
    }

    res.json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/homeworks/:id/submissions - Tạo hoặc cập nhật bài làm
const submitHomework = async (req, res) => {
  try {
    const { id: homeworkId } = req.params;
    const { submissionImages } = req.body;
    const studentId = req.user._id;

    const homework = await Homework.findById(homeworkId);
    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    if (!Array.isArray(submissionImages)) {
      return res.status(400).json({ message: 'Danh sách ảnh không hợp lệ' });
    }

    const existingSubmission = await HomeworkSubmission.findOne({
      homework: homeworkId,
      student: studentId
    });

    if (!existingSubmission && submissionImages.length === 0) {
      return res.status(400).json({ message: 'Cần ít nhất một ảnh' });
    }

    const submission = await HomeworkSubmission.findOneAndUpdate(
      { homework: homeworkId, student: studentId },
      {
        $set: {
          submissionImages,
          submittedAt: new Date(),
          status: 'pending',
          class: homework.class,
        }
      },
      { new: true, upsert: true, runValidators: false }
    )
      .populate('homework')
      .populate('student', 'name email')
      .populate('gradedBy', 'name');

    res.json(submission);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// POST /api/homeworks/:id/submissions/:studentId/grade - Grade a homework submission
const gradeSubmission = async (req, res) => {
  try {
    const { id: homeworkId, studentId } = req.params;
    const { score, feedback, aiModel } = req.body;
  

    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    let submission = await HomeworkSubmission.findOne({
      homework: homeworkId,
      student: studentId
    });

    if (!submission) {
      if ((aiModel || 'manual') !== 'manual') {
        return res.status(404).json({ message: 'Không tìm thấy bài làm' });
      }

      submission = await HomeworkSubmission.create({
        homework: homeworkId,
        student: studentId,
        class: homework.class,
        submissionImages: [],
        submittedAt: new Date(),
        status: 'pending',
      });
    }

    const student = await User.findById(studentId);
    const gradedSubmission = await gradeHomeworkSubmission({
      homework,
      submission,
      student,
      graderId: req.user._id,
      aiModel,
      score,
      feedback,
    });

    res.json(gradedSubmission);
  } catch (err) {
    console.error('Grade submission error:', err);
    res.status(err.statusCode || 400).json({ message: err.message });
  }
};

// POST /api/homeworks/:id/submissions/bulk-grade - Grade all submitted class homework with AI
const bulkGradeSubmissions = async (req, res) => {
  try {
    const { id: homeworkId } = req.params;
    const { aiModel = 'gemini', onlyPending = true, studentIds } = req.body;

    if (!['gemini', 'chatgpt'].includes(aiModel)) {
      return res.status(400).json({ message: 'Chấm hàng loạt chỉ hỗ trợ Gemini hoặc ChatGPT' });
    }

    const homework = await Homework.findById(homeworkId).populate('class', 'students');
    if (!homework) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    const classStudentIds = (homework.class?.students || []).map(id => id.toString());
    const requestedStudentIds = Array.isArray(studentIds) && studentIds.length > 0
      ? studentIds.map(id => id.toString()).filter(id => classStudentIds.includes(id))
      : classStudentIds;

    const filter = {
      homework: homeworkId,
      student: { $in: requestedStudentIds },
      submissionImages: { $exists: true, $ne: [] },
    };
    if (onlyPending) filter.status = { $ne: 'graded' };

    const submissions = await HomeworkSubmission.find(filter)
      .populate('student', 'name email')
      .sort({ createdAt: 1 });

    const results = [];
    let graded = 0;
    let failed = 0;

    for (const submission of submissions) {
      try {
        const gradedSubmission = await gradeHomeworkSubmission({
          homework,
          submission,
          student: submission.student,
          graderId: req.user._id,
          aiModel,
        });

        graded += 1;
        results.push({
          studentId: submission.student?._id || submission.student,
          studentName: submission.student?.name || '',
          status: 'graded',
          score: gradedSubmission.score,
          maxScore: gradedSubmission.maxScore,
        });
      } catch (error) {
        failed += 1;
        results.push({
          studentId: submission.student?._id || submission.student,
          studentName: submission.student?.name || '',
          status: 'failed',
          message: error.message,
        });
      }
    }

    const submissionsWithImagesCount = await HomeworkSubmission.countDocuments({
      homework: homeworkId,
      student: { $in: requestedStudentIds },
      submissionImages: { $exists: true, $ne: [] },
    });
    const skipped = Math.max(submissionsWithImagesCount - submissions.length, 0);

    res.json({
      message: `Đã chấm ${graded} bài làm`,
      totalStudents: requestedStudentIds.length,
      submittedWithImages: submissionsWithImagesCount,
      processed: submissions.length,
      graded,
      failed,
      skipped,
      onlyPending,
      aiModel,
      results,
    });
  } catch (err) {
    console.error('Bulk grade submissions error:', err);
    res.status(400).json({ message: err.message });
  }
};

// GET /api/homeworks/:id/class-students - Get class students
const getClassStudents = async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id).populate({
      path: 'class',
      populate: {
        path: 'students',
        select: '_id name email avatar'
      }
    });
    
    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    // Get students from populated class
    const students = homework.class?.students || [];
    
    // Lấy danh sách submissions 
    const submissions = await HomeworkSubmission.find({ homework: req.params.id })
      .populate('student', '_id name email')
      .populate('gradedBy', 'name');

    const submissionMap = {};
    submissions.forEach(sub => {
      const studentId = sub.student?._id?.toString() || sub.student?.toString();
      submissionMap[studentId] = sub;
    });

    // Gắn submission info cho từng student
    const studentsWithInfo = students.map(student => {
      const studentId = student._id?.toString();
      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        avatar: student.avatar
      };
    });

    res.json(studentsWithInfo);
  } catch (err) {
    console.error('Get class students error:', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/homeworks/:id/submissions/admin-submit - Admin submit bài làm cho học sinh
const adminSubmitHomework = async (req, res) => {
  try {
    const { studentId, submissionImages } = req.body;
    
    if (!studentId || !Array.isArray(submissionImages)) {
      return res.status(400).json({ message: 'Cần studentId và danh sách ảnh hợp lệ' });
    }

    const homework = await Homework.findById(req.params.id);
    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    // Tạo hoặc cập nhật submission
    const submission = await HomeworkSubmission.findOneAndUpdate(
      { homework: req.params.id, student: studentId },
      {
        $set: {
          submissionImages,
          submittedAt: new Date(),
          status: 'pending',
          class: homework.class,
        }
      },
      { new: true, upsert: true, runValidators: false }
    )
      .populate('student', 'name email')
      .populate('homework', 'title maxScore');

    res.json(submission);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// POST /api/homeworks/:id/auto-create-submissions - Auto-create submissions for all class students
const autoCreateSubmissions = async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id).populate('class', 'students');
    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });

    const classData = homework.class;
    const studentIds = classData?.students || [];

    // Tạo submission cho tất cả học sinh chưa có
    const created = [];
    for (const studentId of studentIds) {
      const existing = await HomeworkSubmission.findOne({
        homework: req.params.id,
        student: studentId
      });

      if (!existing) {
        const submission = new HomeworkSubmission({
          homework: req.params.id,
          student: studentId,
          class: homework.class._id,
          status: 'pending'
        });
        await submission.save();
        created.push(submission);
      }
    }

    res.json({ message: `Đã tạo ${created.length} bài làm`, created });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getStudentHomeworks,
  getPublicHomeworkPrintByToken,
  getHomeworks,
  getHomeworkById,
  createHomework,
  updateHomework,
  deleteHomework,
  getHomeworkSubmissions,
  getStudentSubmission,
  submitHomework,
  gradeSubmission,
  bulkGradeSubmissions,
  getClassStudents,
  adminSubmitHomework,
  autoCreateSubmissions,
};
