const Exam = require('../models/Exam');
const SiteSettings = require('../models/SiteSettings');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const curriculum = require('../utils/vnMathCurriculum');
const { createDocxBuffer } = require('../utils/simpleDocx');

const DEFAULT_COGNITIVE_LEVELS = [
  { key: 'NB', name: 'Nhận biết' },
  { key: 'TH', name: 'Thông hiểu' },
  { key: 'VD', name: 'Vận dụng' },
  { key: 'VDC', name: 'Vận dụng cao' },
];

function getLevelDefs(input) {
  const source = Array.isArray(input) && input.length > 0 ? input : DEFAULT_COGNITIVE_LEVELS;
  return source
    .map((level, index) => ({
      key: String(level.key || level.code || level.name || `L${index + 1}`).trim(),
      name: String(level.name || level.label || level.key || `Mức ${index + 1}`).trim(),
    }))
    .filter(level => level.key && level.name);
}

function levelKeys(levelDefs) {
  return levelDefs.map(level => level.key);
}

function levelName(levelDefs, key) {
  return levelDefs.find(level => level.key === key)?.name || key;
}

function extractJSON(text) {
  const raw = typeof text === 'string' ? text : text?.text;
  const cleaned = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI không trả về JSON hợp lệ');
  return JSON.parse(cleaned.slice(start, end + 1));
}
const MODELS = [

  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY chưa được cấu hình");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  let lastError;

  for (const modelName of MODELS) {
    try {
      console.log(`Đang sử dụng ${modelName}`);

      const model = genAI.getGenerativeModel({
        model: modelName,
      });

      const result = await model.generateContent(prompt);

      return {
        model: modelName,
        text: result.response.text().trim(),
      };
    } catch (err) {
      lastError = err;

      const message = err.message || "";

      // Chỉ fallback với các lỗi tạm thời
      if (
        message.includes("429") ||
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("503") ||
        message.includes("UNAVAILABLE")
      ) {
        console.warn(`${modelName} lỗi, chuyển sang model tiếp theo...`);
        continue;
      }

      // Lỗi khác thì dừng luôn
      throw err;
    }
  }

  throw lastError;
}
// async function callGemini(prompt) {
//   const apiKey = process.env.GEMINI_API_KEY;
//   if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình');
//   const genAI = new GoogleGenerativeAI(apiKey);
//   const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
//   const result = await model.generateContent(prompt);
  
//   return result.response.text().trim();
// }

function cell(count = 0, points = 0) {
  return { count: Number(count) || 0, points: Number(Number(points || 0).toFixed(2)) };
}

function sumCell(a = cell(), b = cell()) {
  return cell((a.count || 0) + (b.count || 0), (a.points || 0) + (b.points || 0));
}

function normalizeMatrix(meta, inputRows, levelDefs = DEFAULT_COGNITIVE_LEVELS) {
  const keys = levelKeys(levelDefs);
  const mcPoint = meta.mcCount > 0 ? meta.mcPoints / meta.mcCount : 0;
  const essayPoint = meta.essayCount > 0 ? meta.essayPoints / meta.essayCount : 0;
  const rows = (inputRows || []).map((row) => {
    const next = {
      topic: row.topic,
      unit: row.unit,
      tn: {},
      tl: {},
    };
    keys.forEach((level) => {
      const tnCount = Number(row.tn?.[level]?.count ?? row.tn?.[level] ?? 0);
      const tlCount = Number(row.tl?.[level]?.count ?? row.tl?.[level] ?? 0);
      const tnPoints = row.tn?.[level]?.points;
      const tlPoints = row.tl?.[level]?.points;
      next.tn[level] = cell(tnCount, tnPoints !== undefined && tnPoints !== '' ? Number(tnPoints) : tnCount * mcPoint);
      next.tl[level] = cell(tlCount, tlPoints !== undefined && tlPoints !== '' ? Number(tlPoints) : tlCount * essayPoint);
    });
    next.totalQuestions = keys.reduce((s, level) => s + next.tn[level].count + next.tl[level].count, 0);
    next.totalPoints = Number(keys.reduce((s, level) => s + next.tn[level].points + next.tl[level].points, 0).toFixed(2));
    next.ratio = meta.totalPoints > 0 ? Number(((next.totalPoints / meta.totalPoints) * 100).toFixed(1)) : 0;
    return next;
  });

  const totals = { tn: {}, tl: {}, totalQuestions: 0, totalPoints: 0 };
  keys.forEach((level) => {
    totals.tn[level] = rows.reduce((acc, row) => sumCell(acc, row.tn[level]), cell());
    totals.tl[level] = rows.reduce((acc, row) => sumCell(acc, row.tl[level]), cell());
  });
  totals.totalQuestions = rows.reduce((s, row) => s + row.totalQuestions, 0);
  totals.totalPoints = Number(rows.reduce((s, row) => s + row.totalPoints, 0).toFixed(2));
  return { rows, totals };
}

