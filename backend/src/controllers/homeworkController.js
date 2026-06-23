const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Class = require('../models/Class');
const User = require('../models/User');
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const imageParts = await buildImageParts(homework.questionImage ? [homework.questionImage] : []);
    

    const prompt = `You are an experienced Vietnamese math teacher. Create a detailed reference solution for this homework.

Homework title: ${homework.title}
Homework description: ${homework.description || ''}
The attached image is the homework question. Use the image as the main source if the text description is incomplete.

Return only the reference solution text in Vietnamese.`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const answerKey = result.response.text().trim();
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const questionImageParts = await buildImageParts(homework.questionImage ? [homework.questionImage] : []);
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

Attached images order: homework question image first if available, then all student submission images. Grade ONLY from the student submission images.

Feedback requirements:
- Vietnamese.
- Positive and encouraging.
- Mention strengths first.
- Then mention weak points that need improvement and what to practice next.
- Keep it concise, about 2-4 sentences.

Return valid JSON only:
{"score": <number from 0 to ${homework.maxScore}>, "feedback": "<Vietnamese feedback>"}`;

    const result = await model.generateContent([prompt, ...questionImageParts, ...submissionImageParts]);
    const responseText = result.response.text().trim();

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
The attached image is the homework question. Use the image as the main source if the text description is incomplete.

Return only the reference solution text in Vietnamese.`;

  
  const answerKey = await callOpenAIWithImages(prompt, homework.questionImage ? [homework.questionImage] : []);
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

Attached images order: homework question image first if available, then all student submission images. Grade from the student submission images.

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
    [homework.questionImage, ...(submissionImages || [])].filter(Boolean),
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
      .sort({ createdAt: -1 });
    
  

    res.json(homeworks);
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

    const homeworks = await Homework.find(filter)
      .populate('class', 'name')
      .populate('lesson', 'title')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json(homeworks);
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
      .populate('createdBy', 'name');
    
    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    
    res.json(homework);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/homeworks - Create homework
const createHomework = async (req, res) => {
  try {
    const { title, description, classId, lessonId, questionImage, answerKey, maxScore, dueDate } = req.body;

    if (!title || !classId || !questionImage?.url) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (title, classId, questionImage)' });
    }

    const homework = new Homework({
      title,
      description,
      class: classId,
      lesson: lessonId && lessonId.trim() ? lessonId : undefined, // Convert empty string to undefined
      questionImage,
      answerKey,
      maxScore: maxScore || 10,
      createdBy: req.user._id,
      dueDate,
      isPublished: true,
    });

    await homework.save();
  
    await homework.populate('class', 'name');
    await homework.populate('lesson', 'title');
    
    res.status(201).json(homework);
  } catch (err) {
    console.error('Homework creation error:', err);
    res.status(400).json({ message: err.message });
  }
};

// PUT /api/homeworks/:id - Cập nhật bài tập
const updateHomework = async (req, res) => {
  try {
    const allowed = ['title', 'description', 'classId', 'lessonId', 'questionImage', 'answerKey', 'maxScore', 'dueDate', 'isPublished'];
    const $set = {};
    
    allowed.forEach(field => {
      if (field in req.body) {
        if (field === 'lessonId') {
          // Convert empty string to undefined/null for optional lesson field
          $set['lesson'] = req.body[field] && req.body[field].trim() ? req.body[field] : null;
        } else if (field === 'classId') {
          $set['class'] = req.body[field];
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
      .populate('lesson', 'title');

    if (!homework) return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    
    res.json(homework);
  } catch (err) {
    res.status(400).json({ message: err.message });
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

    if (!Array.isArray(submissionImages) || submissionImages.length === 0) {
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
  

    const submission = await HomeworkSubmission.findOne({
      homework: homeworkId,
      student: studentId
    });

    if (!submission) {
      return res.status(404).json({ message: 'Không tìm thấy bài làm' });
    }

    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    // AI grading
    let finalScore = score;
    let finalFeedback = feedback;
    let usedAI = false;
    const selectedAiModel = aiModel || 'manual';

    if (!['manual', 'gemini', 'chatgpt'].includes(selectedAiModel)) {
      return res.status(400).json({ message: 'AI model không hợp lệ' });
    }

    if (selectedAiModel !== 'manual') {
      const student = await User.findById(studentId);
      
      
      // Generate a reference answer first if missing
      if (!homework.answerKey || homework.answerKey.trim() === '') {
       
        const generatedAnswerKey = await generateAnswerKeyByModel(homework, selectedAiModel);
        
        if (generatedAnswerKey) {
          homework.answerKey = generatedAnswerKey;
          homework.answerKeyGeneratedBy = selectedAiModel;
          homework.answerKeyGeneratedAt = new Date();
          await homework.save();
          
        }
      }

      // Grade with AI based on the reference answer
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
        return res.status(400).json({ message: `Điểm phải từ 0-${homework.maxScore}` });
      }
      finalFeedback = typeof feedback === 'string' ? feedback : '';
    }

    submission.score = finalScore;
    submission.maxScore = homework.maxScore;
    submission.feedback = finalFeedback;
    submission.gradedBy = req.user._id;
    submission.gradedAt = new Date();
    submission.status = 'graded';
    submission.aiModel = selectedAiModel;

    await submission.save();
    await submission.populate('student', 'name email');
    await submission.populate('gradedBy', 'name');

    res.json({
      ...submission.toObject(),
      aiUsed: usedAI
    });
  } catch (err) {
    console.error('Grade submission error:', err);
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
    
    if (!studentId || !Array.isArray(submissionImages) || submissionImages.length === 0) {
      return res.status(400).json({ message: 'Cần studentId và ít nhất một ảnh' });
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
  getHomeworks,
  getHomeworkById,
  createHomework,
  updateHomework,
  deleteHomework,
  getHomeworkSubmissions,
  getStudentSubmission,
  submitHomework,
  gradeSubmission,
  getClassStudents,
  adminSubmitHomework,
  autoCreateSubmissions,
};
