import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiSave, FiPlus, FiTrash2, FiRefreshCw } from 'react-icons/fi';
import RichTextEditor from '../../components/RichTextEditor';
import VN_MATH_CURRICULUM from '../../utils/vnMathCurriculum';

const FALLBACK_LEVELS = [
  { key: 'NB', name: 'Nhận biết' },
  { key: 'TH', name: 'Thông hiểu' },
  { key: 'VD', name: 'Vận dụng' },
  { key: 'VDC', name: 'Vận dụng cao' },
];

const round2 = value => Number((Number(value) || 0).toFixed(4));
const pointText = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 4 });

function toLocalDatetimeInput(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeLevelOptions(levelOptions, paper) {
  const source = paper?.cognitiveLevels?.length
    ? paper.cognitiveLevels
    : levelOptions.length
      ? levelOptions
      : FALLBACK_LEVELS;
  return source.map((level, index) => ({
    key: level.key || level.code || level.name || `L${index + 1}`,
    name: level.name || level.label || level.key || `Mức ${index + 1}`,
  }));
}

function emptyCells(levels) {
  return Object.fromEntries(levels.map(level => [level.key, { count: 0, points: 0 }]));
}

function firstCurriculumTopic(grade = 6) {
  const chapters = VN_MATH_CURRICULUM[grade] || {};
  const topic = Object.keys(chapters)[0] || 'Đề kiểm tra';
  const unit = chapters[topic]?.[0] || 'Nội dung đề';
  return { topic, unit };
}

function createDefaultMatrix(levels, grade = 6) {
  const first = firstCurriculumTopic(grade);
  return [{
    topic: first.topic,
    unit: first.unit,
    tn: emptyCells(levels),
    tl: emptyCells(levels),
  }];
}

function normalizeMatrixRows(rows, levels, grade = 6) {
  const inputRows = rows?.length ? rows : createDefaultMatrix(levels, grade);
  return inputRows.map(row => ({
    topic: row.topic || 'Đề kiểm tra',
    unit: row.unit || 'Nội dung đề',
    tn: Object.fromEntries(levels.map(level => [level.key, {
      count: Number(row.tn?.[level.key]?.count) || 0,
      points: round2(row.tn?.[level.key]?.points),
    }])),
    tl: Object.fromEntries(levels.map(level => [level.key, {
      count: Number(row.tl?.[level.key]?.count) || 0,
      points: round2(row.tl?.[level.key]?.points),
    }])),
  }));
}

function questionSlots(matrix, type, levels) {
  const slots = [];
  matrix.forEach(row => {
    levels.forEach(level => {
      const cell = row[type]?.[level.key] || {};
      const count = Number(cell.count) || 0;
      const pointEach = count > 0 ? round2((Number(cell.points) || 0) / count) : 0;
      for (let i = 0; i < count; i += 1) {
        slots.push({ topic: row.topic, unit: row.unit, level: level.key, points: pointEach });
      }
    });
  });
  return slots;
}

function matrixFromQuestions(paper, levels, grade = 6) {
  const questions = [
    ...(paper?.questions?.multipleChoice || []).map(q => ({ ...q, type: 'tn' })),
    ...(paper?.questions?.essay || []).map(q => ({ ...q, type: 'tl' })),
  ];
  if (questions.length === 0) return createDefaultMatrix(levels, grade);

  const rows = [];
  questions.forEach(question => {
    const topic = question.topic || firstCurriculumTopic(grade).topic;
    const unit = question.unit || firstCurriculumTopic(grade).unit;
    const levelKey = levels.some(level => level.key === question.level) ? question.level : levels[0]?.key;
    if (!levelKey) return;
    let row = rows.find(item => item.topic === topic && item.unit === unit);
    if (!row) {
      row = { topic, unit, tn: emptyCells(levels), tl: emptyCells(levels) };
      rows.push(row);
    }
    const current = row[question.type][levelKey] || { count: 0, points: 0 };
    row[question.type][levelKey] = {
      count: current.count + 1,
      points: round2(current.points + (Number(question.points) || 0)),
    };
  });
  return rows.length ? rows : createDefaultMatrix(levels, grade);
}

function matrixFromExam(exam, levels, grade = 6) {
  if (exam?.examPackage?.matrix?.length) {
    return normalizeMatrixRows(exam.examPackage.matrix, levels, grade);
  }
  if (exam?.examPackage?.questions) {
    return normalizeMatrixRows(matrixFromQuestions(exam.examPackage, levels, grade), levels, grade);
  }
  return createDefaultMatrix(levels, grade);
}

function extractGradeFromLevel(level) {
  const match = String(level?.name || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function examPackageToHomeworkText(paper) {
  if (!paper) return '';
  const hasQuestions = Boolean(
    (paper.questions?.multipleChoice || []).length ||
    (paper.questions?.essay || []).length
  );
  if (!hasQuestions) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => {
    const options = ['A', 'B', 'C', 'D'].map(key => `${key}. ${q.options?.[key] || ''}`).join('\n');
    return `Câu ${q.number || index + 1}. ${q.question || ''}\n${options}`;
  });
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}. ${q.question || ''}`);
  return [
    paper.title || '',
    mc.length ? `I. Phần trắc nghiệm\n${mc.join('\n\n')}` : '',
    essay.length ? `II. Phần tự luận\n${essay.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function examPackageToAnswerKey(paper) {
  if (!paper) return '';
  const mc = (paper.questions?.multipleChoice || []).map((q, index) => {
    const explanation = q.explanation ? ` - ${q.explanation}` : '';
    return `Câu ${q.number || index + 1}: ${q.answer || ''}${explanation}`;
  });
  const essay = (paper.questions?.essay || []).map((q, index) => `Bài ${index + 1}: ${q.solution || ''}`);
  return [...mc, ...essay].filter(Boolean).join('\n');
}

function getHomeworkClassId(homework) {
  return homework?.class?._id || homework?.class || '';
}

function hasExamPackageQuestions(paper) {
  return Boolean(
    (paper?.questions?.multipleChoice || []).length ||
    (paper?.questions?.essay || []).length
  );
}

function matrixTotals(matrix, levels) {
  const totals = {
    tn: Object.fromEntries(levels.map(level => [level.key, { count: 0, points: 0 }])),
    tl: Object.fromEntries(levels.map(level => [level.key, { count: 0, points: 0 }])),
    totalQuestions: 0,
    totalPoints: 0,
  };
  matrix.forEach(row => {
    levels.forEach(level => {
      totals.tn[level.key].count += Number(row.tn?.[level.key]?.count) || 0;
      totals.tn[level.key].points = round2(totals.tn[level.key].points + (Number(row.tn?.[level.key]?.points) || 0));
      totals.tl[level.key].count += Number(row.tl?.[level.key]?.count) || 0;
      totals.tl[level.key].points = round2(totals.tl[level.key].points + (Number(row.tl?.[level.key]?.points) || 0));
    });
  });
  totals.totalQuestions = levels.reduce((sum, level) => sum + totals.tn[level.key].count + totals.tl[level.key].count, 0);
  totals.totalPoints = round2(levels.reduce((sum, level) => sum + totals.tn[level.key].points + totals.tl[level.key].points, 0));
  return totals;
}

function rowTotals(row, levels) {
  const count = levels.reduce((sum, level) => sum + (Number(row.tn?.[level.key]?.count) || 0) + (Number(row.tl?.[level.key]?.count) || 0), 0);
  const points = round2(levels.reduce((sum, level) => sum + (Number(row.tn?.[level.key]?.points) || 0) + (Number(row.tl?.[level.key]?.points) || 0), 0));
  return { count, points };
}

function buildLevelsFromMatrix(matrix, levels) {
  let cursor = 1;
  return levels.map(level => {
    const data = matrix.reduce((acc, row) => {
      acc.count += Number(row.tn?.[level.key]?.count) || 0;
      acc.count += Number(row.tl?.[level.key]?.count) || 0;
      acc.points += Number(row.tn?.[level.key]?.points) || 0;
      acc.points += Number(row.tl?.[level.key]?.points) || 0;
      return acc;
    }, { count: 0, points: 0 });
    if (data.count <= 0 && data.points <= 0) return null;
    const item = {
      name: level.name,
      fromQuestion: cursor,
      toQuestion: Math.max(cursor, cursor + data.count - 1),
      totalPoints: round2(data.points),
      criteria: [],
    };
    cursor = item.toQuestion + 1;
    return item;
  }).filter(Boolean);
}

function syncQuestionsWithMatrix(examPackage, matrix, levels) {
  if (!examPackage?.questions) return examPackage;
  const tnSlots = questionSlots(matrix, 'tn', levels);
  const tlSlots = questionSlots(matrix, 'tl', levels);
  return {
    ...examPackage,
    questions: {
      ...examPackage.questions,
      multipleChoice: (examPackage.questions.multipleChoice || []).map((question, index) => ({
        ...question,
        topic: tnSlots[index]?.topic || question.topic,
        unit: tnSlots[index]?.unit || question.unit,
        level: tnSlots[index]?.level || question.level,
        points: tnSlots[index]?.points ?? question.points,
      })),
      essay: (examPackage.questions.essay || []).map((question, index) => ({
        ...question,
        topic: tlSlots[index]?.topic || question.topic,
        unit: tlSlots[index]?.unit || question.unit,
        level: tlSlots[index]?.level || question.level,
        points: tlSlots[index]?.points ?? question.points,
      })),
    },
  };
}

function CellInput({ value, onChange }) {
  return (
    <div className="space-y-1">
      <input
        type="number"
        min="0"
        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-center text-sm font-semibold"
        value={value?.count ?? 0}
        onChange={e => onChange({ ...value, count: Math.max(0, Number(e.target.value) || 0) })}
      />
      <input
        type="number"
        min="0"
        step="any"
        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-center text-sm text-blue-700"
        value={value?.points ?? 0}
        onChange={e => onChange({ ...value, points: Math.max(0, Number(e.target.value) || 0) })}
      />
    </div>
  );
}

export default function AdminExamEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [levelOptions, setLevelOptions] = useState([]);
  const [cognitiveLevels, setCognitiveLevels] = useState(FALLBACK_LEVELS);
  const [examBank, setExamBank] = useState([]);
  const [selectedBankExamId, setSelectedBankExamId] = useState('');
  const [curriculumGrade, setCurriculumGrade] = useState(6);
  const [form, setForm] = useState({
    title: '',
    content: '',
    solutionContent: '',
    course: '',
    lesson: '',
    level: '',
    totalQuestions: '',
    isTemplate: false,
    note: '',
    pdfAttachments: [],
    classSchedules: [],
    matrix: createDefaultMatrix(FALLBACK_LEVELS, 6),
    examPackage: null,
    assignHomework: false,
    homeworkClasses: [],
    homeworkDueDate: '',
  });
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classLevels, setClassLevels] = useState([]);
  const [sourceHomeworks, setSourceHomeworks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  const totals = useMemo(() => matrixTotals(form.matrix, cognitiveLevels), [form.matrix, cognitiveLevels]);
  const curriculumGradeOptions = useMemo(() => {
    const grades = classLevels.map(extractGradeFromLevel).filter(Boolean);
    return [...new Set(grades)].sort((a, b) => a - b);
  }, [classLevels]);

  useEffect(() => {
    api.get('/courses/admin/all').then(r => setCourses(r.data || [])).catch(() => {});
    api.get('/classes').then(r => setClasses(r.data || [])).catch(() => {});
    api.get('/levels').then(r => setClassLevels(r.data || [])).catch(() => {});
    api.get('/exams', { params: { isTemplate: 'true' } }).then(r => setExamBank(r.data || [])).catch(() => {});
    api.get('/settings')
      .then(r => {
        const levels = (r.data.difficultyLevels || []).filter(level => level?.name?.trim());
        setLevelOptions(levels);
        if (!isEdit) {
          const normalized = normalizeLevelOptions(levels);
          setCognitiveLevels(normalized);
          setForm(f => (f.examPackage ? f : { ...f, matrix: createDefaultMatrix(normalized, 6) }));
        }
      })
      .catch(() => {});
  }, [isEdit]);

  useEffect(() => {
    if (!form.course) {
      setLessons([]);
      return;
    }
    api.get('/lessons', { params: { course: form.course } })
      .then(r => setLessons(r.data || []))
      .catch(() => setLessons([]));
  }, [form.course]);

  useEffect(() => {
    if (!isEdit) return;
    const loadExam = async () => {
      try {
        const [{ data: exam }, { data: linkedHomeworks }] = await Promise.all([
          api.get(`/exams/${id}`),
          api.get('/homeworks', { params: { sourceExam: id } }).catch(() => ({ data: [] })),
        ]);
        const levels = normalizeLevelOptions(levelOptions, exam.examPackage);
        const grade = Number(exam.examPackage?.meta?.grade) || 6;
        const linkedClassIds = (linkedHomeworks || [])
          .map((homework) => homework.class?._id || homework.class)
          .filter(Boolean)
          .map(String);
        setSourceHomeworks(linkedHomeworks || []);
        setCurriculumGrade(grade);
        setCognitiveLevels(levels);
        setForm({
          title: exam.title || '',
          content: exam.content || '',
          solutionContent: exam.solutionContent || '',
          course: exam.course?._id || exam.course || exam.lesson?.course?._id || exam.lesson?.course || '',
          lesson: exam.lesson?._id || exam.lesson || '',
          level: exam.level?._id || exam.level || '',
          totalQuestions: exam.totalQuestions || '',
          isTemplate: exam.isTemplate || false,
          note: exam.note || '',
          pdfAttachments: exam.pdfAttachments || [],
          classSchedules: (exam.classSchedules || []).map(schedule => ({
            class: schedule.class?._id || schedule.class || '',
            startDate: toLocalDatetimeInput(schedule.startDate),
            endDate: toLocalDatetimeInput(schedule.endDate),
          })),
          matrix: matrixFromExam(exam, levels, grade),
          examPackage: exam.examPackage || null,
          assignHomework: linkedClassIds.length > 0,
          homeworkClasses: [...new Set(linkedClassIds)],
          homeworkDueDate: linkedHomeworks?.[0]?.dueDate ? toLocalDatetimeInput(linkedHomeworks[0].dueDate) : '',
        });
      } catch {
        toast.error('Không tải được đề');
      } finally {
        setFetching(false);
      }
    };
    loadExam();
  }, [id, isEdit, levelOptions]);

  const updateMatrixCell = (rowIndex, type, levelKey, value) => {
    setForm(f => ({
      ...f,
      matrix: f.matrix.map((row, index) => {
        if (index !== rowIndex) return row;
        return {
          ...row,
          [type]: {
            ...row[type],
            [levelKey]: { count: Number(value.count) || 0, points: round2(value.points) },
          },
        };
      }),
    }));
  };

  const addMatrixRow = () => {
    setForm(f => ({ ...f, matrix: [...f.matrix, ...createDefaultMatrix(cognitiveLevels, curriculumGrade)] }));
  };

  const removeMatrixRow = (rowIndex) => {
    setForm(f => ({
      ...f,
      matrix: f.matrix.length > 1 ? f.matrix.filter((_, index) => index !== rowIndex) : f.matrix,
    }));
  };

  const resetMatrix = () => {
    setForm(f => ({ ...f, matrix: createDefaultMatrix(cognitiveLevels, curriculumGrade) }));
  };

  const applyBankExam = async (examId) => {
    setSelectedBankExamId(examId);
    if (!examId) {
      setForm(f => f.examPackage ? ({
        ...f,
        title: '',
        content: '',
        solutionContent: '',
        course: '',
        lesson: '',
        level: '',
        totalQuestions: '',
        note: '',
        pdfAttachments: [],
        classSchedules: [],
        matrix: createDefaultMatrix(cognitiveLevels, curriculumGrade),
        examPackage: null,
      }) : f);
      return;
    }
    try {
      const { data: exam } = await api.get(`/exams/${examId}`);
      const levels = normalizeLevelOptions(levelOptions, exam.examPackage);
      const grade = Number(exam.examPackage?.meta?.grade) || curriculumGrade || 6;
      setCurriculumGrade(grade);
      setCognitiveLevels(levels);
      setForm(f => ({
        ...f,
        title: exam.title || f.title,
        content: exam.content || '',
        solutionContent: exam.solutionContent || '',
        course: exam.course?._id || exam.course || exam.lesson?.course?._id || exam.lesson?.course || f.course || '',
        lesson: exam.lesson?._id || exam.lesson || '',
        level: exam.level?._id || exam.level || '',
        totalQuestions: exam.totalQuestions || '',
        isTemplate: false,
        note: exam.note ? `Sao chép từ ngân hàng đề: ${exam.title}` : f.note,
        pdfAttachments: [],
        classSchedules: [],
        matrix: matrixFromExam(exam, levels, grade),
        examPackage: exam.examPackage || null,
      }));
      toast.success('Đã sao chép đề từ ngân hàng');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không sao chép được đề');
    }
  };

  const updateCurriculumGrade = (grade) => {
    setCurriculumGrade(grade);
    setForm(f => {
      const chapters = VN_MATH_CURRICULUM[grade] || {};
      const chapterNames = Object.keys(chapters);
      return {
        ...f,
        matrix: f.matrix.map(row => {
          if (chapters[row.topic]?.includes(row.unit)) return row;
          const first = firstCurriculumTopic(grade);
          return { ...row, topic: first.topic, unit: first.unit };
        }),
      };
    });
  };

  const updateMatrixTopic = (rowIndex, topic) => {
    const units = VN_MATH_CURRICULUM[curriculumGrade]?.[topic] || [];
    setForm(f => ({
      ...f,
      matrix: f.matrix.map((row, index) => (
        index === rowIndex ? { ...row, topic, unit: units[0] || '' } : row
      )),
    }));
  };

  const updateMatrixUnit = (rowIndex, unit) => {
    setForm(f => ({
      ...f,
      matrix: f.matrix.map((row, index) => (
        index === rowIndex ? { ...row, unit } : row
      )),
    }));
  };

  const handleCourseChange = (courseId) => {
    setForm(f => ({
      ...f,
      course: courseId,
      lesson: '',
    }));
  };

  const handleLessonChange = (lessonId) => {
    const lesson = lessons.find(item => item._id === lessonId);
    const courseId = lesson?.course?._id || lesson?.course || form.course;
    setForm(f => ({
      ...f,
      course: courseId || f.course,
      lesson: lessonId,
    }));
  };

  const updatePackageQuestion = (type, index, updater) => {
    setForm(f => {
      if (!f.examPackage?.questions) return f;
      const questions = f.examPackage.questions;
      const key = type === 'multipleChoice' ? 'multipleChoice' : 'essay';
      return {
        ...f,
        examPackage: {
          ...f.examPackage,
          questions: {
            ...questions,
            [key]: (questions[key] || []).map((question, questionIndex) => (
              questionIndex === index ? updater(question) : question
            )),
          },
        },
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Nhập tiêu đề đề kiểm tra');
    if (totals.totalQuestions < 1) return toast.error('Ma trận cần có ít nhất một câu');
    const totalQuestions = Number(form.totalQuestions) || totals.totalQuestions;
    if (totalQuestions !== totals.totalQuestions) return toast.error(`Tổng số câu đang là ${totals.totalQuestions}, chưa khớp ô Tổng số câu hỏi`);

    if (form.assignHomework && form.homeworkClasses.length === 0) return toast.error('Chưa chọn lớp để giao bài tập');

    setLoading(true);
    try {
      const matrixWithTotals = form.matrix.map(row => {
        const rt = rowTotals(row, cognitiveLevels);
        return {
          ...row,
          totalQuestions: rt.count,
          totalPoints: rt.points,
          ratio: totals.totalPoints > 0 ? round2((rt.points / totals.totalPoints) * 100) : 0,
        };
      });
      const syncedPackage = form.examPackage?.questions
        ? syncQuestionsWithMatrix(form.examPackage, matrixWithTotals, cognitiveLevels)
        : null;
      const sourcePackage = syncedPackage || form.examPackage;
      const examPackage = {
        ...(sourcePackage || {}),
        title: form.title,
        cognitiveLevels,
        matrix: matrixWithTotals,
        totals,
        meta: {
          ...(sourcePackage?.meta || {}),
          examName: form.title || sourcePackage?.meta?.examName || '',
          grade: curriculumGrade,
          totalPoints: totals.totalPoints,
        },
      };
      const payload = {
        title: form.title,
        content: form.content,
        solutionContent: form.solutionContent,
        course: form.course || null,
        totalQuestions: totals.totalQuestions,
        isTemplate: form.isTemplate,
        note: form.note,
        levels: buildLevelsFromMatrix(matrixWithTotals, cognitiveLevels),
        examPackage,
        classSchedules: form.classSchedules
          .filter(schedule => schedule.class)
          .map(schedule => ({
            class: schedule.class,
            startDate: schedule.startDate ? new Date(schedule.startDate).toISOString() : null,
            endDate: schedule.endDate ? new Date(schedule.endDate).toISOString() : null,
          })),
      };
      payload.lesson = form.lesson || null;
      if (form.level) payload.level = form.level;

      let savedExam;
      if (isEdit) {
        const { data } = await api.put(`/exams/${id}`, payload);
        savedExam = data;
        toast.success('Đã cập nhật đề kiểm tra');
      } else {
        const { data } = await api.post('/exams', payload);
        savedExam = data;
        toast.success('Đã tạo đề kiểm tra');
      }
      const sourceExamId = savedExam?._id || id;
      const latestSourceHomeworks = sourceExamId
        ? (await api.get('/homeworks', { params: { sourceExam: sourceExamId } }).catch(() => ({ data: sourceHomeworks }))).data || []
        : [];
      const selectedHomeworkClassIds = form.assignHomework ? form.homeworkClasses.map(String) : [];
      const removedHomeworks = latestSourceHomeworks.filter((homework) => {
        const homeworkClassId = getHomeworkClassId(homework);
        return homeworkClassId && !selectedHomeworkClassIds.includes(String(homeworkClassId));
      });

      if (removedHomeworks.length > 0) {
        await Promise.all(removedHomeworks.map((homework) => api.delete(`/homeworks/${homework._id}`)));
      }

      if (form.assignHomework) {
        await Promise.all(form.homeworkClasses.map((classId) => {
          const existingHomework = latestSourceHomeworks.find((homework) => String(getHomeworkClassId(homework)) === String(classId));
          const homeworkPayload = {
            title: form.title,
            description: examPackageToHomeworkText(examPackage) || form.content,
            classId,
            lessonId: form.lesson || '',
            sourceExam: sourceExamId,
            examPackage,
            pdfAttachments: [],
            answerKey: examPackageToAnswerKey(examPackage) || form.solutionContent,
            maxScore: totals.totalPoints || 10,
            dueDate: form.homeworkDueDate || undefined,
          };
          return existingHomework?._id
            ? api.put(`/homeworks/${existingHomework._id}`, homeworkPayload)
            : api.post('/homeworks', homeworkPayload);
        }));
        toast.success(`Đã thêm vào phần Bài tập cho ${form.homeworkClasses.length} lớp`);
      }
      navigate('/admin/exams');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu đề');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/exams')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
          <FiArrowLeft size={16} /> Quay lại
        </button>
        <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Chỉnh sửa đề kiểm tra' : 'Tạo đề kiểm tra mới'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800">Thông tin đề</h2>
          {!isEdit && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <label className="mb-1 block text-sm font-medium text-emerald-900">Chọn đề từ ngân hàng</label>
              <select
                className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={selectedBankExamId}
                onChange={e => applyBankExam(e.target.value)}
              >
                <option value="">-- Tự tạo đề mới --</option>
                {examBank.map(exam => (
                  <option key={exam._id} value={exam._id}>{exam.title}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-emerald-700">
                Chọn một đề để sao chép nội dung, ma trận, đáp án và cấu trúc điểm. Lịch giao lớp sẽ để trống.
              </p>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tiêu đề đề *</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Danh sách khóa học</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.course}
                onChange={e => handleCourseChange(e.target.value)}
              >
                <option value="">-- Chọn khóa học --</option>
                {courses.map(course => <option key={course._id} value={course._id}>{course.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Chủ đề / Bài học</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.lesson}
                disabled={!form.course}
                onChange={e => handleLessonChange(e.target.value)}
              >
                <option value="">-- Chọn bài học --</option>
                {lessons.map(lesson => <option key={lesson._id} value={lesson._id}>{lesson.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cấp độ lớp</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.level}
                onChange={e => {
                  const levelId = e.target.value;
                  setForm(f => ({ ...f, level: levelId }));
                  const grade = extractGradeFromLevel(classLevels.find(level => level._id === levelId));
                  if (grade) updateCurriculumGrade(grade);
                }}
              >
                <option value="">-- Chọn cấp độ lớp --</option>
                {classLevels.map(level => <option key={level._id} value={level._id}>{level.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tổng số câu hỏi</label>
              <input
                type="number"
                min="1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.totalQuestions || totals.totalQuestions}
                onChange={e => setForm(f => ({ ...f, totalQuestions: e.target.value }))}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isTemplate}
                  onChange={e => setForm(f => ({ ...f, isTemplate: e.target.checked }))}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-gray-700">Lưu vào ngân hàng đề</span>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-emerald-900">
              <input
                type="checkbox"
                checked={form.assignHomework}
                onChange={e => setForm(f => ({ ...f, assignHomework: e.target.checked }))}
                className="h-4 w-4"
              />
              Thêm thành bài tập
            </label>
            {form.assignHomework && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-emerald-900">Giao cho lớp</span>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-emerald-300 bg-white p-2">
                    {classes.map(cls => (
                      <label key={cls._id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-emerald-50">
                        <input
                          type="checkbox"
                          checked={form.homeworkClasses.includes(cls._id)}
                          onChange={e => setForm(f => ({
                            ...f,
                            homeworkClasses: e.target.checked
                              ? [...f.homeworkClasses, cls._id]
                              : f.homeworkClasses.filter(id => id !== cls._id),
                          }))}
                          className="h-4 w-4"
                        />
                        {cls.name}
                      </label>
                    ))}
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-emerald-900">Hạn nộp</span>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm"
                    value={form.homeworkDueDate}
                    onChange={e => setForm(f => ({ ...f, homeworkDueDate: e.target.value }))}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-2">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Giao đề cho lớp học</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, classSchedules: [...f.classSchedules, { class: '', startDate: '', endDate: '' }] }))}
                className="flex items-center gap-1 rounded-lg border border-blue-300 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
              >
                <FiPlus size={13} /> Thêm lớp
              </button>
            </div>
            {form.classSchedules.length === 0 && <p className="text-xs italic text-gray-400">Chưa giao cho lớp nào (ngân hàng đề)</p>}
            <div className="space-y-3">
              {form.classSchedules.map((schedule, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <select
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      value={schedule.class}
                      onChange={e => {
                        const value = e.target.value;
                        setForm(f => {
                          const classSchedules = [...f.classSchedules];
                          classSchedules[index] = { ...classSchedules[index], class: value };
                          return { ...f, classSchedules };
                        });
                      }}
                    >
                      <option value="">-- Chọn lớp --</option>
                      {classes.map(cls => <option key={cls._id} value={cls._id}>{cls.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setForm(f => ({ ...f, classSchedules: f.classSchedules.filter((_, i) => i !== index) }))} className="rounded p-1.5 text-red-400 hover:bg-red-50">
                      <FiTrash2 size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="datetime-local"
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      value={schedule.startDate}
                      onChange={e => {
                        const value = e.target.value;
                        setForm(f => {
                          const classSchedules = [...f.classSchedules];
                          classSchedules[index] = { ...classSchedules[index], startDate: value };
                          return { ...f, classSchedules };
                        });
                      }}
                    />
                    <input
                      type="datetime-local"
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      value={schedule.endDate}
                      onChange={e => {
                        const value = e.target.value;
                        setForm(f => {
                          const classSchedules = [...f.classSchedules];
                          classSchedules[index] = { ...classSchedules[index], endDate: value };
                          return { ...f, classSchedules };
                        });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ghi chú</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800">Nội dung đề kiểm tra</h2>
          {form.examPackage?.questions ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                De nay duoc tao bang AI, noi dung hien thi/in se lay tu cac cau hoi ben duoi.
              </div>

              {(form.examPackage.questions.multipleChoice || []).length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Phan trac nghiem</h3>
                  {(form.examPackage.questions.multipleChoice || []).map((question, index) => (
                    <div key={question.id || index} className="space-y-3 rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-800">Cau {index + 1}</span>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          Diem
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                            value={question.points ?? ''}
                            onChange={e => updatePackageQuestion('multipleChoice', index, q => ({ ...q, points: Number(e.target.value) || 0 }))}
                          />
                        </label>
                      </div>
                      <textarea
                        className="min-h-[88px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={question.question || ''}
                        onChange={e => updatePackageQuestion('multipleChoice', index, q => ({ ...q, question: e.target.value }))}
                      />
                      <div className="grid gap-2 md:grid-cols-2">
                        {['A', 'B', 'C', 'D'].map(option => (
                          <label key={option} className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="w-5 font-semibold">{option}</span>
                            <input
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={question.options?.[option] || ''}
                              onChange={e => updatePackageQuestion('multipleChoice', index, q => ({
                                ...q,
                                options: { ...(q.options || {}), [option]: e.target.value },
                              }))}
                            />
                          </label>
                        ))}
                      </div>
                      <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                        <label className="text-sm text-gray-700">
                          Dap an
                          <select
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            value={question.answer || 'A'}
                            onChange={e => updatePackageQuestion('multipleChoice', index, q => ({ ...q, answer: e.target.value }))}
                          >
                            {['A', 'B', 'C', 'D'].map(option => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </label>
                        <label className="text-sm text-gray-700">
                          Loi giai
                          <textarea
                            className="mt-1 min-h-[72px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={question.explanation || ''}
                            onChange={e => updatePackageQuestion('multipleChoice', index, q => ({ ...q, explanation: e.target.value }))}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(form.examPackage.questions.essay || []).length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Phan tu luan</h3>
                  {(form.examPackage.questions.essay || []).map((question, index) => (
                    <div key={question.id || index} className="space-y-3 rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-800">Bai {index + 1}</span>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          Diem
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                            value={question.points ?? ''}
                            onChange={e => updatePackageQuestion('essay', index, q => ({ ...q, points: Number(e.target.value) || 0 }))}
                          />
                        </label>
                      </div>
                      <label className="text-sm text-gray-700">
                        De bai
                        <textarea
                          className="mt-1 min-h-[92px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={question.question || ''}
                          onChange={e => updatePackageQuestion('essay', index, q => ({ ...q, question: e.target.value }))}
                        />
                      </label>
                      <label className="text-sm text-gray-700">
                        Loi giai
                        <textarea
                          className="mt-1 min-h-[92px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={question.solution || ''}
                          onChange={e => updatePackageQuestion('essay', index, q => ({ ...q, solution: e.target.value }))}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <RichTextEditor
            value={form.content}
            onChange={html => setForm(f => ({ ...f, content: html }))}
            placeholder="Nhập nội dung đề kiểm tra. Dùng nút ƒx để chèn công thức toán..."
          />
          )}
        </div>

        <div className="space-y-3 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800">Lời giải / đáp án cho admin</h2>
          <RichTextEditor
            value={form.solutionContent}
            onChange={html => setForm(f => ({ ...f, solutionContent: html }))}
            placeholder="Nhập lời giải, đáp án hoặc hướng dẫn chấm. Phần này chỉ hiển thị cho admin, không hiện trong link phụ huynh."
          />
        </div>

        <div className="space-y-5 rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-800">Ma trận đề kiểm tra</h2>
              <p className="mt-1 text-xs text-gray-500">Ô trên là số câu, ô dưới là điểm để cấu trúc đề và hiển thị bản in.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                Lớp chương trình
                <select
                  value={curriculumGrade}
                  onChange={e => updateCurriculumGrade(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
                >
                  {(curriculumGradeOptions.length ? curriculumGradeOptions : [6, 7, 8, 9, 10, 11, 12]).map(grade => (
                    <option key={grade} value={grade}>Toán {grade}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={addMatrixRow} className="flex items-center gap-1 rounded-lg border border-blue-300 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50">
                <FiPlus /> Thêm dòng
              </button>
              <button type="button" onClick={resetMatrix} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                <FiRefreshCw /> Làm lại
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-blue-50">
                <tr>
                  <th rowSpan="2" className="border px-3 py-2 text-left">Chủ đề</th>
                  <th rowSpan="2" className="border px-3 py-2 text-left">Nội dung</th>
                  <th colSpan={cognitiveLevels.length} className="border px-3 py-2">TNKQ</th>
                  <th colSpan={cognitiveLevels.length} className="border px-3 py-2">Tự luận</th>
                  <th rowSpan="2" className="border px-3 py-2">Tổng câu</th>
                  <th rowSpan="2" className="border px-3 py-2">Tổng điểm</th>
                  <th rowSpan="2" className="border px-3 py-2">%</th>
                  <th rowSpan="2" className="border px-3 py-2"></th>
                </tr>
                <tr>
                  {cognitiveLevels.map(level => <th key={`tn-${level.key}`} className="border px-3 py-2">{level.name}</th>)}
                  {cognitiveLevels.map(level => <th key={`tl-${level.key}`} className="border px-3 py-2">{level.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {form.matrix.map((row, rowIndex) => {
                  const rt = rowTotals(row, cognitiveLevels);
                  const pct = totals.totalPoints > 0 ? round2((rt.points / totals.totalPoints) * 100) : 0;
                  const chapters = VN_MATH_CURRICULUM[curriculumGrade] || {};
                  const chapterNames = Object.keys(chapters);
                  const units = chapters[row.topic] || [];
                  return (
                    <tr key={rowIndex}>
                      <td className="border p-1">
                        <select
                          className="w-48 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
                          value={row.topic}
                          onChange={e => updateMatrixTopic(rowIndex, e.target.value)}
                        >
                          {!chapterNames.includes(row.topic) && <option value={row.topic}>{row.topic}</option>}
                          {chapterNames.map(chapter => (
                            <option key={chapter} value={chapter}>{chapter}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border p-1">
                        <select
                          className="w-56 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
                          value={row.unit}
                          onChange={e => updateMatrixUnit(rowIndex, e.target.value)}
                        >
                          {!units.includes(row.unit) && <option value={row.unit}>{row.unit}</option>}
                          {units.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </td>
                      {cognitiveLevels.map(level => (
                        <td key={`tn-${level.key}`} className="border p-1">
                          <CellInput value={row.tn?.[level.key]} onChange={value => updateMatrixCell(rowIndex, 'tn', level.key, value)} />
                        </td>
                      ))}
                      {cognitiveLevels.map(level => (
                        <td key={`tl-${level.key}`} className="border p-1">
                          <CellInput value={row.tl?.[level.key]} onChange={value => updateMatrixCell(rowIndex, 'tl', level.key, value)} />
                        </td>
                      ))}
                      <td className="border px-3 py-2 text-center font-bold">{rt.count}</td>
                      <td className="border px-3 py-2 text-center font-bold">{pointText(rt.points)}đ</td>
                      <td className="border px-3 py-2 text-center">{pointText(pct)}%</td>
                      <td className="border px-2 py-2 text-center">
                        <button type="button" onClick={() => removeMatrixRow(rowIndex)} className="rounded p-1 text-red-500 hover:bg-red-50">
                          <FiTrash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-blue-50 font-bold">
                <tr>
                  <td colSpan="2" className="border px-3 py-2">Tổng</td>
                  {cognitiveLevels.map(level => <td key={`sum-tn-${level.key}`} className="border px-3 py-2 text-center">{totals.tn[level.key]?.count || 0} ({pointText(totals.tn[level.key]?.points || 0)}đ)</td>)}
                  {cognitiveLevels.map(level => <td key={`sum-tl-${level.key}`} className="border px-3 py-2 text-center">{totals.tl[level.key]?.count || 0} ({pointText(totals.tl[level.key]?.points || 0)}đ)</td>)}
                  <td className="border px-3 py-2 text-center">{totals.totalQuestions}</td>
                  <td className="border px-3 py-2 text-center">{pointText(totals.totalPoints)}đ</td>
                  <td className="border px-3 py-2 text-center">100%</td>
                  <td className="border"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex gap-3 pb-8">
          <button type="button" onClick={() => navigate('/admin/exams')} className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Hủy
          </button>
          <button disabled={loading} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            <FiSave size={15} />
            {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật đề' : 'Tạo đề'}
          </button>
        </div>
      </form>
    </div>
  );
}