function fallbackQuestions(meta, matrix, levelDefs = DEFAULT_COGNITIVE_LEVELS) {
  const keys = levelKeys(levelDefs);
  let mcNo = 1;
  let essayNo = 1;
  const multipleChoice = [];
  const essay = [];

  const mcByUnit = (unit) => {
    const name = String(unit || '').toLowerCase();
    if (name.includes('tập hợp')) {
      return {
        question: 'Cho tập hợp \\(A=\\{2;4;6;8\\}\\). Tập hợp \\(A\\) có bao nhiêu phần tử?',
        options: { A: '4', B: '3', C: '5', D: '2' },
        answer: 'A',
        explanation: 'Tập hợp A có bốn phần tử là 2, 4, 6, 8.',
      };
    }
    if (name.includes('số tự nhiên') || name.includes('thứ tự')) {
      return {
        question: 'Trong các số \\(2024;2042;2402;2420\\), số lớn nhất là',
        options: { A: '2024', B: '2042', C: '2402', D: '2420' },
        answer: 'D',
        explanation: 'So sánh lần lượt các hàng, 2420 là số lớn nhất.',
      };
    }
    if (name.includes('phép tính') || name.includes('phép cộng') || name.includes('phép trừ')) {
      return {
        question: 'Giá trị của biểu thức \\(125+70+75\\) là',
        options: { A: '250', B: '260', C: '270', D: '200' },
        answer: 'C',
        explanation: '125 + 70 + 75 = (125 + 75) + 70 = 270.',
      };
    }
    if (name.includes('lũy thừa')) {
      return {
        question: 'Giá trị của \\(2^3\\cdot2^2\\) là',
        options: { A: '16', B: '32', C: '64', D: '10' },
        answer: 'B',
        explanation: '2^3 . 2^2 = 2^5 = 32.',
      };
    }
    if (name.includes('phân số')) {
      return {
        question: 'Rút gọn phân số \\(\\frac{12}{18}\\) được',
        options: { A: '\\(\\frac{2}{3}\\)', B: '\\(\\frac{3}{2}\\)', C: '\\(\\frac{4}{9}\\)', D: '\\(\\frac{6}{9}\\)' },
        answer: 'A',
        explanation: 'Chia cả tử và mẫu cho 6.',
      };
    }
    if (name.includes('căn')) {
      return {
        question: 'Giá trị của \\(\\sqrt{49}\\) là',
        options: { A: '6', B: '7', C: '8', D: '9' },
        answer: 'B',
        explanation: 'Vì 7^2 = 49 nên căn bậc hai số học của 49 là 7.',
      };
    }
    if (name.includes('hàm số') || name.includes('đồ thị')) {
      return {
        question: 'Cho hàm số \\(y=2x+1\\). Khi \\(x=3\\), giá trị của \\(y\\) là',
        options: { A: '5', B: '6', C: '7', D: '8' },
        answer: 'C',
        explanation: 'Thay x = 3 vào y = 2x + 1 được y = 7.',
      };
    }
    if (name.includes('đạo hàm') || name.includes('đơn điệu')) {
      return {
        question: 'Đạo hàm của hàm số \\(y=x^2+3x\\) là',
        options: { A: '\\(2x+3\\)', B: '\\(x+3\\)', C: '\\(2x\\)', D: '\\(x^2+3\\)' },
        answer: 'A',
        explanation: '(x^2 + 3x)\' = 2x + 3.',
      };
    }
    return {
      question: `Tính giá trị của biểu thức \\(3x+2\\) khi \\(x=4\\).`,
      options: { A: '14', B: '12', C: '10', D: '16' },
      answer: 'A',
      explanation: 'Thay x = 4 vào 3x + 2 được 14.',
    };
  };

  const essayByUnit = (unit) => {
    const name = String(unit || '').toLowerCase();
    if (name.includes('tập hợp')) {
      return {
        question: 'Cho \\(A=\\{x\\in\\mathbb{N}\\mid 7<x<15\\}\\). Viết tập hợp \\(A\\) bằng cách liệt kê phần tử và tính tổng các phần tử của \\(A\\).',
        solution: 'Liệt kê đúng \\(A=\\{8;9;10;11;12;13;14\\}\\). Tính đúng tổng \\(8+9+10+11+12+13+14=77\\). Trình bày rõ ràng và kết luận đúng.',
      };
    }
    if (name.includes('phép tính') || name.includes('phép cộng') || name.includes('phép trừ')) {
      return {
        question: 'Tính hợp lí: \\(125+38+75+62\\).',
        solution: 'Nhóm số hợp lí: \\((125+75)+(38+62)=200+100=300\\).',
      };
    }
    if (name.includes('lũy thừa')) {
      return {
        question: 'Rút gọn biểu thức \\(2^3\\cdot2^4:2^2\\).',
        solution: 'Áp dụng quy tắc nhân, chia hai lũy thừa cùng cơ số: \\(2^{3+4-2}=2^5=32\\).',
      };
    }
    if (name.includes('hàm số') || name.includes('đồ thị')) {
      return {
        question: 'Cho hàm số \\(y=2x-1\\). Tính \\(y\\) khi \\(x=3\\) và tìm \\(x\\) khi \\(y=7\\).',
        solution: 'Khi \\(x=3\\), \\(y=2\\cdot3-1=5\\). Khi \\(y=7\\), giải \\(2x-1=7\\), suy ra \\(x=4\\).',
      };
    }
    return {
      question: `Giải bài toán vận dụng liên quan đến ${unit}: tìm \\(x\\), biết \\(3x+2=14\\).`,
      solution: 'Từ \\(3x+2=14\\), suy ra \\(3x=12\\), nên \\(x=4\\). Học sinh trình bày đủ bước và kết luận đúng.',
    };
  };

  matrix.forEach((row) => {
    keys.forEach((level) => {
      for (let i = 0; i < (row.tn[level]?.count || 0); i += 1) {
        const item = mcByUnit(row.unit);
        const count = Number(row.tn[level]?.count) || 0;
        const pointEach = count > 0 ? Number(((Number(row.tn[level]?.points) || 0) / count).toFixed(2)) : 0;
        multipleChoice.push({
          number: mcNo,
          topic: row.topic,
          unit: row.unit,
          level,
          points: pointEach,
          question: `(${levelName(levelDefs, level)}) ${item.question}`,
          options: item.options,
          answer: item.answer,
          explanation: item.explanation,
        });
        mcNo += 1;
      }
      for (let i = 0; i < (row.tl[level]?.count || 0); i += 1) {
        const item = essayByUnit(row.unit);
        const count = Number(row.tl[level]?.count) || 0;
        const pointEach = count > 0 ? Number(((Number(row.tl[level]?.points) || 0) / count).toFixed(2)) : 0;
        essay.push({
          number: essayNo,
          topic: row.topic,
          unit: row.unit,
          level,
          points: pointEach,
          question: `(${levelName(levelDefs, level)}) ${item.question}`,
          solution: item.solution,
        });
        essayNo += 1;
      }
    });
  });

  return { multipleChoice, essay };
}

function questionSlots(matrix, type, levelDefs = DEFAULT_COGNITIVE_LEVELS) {
  const keys = levelKeys(levelDefs);
  const slots = [];
  matrix.forEach((row) => {
    keys.forEach((level) => {
      const cellData = row[type]?.[level] || {};
      const count = Number(cellData.count) || 0;
      const pointEach = count > 0 ? Number(((Number(cellData.points) || 0) / count).toFixed(2)) : 0;
      for (let i = 0; i < count; i += 1) {
        slots.push({
          topic: row.topic,
          unit: row.unit,
          level,
          points: pointEach,
        });
      }
    });
  });
  return slots;
}

function buildPrompt(payload, meta, matrix, levelDefs = DEFAULT_COGNITIVE_LEVELS) {
  const keys = levelKeys(levelDefs);
  const compactMatrix = matrix.map(row => ({
    topic: row.topic,
    unit: row.unit,
    tn: Object.fromEntries(keys.map(level => [level, row.tn[level].count])),
    tl: Object.fromEntries(keys.map(level => [level, row.tl[level].count])),
  }));

  return `Bạn là giáo viên Toán Việt Nam, biên soạn đề kiểm tra theo Chương trình giáo dục phổ thông 2018.
Hãy tạo đề chính xác, phù hợp lớp ${meta.grade}, bám sát các chủ đề đã chọn và đúng ma trận.

Thông tin:
- Trường: ${meta.schoolName}
- Kỳ kiểm tra: ${meta.examName}
- Năm học: ${meta.schoolYear}
- Lớp: ${meta.grade}
- Số câu trắc nghiệm: ${meta.mcCount}, tổng điểm trắc nghiệm: ${meta.mcPoints}
- Số câu tự luận: ${meta.essayCount}, tổng điểm tự luận: ${meta.essayPoints}
- Thời gian: ${meta.duration || 'không ghi'} phút

Ma trận bắt buộc:
${JSON.stringify(compactMatrix, null, 2)}

Các mức độ nhận thức đang dùng trong ma trận:
${levelDefs.map(level => `- ${level.key}: ${level.name}`).join('\n')}

Yêu cầu:
- Câu hỏi Toán chính xác, không mơ hồ, có đáp án duy nhất với trắc nghiệm.
- Dùng kí hiệu LaTeX khi cần, ví dụ \\(x^2+1\\), \\(\\frac{a}{b}\\).
- Đáp án tự luận có hướng dẫn chấm theo điểm.
- Bản đặc tả nêu yêu cầu cần đạt cho từng nội dung, đúng mức độ nhận thức.
- Không tạo thêm hoặc bớt câu so với ma trận.
- Trả về JSON hợp lệ, không markdown, đúng schema:
{
  "specification":[{"topic":"","unit":"","requirement":"","tn":{"NB":0,"TH":0,"VD":0,"VDC":0},"tl":{"NB":0,"TH":0,"VD":0,"VDC":0}}],
  "questions":{
    "multipleChoice":[{"number":1,"topic":"","unit":"","level":"${keys[0] || 'NB'}","points":0.25,"question":"","options":{"A":"","B":"","C":"","D":""},"answer":"A","explanation":""}],
    "essay":[{"number":1,"topic":"","unit":"","level":"${keys[2] || keys[0] || 'VD'}","points":1.0,"question":"","solution":""}]
  }
}`;
}

function normalizeGenerated(meta, matrix, generated, levelDefs = DEFAULT_COGNITIVE_LEVELS) {
  const keys = levelKeys(levelDefs);
  const fallback = fallbackQuestions(meta, matrix, levelDefs);
  const mcSlots = questionSlots(matrix, 'tn', levelDefs);
  const essaySlots = questionSlots(matrix, 'tl', levelDefs);
  const generatedMc = Array.isArray(generated?.questions?.multipleChoice) ? generated.questions.multipleChoice : [];
  const generatedEssay = Array.isArray(generated?.questions?.essay) ? generated.questions.essay : [];
  const mc = [...generatedMc, ...fallback.multipleChoice].slice(0, meta.mcCount);
  const essay = [...generatedEssay, ...fallback.essay].slice(0, meta.essayCount);
  const spec = Array.isArray(generated?.specification)
    ? generated.specification
    : matrix.map(row => ({
      topic: row.topic,
      unit: row.unit,
      requirement: `Nhận biết, thông hiểu và vận dụng kiến thức ${row.unit} theo chương trình GDPT 2018.`,
      tn: Object.fromEntries(keys.map(level => [level, row.tn[level].count])),
      tl: Object.fromEntries(keys.map(level => [level, row.tl[level].count])),
    }));

  return {
    specification: spec.map((row, index) => ({
      topic: row.topic || matrix[index]?.topic || '',
      unit: row.unit || matrix[index]?.unit || '',
      requirement: row.requirement || `Đạt yêu cầu cần đạt về ${row.unit || matrix[index]?.unit || 'nội dung đã chọn'}.`,
      tn: Object.fromEntries(keys.map(level => [level, cell(row.tn?.[level] ?? matrix[index]?.tn?.[level]?.count ?? 0, 0)])),
      tl: Object.fromEntries(keys.map(level => [level, cell(row.tl?.[level] ?? matrix[index]?.tl?.[level]?.count ?? 0, 0)])),
    })),
    questions: {
      multipleChoice: mc.slice(0, meta.mcCount).map((q, idx) => ({
        number: idx + 1,
        topic: mcSlots[idx]?.topic || q.topic || fallback.multipleChoice[idx]?.topic || '',
        unit: mcSlots[idx]?.unit || q.unit || fallback.multipleChoice[idx]?.unit || '',
        level: mcSlots[idx]?.level || (keys.includes(q.level) ? q.level : (fallback.multipleChoice[idx]?.level || keys[0] || 'NB')),
        points: mcSlots[idx]?.points !== undefined
          ? mcSlots[idx].points
          : (Number(q.points) || Number((meta.mcPoints / Math.max(meta.mcCount, 1)).toFixed(2))),
        question: q.question || fallback.multipleChoice[idx]?.question || '',
        options: {
          A: q.options?.A || fallback.multipleChoice[idx]?.options?.A || '',
          B: q.options?.B || fallback.multipleChoice[idx]?.options?.B || '',
          C: q.options?.C || fallback.multipleChoice[idx]?.options?.C || '',
          D: q.options?.D || fallback.multipleChoice[idx]?.options?.D || '',
        },
        answer: ['A', 'B', 'C', 'D'].includes(q.answer) ? q.answer : (fallback.multipleChoice[idx]?.answer || 'A'),
        explanation: q.explanation || fallback.multipleChoice[idx]?.explanation || '',
      })),
      essay: essay.slice(0, meta.essayCount).map((q, idx) => ({
        number: idx + 1,
        topic: essaySlots[idx]?.topic || q.topic || fallback.essay[idx]?.topic || '',
        unit: essaySlots[idx]?.unit || q.unit || fallback.essay[idx]?.unit || '',
        level: essaySlots[idx]?.level || (keys.includes(q.level) ? q.level : (fallback.essay[idx]?.level || keys[2] || keys[0] || 'VD')),
        points: essaySlots[idx]?.points !== undefined
          ? essaySlots[idx].points
          : (Number(q.points) || Number((meta.essayPoints / Math.max(meta.essayCount, 1)).toFixed(2))),
        question: q.question || fallback.essay[idx]?.question || '',
        solution: q.solution || fallback.essay[idx]?.solution || '',
      })),
    },
  };
}

function buildExamContentHtml(paper) {
  const mc = paper.questions?.multipleChoice || [];
  const essay = paper.questions?.essay || [];
  return [
    `<h2 style="text-align:center">${paper.meta.examName}</h2>`,
    `<p style="text-align:center"><strong>Môn Toán - Lớp ${paper.meta.grade}</strong></p>`,
    `<p><strong>I. Phần trắc nghiệm (${paper.meta.mcPoints} điểm)</strong></p>`,
    ...mc.map(q => `<p><strong>Câu ${q.number}.</strong> ${q.question}<br/>A. ${q.options.A}<br/>B. ${q.options.B}<br/>C. ${q.options.C}<br/>D. ${q.options.D}</p>`),
    `<p><strong>II. Phần tự luận (${paper.meta.essayPoints} điểm)</strong></p>`,
    ...essay.map((q, idx) => `<p><strong>Bài ${idx + 1}. (${q.points} điểm)</strong> ${q.question}</p>`),
  ].join('');
}

function buildPaperPayload(reqBody) {
  const meta = {
    department: reqBody.department || '',
    schoolName: reqBody.schoolName || 'Toán Thầy Hiếu - 038.2468.988',
    schoolYear: reqBody.schoolYear || '',
    examName: reqBody.examName || '',
    grade: Number(reqBody.grade),
    duration: reqBody.duration ? Number(reqBody.duration) : '',
    mcCount: Number(reqBody.mcCount) || 0,
    essayCount: Number(reqBody.essayCount) || 0,
    mcPoints: Number(reqBody.mcPoints) || 0,
    essayPoints: Number(reqBody.essayPoints) || 0,
  };
  meta.totalPoints = Number((meta.mcPoints + meta.essayPoints).toFixed(2));
  return meta;
}

const getCurriculum = async (req, res) => {
  try {
    const settings = await SiteSettings.findOne({ key: 'default' }).lean();
    const customCurriculum = settings?.curriculum || {};
    res.json(Object.keys(customCurriculum).length > 0 ? customCurriculum : curriculum);
  } catch (err) {
    res.json(curriculum);
  }
};

const generateExamPaper = async (req, res) => {
  try {
    const meta = buildPaperPayload(req.body);
    const cognitiveLevels = getLevelDefs(req.body.cognitiveLevels);
    if (!meta.grade || !meta.examName || !meta.schoolYear || !meta.schoolName) {
      return res.status(400).json({ message: 'Vui lòng nhập đủ lớp, năm học, tên kỳ kiểm tra và tên trường' });
    }

    const { rows: matrix, totals } = normalizeMatrix(meta, req.body.matrix, cognitiveLevels);
    if (totals.totalQuestions !== meta.mcCount + meta.essayCount) {
      return res.status(400).json({ message: 'Tổng số câu trong ma trận chưa khớp cấu trúc đề' });
    }

    let generated = null;
    let aiWarning = '';
    try {
      const aiResult = await callGemini(buildPrompt(req.body, meta, matrix, cognitiveLevels));
      generated = extractJSON(aiResult);
    } catch (aiErr) {
      aiWarning = aiErr.message;
      console.warn('[ExamPaper] AI fallback:', aiErr.message);
    }

    const hasAiQuestions = Boolean(
      generated?.questions?.multipleChoice?.some(q => q?.question && q?.options?.A && q?.options?.B && q?.options?.C && q?.options?.D)
      || generated?.questions?.essay?.some(q => q?.question && q?.solution)
    );
    const normalized = normalizeGenerated(meta, matrix, generated, cognitiveLevels);
    res.json({
      meta,
      cognitiveLevels,
      source: hasAiQuestions ? 'ai' : 'fallback',
      aiWarning,
      matrix,
      totals,
      ...normalized,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Generate exam paper error:', err);
    res.status(400).json({ message: err.message });
  }
};

function buildExamLevelsFromMatrix(paper) {
  const defs = getLevelDefs(paper.cognitiveLevels);
  let cursor = 1;
  return defs.map((level) => {
    const totals = (paper.matrix || []).reduce((acc, row) => {
      acc.count += Number(row.tn?.[level.key]?.count) || 0;
      acc.count += Number(row.tl?.[level.key]?.count) || 0;
      acc.points += Number(row.tn?.[level.key]?.points) || 0;
      acc.points += Number(row.tl?.[level.key]?.points) || 0;
      return acc;
    }, { count: 0, points: 0 });
    if (totals.count <= 0 && totals.points <= 0) return null;
    const item = {
      name: level.name,
      fromQuestion: cursor,
      toQuestion: Math.max(cursor, cursor + totals.count - 1),
      totalPoints: Number(totals.points.toFixed(2)),
      criteria: [],
    };
    cursor = item.toQuestion + 1;
    return item;
  }).filter(Boolean);
}

const saveExamPaper = async (req, res) => {
  try {
    const paper = req.body.paper;
    if (!paper?.meta || !paper?.questions) {
      return res.status(400).json({ message: 'Dữ liệu đề không hợp lệ' });
    }

    const exam = await Exam.create({
      title: `${paper.meta.examName} - Toán ${paper.meta.grade}`,
      content: buildExamContentHtml(paper),
      totalQuestions: (paper.questions.multipleChoice?.length || 0) + (paper.questions.essay?.length || 0),
      levels: buildExamLevelsFromMatrix(paper),
      isTemplate: true,
      note: `Bộ hồ sơ đề sinh tự động theo ma trận - ${paper.meta.schoolYear}`,
      examPackage: paper,
      createdBy: req.user._id,
    });

    res.status(201).json(exam);
  } catch (err) {
    console.error('Save exam paper error:', err);
    res.status(400).json({ message: err.message });
  }
};

const exportExamPaper = async (req, res) => {
  try {
    const paper = req.body.paper;
    if (!paper?.meta || !paper?.questions) {
      return res.status(400).json({ message: 'Dữ liệu đề không hợp lệ' });
    }
    const buffer = createDocxBuffer(paper);
    const fileName = `de-kiem-tra-toan-${paper.meta.grade || ''}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Export exam paper error:', err);
    res.status(400).json({ message: err.message });
  }
};

module.exports = {
  getCurriculum,
  generateExamPaper,
  saveExamPaper,
  exportExamPaper,
};
