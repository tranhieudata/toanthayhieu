import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import api from '../../api/axios';
import fallbackCurriculum from '../../utils/vnMathCurriculum';
import { FiArrowLeft, FiArrowRight, FiCheck, FiDownload, FiPrinter, FiRefreshCw, FiSave, FiZap } from 'react-icons/fi';

const DEFAULT_LEVELS = [
  { key: 'NB', name: 'Nhận biết' },
  { key: 'TH', name: 'Thông hiểu' },
  { key: 'VD', name: 'Vận dụng' },
  { key: 'VDC', name: 'Vận dụng cao' },
];
const STEPS = [
  { id: 1, label: 'Thông tin' },
  { id: 2, label: 'Chủ đề' },
  { id: 3, label: 'Cấu hình' },
  { id: 4, label: 'Ma trận' },
  { id: 5, label: 'Xuất file' },
];

const defaultForm = {
  department: '',
  schoolName: 'Toán Thầy Hiếu - 038.2468988',
  schoolYear: '2025 - 2026',
  examName: 'KIỂM TRA CUỐI HỌC KÌ I',
  grade: 6,
  duration: 90,
  mcCount: 12,
  essayCount: 4,
  mcPoints: 3,
  essayPoints: 7,
};

const round2 = (value) => Number((Number(value) || 0).toFixed(2));
const pointText = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function distribute(total, slots) {
  if (total <= 0 || slots.length === 0) return slots.map(() => 0);
  const weighted = slots.map((slot, index) => {
    const raw = total * slot.weight;
    return { index, value: Math.floor(raw), remain: raw - Math.floor(raw) };
  });
  let used = weighted.reduce((sum, item) => sum + item.value, 0);
  weighted.sort((a, b) => b.remain - a.remain);
  for (let i = 0; used < total; i += 1) {
    weighted[i % weighted.length].value += 1;
    used += 1;
  }
  return weighted.sort((a, b) => a.index - b.index).map(item => item.value);
}

function levelKeys(levels) {
  return levels.map(level => level.key);
}

function emptyCells(levels = DEFAULT_LEVELS) {
  return Object.fromEntries(levelKeys(levels).map(level => [level, { count: 0, points: 0 }]));
}

function createMatrix(selectedUnits, config, levels = DEFAULT_LEVELS) {
  const keys = levelKeys(levels);
  const rows = selectedUnits.map(item => ({
    topic: item.chapter,
    unit: item.unit,
    tn: emptyCells(levels),
    tl: emptyCells(levels),
  }));
  if (rows.length === 0) return rows;

  const mcSlots = [];
  const essaySlots = [];
  const mcBaseWeights = [0.4, 0.35, 0.2, 0.05];
  const essayBaseWeights = [0, 0.15, 0.65, 0.2];
  rows.forEach((_, rowIndex) => {
    keys.forEach((level, idx) => {
      mcSlots.push({ rowIndex, level, weight: (mcBaseWeights[idx] ?? (1 / keys.length)) / rows.length });
      essaySlots.push({ rowIndex, level, weight: (essayBaseWeights[idx] ?? (1 / keys.length)) / rows.length });
    });
  });

  const mcPoint = Number(config.mcCount) > 0 ? Number(config.mcPoints) / Number(config.mcCount) : 0;
  const essayPoint = Number(config.essayCount) > 0 ? Number(config.essayPoints) / Number(config.essayCount) : 0;

  distribute(Number(config.mcCount) || 0, mcSlots).forEach((count, idx) => {
    const slot = mcSlots[idx];
    rows[slot.rowIndex].tn[slot.level] = { count, points: round2(count * mcPoint) };
  });
  distribute(Number(config.essayCount) || 0, essaySlots).forEach((count, idx) => {
    const slot = essaySlots[idx];
    rows[slot.rowIndex].tl[slot.level] = { count, points: round2(count * essayPoint) };
  });

  return rows;
}

function matrixTotals(matrix, levels = DEFAULT_LEVELS) {
  const keys = levelKeys(levels);
  const total = {
    tn: Object.fromEntries(keys.map(level => [level, { count: 0, points: 0 }])),
    tl: Object.fromEntries(keys.map(level => [level, { count: 0, points: 0 }])),
    mcCount: 0,
    essayCount: 0,
    totalQuestions: 0,
    totalPoints: 0,
  };

  matrix.forEach(row => {
    keys.forEach(level => {
      total.tn[level].count += Number(row.tn[level]?.count) || 0;
      total.tn[level].points = round2(total.tn[level].points + (Number(row.tn[level]?.points) || 0));
      total.tl[level].count += Number(row.tl[level]?.count) || 0;
      total.tl[level].points = round2(total.tl[level].points + (Number(row.tl[level]?.points) || 0));
    });
  });

  total.mcCount = keys.reduce((sum, level) => sum + total.tn[level].count, 0);
  total.essayCount = keys.reduce((sum, level) => sum + total.tl[level].count, 0);
  total.totalQuestions = total.mcCount + total.essayCount;
  total.totalPoints = round2(
    keys.reduce((sum, level) => sum + total.tn[level].points + total.tl[level].points, 0)
  );
  return total;
}

function rowTotals(row, levels = DEFAULT_LEVELS) {
  const keys = levelKeys(levels);
  const count = keys.reduce((sum, level) => sum + (Number(row.tn[level]?.count) || 0) + (Number(row.tl[level]?.count) || 0), 0);
  const points = round2(keys.reduce((sum, level) => sum + (Number(row.tn[level]?.points) || 0) + (Number(row.tl[level]?.points) || 0), 0));
  return { count, points };
}

function renderMathText(text) {
  const source = String(text || '');
  const parts = source.split(/(\\\(.+?\\\)|\$\$.+?\$\$|\$.+?\$)/g);
  return parts.map((part, idx) => {
    const display = part.startsWith('$$') && part.endsWith('$$');
    const inlineParen = part.startsWith('\\(') && part.endsWith('\\)');
    const inlineDollar = part.startsWith('$') && part.endsWith('$') && !display;
    if (!display && !inlineParen && !inlineDollar) return <span key={idx}>{part}</span>;
    const tex = display ? part.slice(2, -2) : inlineParen ? part.slice(2, -2) : part.slice(1, -1);
    try {
      return <span key={idx} dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { displayMode: display, throwOnError: false }) }} />;
    } catch {
      return <span key={idx}>{part}</span>;
    }
  });
}

function CellInput({ value, onChange }) {
  return (
    <div className="space-y-1">
      <input
        type="number"
        min="0"
        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-center font-semibold"
        value={value.count}
        onChange={e => onChange({ ...value, count: Math.max(0, Number(e.target.value) || 0) })}
      />
      <input
        type="number"
        min="0"
        step="0.25"
        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-center text-blue-700"
        value={value.points}
        onChange={e => onChange({ ...value, points: Math.max(0, Number(e.target.value) || 0) })}
      />
    </div>
  );
}

export default function AdminExamComposer({ onSaved }) {
  const initialChapter = Object.keys(fallbackCurriculum[6] || {})[0] || '';
  const initialUnits = initialChapter
    ? fallbackCurriculum[6][initialChapter].slice(0, 6).map(unit => ({ chapter: initialChapter, unit }))
    : [];

  const [step, setStep] = useState(1);
  const [curriculum, setCurriculum] = useState(fallbackCurriculum);
  const [cognitiveLevels, setCognitiveLevels] = useState(DEFAULT_LEVELS);
  const [form, setForm] = useState(defaultForm);
  const [selectedUnits, setSelectedUnits] = useState(initialUnits);
  const [matrix, setMatrix] = useState(() => createMatrix(initialUnits, defaultForm));
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/exams/paper/curriculum')
      .then(({ data }) => {
        if (data && Object.keys(data).length > 0) setCurriculum(data);
      })
      .catch((err) => {
        console.warn('Không tải được mục lục từ backend, dùng dữ liệu dự phòng:', err.response?.status || err.message);
      });
    api.get('/settings')
      .then(({ data }) => {
        const levels = (data.difficultyLevels || [])
          .filter(level => level?.name?.trim())
          .map((level, index) => ({
            key: level.key || level.code || level.name.trim(),
            name: level.name.trim(),
            bgColor: level.bgColor,
            textColor: level.textColor,
          }));
        if (levels.length > 0) {
          setCognitiveLevels(levels);
          setMatrix(createMatrix(initialUnits, defaultForm, levels));
        }
      })
      .catch(() => {});
  }, []);

  const chapters = curriculum?.[form.grade] || {};
  const totals = useMemo(() => matrixTotals(matrix, cognitiveLevels), [matrix, cognitiveLevels]);
  const targetPoints = round2(Number(form.mcPoints) + Number(form.essayPoints));

  const updateForm = (field, value) => {
    const next = { ...form, [field]: value };
    setForm(next);
    if (['mcCount', 'essayCount', 'mcPoints', 'essayPoints'].includes(field)) {
      setMatrix(createMatrix(selectedUnits, next, cognitiveLevels));
      setPaper(null);
    }
    if (field === 'grade') {
      setSelectedUnits([]);
      setMatrix([]);
      setPaper(null);
    }
  };

  const toggleUnit = (chapter, unit) => {
    const exists = selectedUnits.some(item => item.chapter === chapter && item.unit === unit);
    const next = exists
      ? selectedUnits.filter(item => !(item.chapter === chapter && item.unit === unit))
      : [...selectedUnits, { chapter, unit }];
    setSelectedUnits(next);
    setMatrix(createMatrix(next, form, cognitiveLevels));
    setPaper(null);
  };

  const toggleChapter = (chapter, units) => {
    const allSelected = units.every(unit => selectedUnits.some(item => item.chapter === chapter && item.unit === unit));
    const withoutChapter = selectedUnits.filter(item => item.chapter !== chapter);
    const next = allSelected ? withoutChapter : [...withoutChapter, ...units.map(unit => ({ chapter, unit }))];
    setSelectedUnits(next);
    setMatrix(createMatrix(next, form, cognitiveLevels));
    setPaper(null);
  };

  const updateMatrixCell = (rowIndex, type, level, value) => {
    setMatrix(prev => prev.map((row, idx) => {
      if (idx !== rowIndex) return row;
      return {
        ...row,
        [type]: {
          ...row[type],
          [level]: { count: Number(value.count) || 0, points: round2(value.points) },
        },
      };
    }));
    setPaper(null);
  };

  const resetMatrix = () => {
    setMatrix(createMatrix(selectedUnits, form, cognitiveLevels));
    setPaper(null);
  };

  const validateStep = (nextStep = step + 1) => {
    if (nextStep > 1 && !form.schoolName.trim()) return 'Vui lòng nhập tên trường';
    if (nextStep > 1 && !form.examName.trim()) return 'Vui lòng nhập tên kỳ kiểm tra';
    if (nextStep > 2 && selectedUnits.length === 0) return 'Vui lòng chọn ít nhất một chủ đề';
    if (nextStep > 4) {
      if (totals.mcCount !== Number(form.mcCount)) return `Ma trận đang có ${totals.mcCount}/${form.mcCount} câu trắc nghiệm`;
      if (totals.essayCount !== Number(form.essayCount)) return `Ma trận đang có ${totals.essayCount}/${form.essayCount} câu tự luận`;
      if (Math.abs(totals.totalPoints - targetPoints) > 0.01) return `Tổng điểm ma trận đang là ${pointText(totals.totalPoints)}/${pointText(targetPoints)} điểm`;
    }
    return '';
  };

  const goNext = () => {
    const error = validateStep(step + 1);
    if (error) return toast.error(error);
    setStep(prev => Math.min(5, prev + 1));
  };

  const generatePaper = async () => {
    const error = validateStep(5);
    if (error) return toast.error(error);
    setLoading(true);
    try {
      const { data } = await api.post('/exams/paper/generate', { ...form, matrix, cognitiveLevels });
      setPaper(data);
      setStep(5);
      if (data.source === 'ai') toast.success('Đã sinh bộ đề bằng AI');
      else toast.error(data.aiWarning ? `AI chưa sinh được đề: ${data.aiWarning}` : 'AI chưa sinh được đề, đang dùng đề dự phòng');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không sinh được đề');
    } finally {
      setLoading(false);
    }
  };

  const savePaper = async () => {
    if (!paper) return toast.error('Hãy sinh đề trước khi lưu');
    setSaving(true);
    try {
      await api.post('/exams/paper/save', { paper });
      toast.success('Đã lưu vào ngân hàng đề');
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không lưu được đề');
    } finally {
      setSaving(false);
    }
  };

  const downloadDocx = async () => {
    if (!paper) return toast.error('Hãy sinh đề trước khi tải Word');
    try {
      const res = await api.post('/exams/paper/export', { paper }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `de-kiem-tra-toan-${paper.meta.grade}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Không xuất được file Word');
    }
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .exam-print-root, .exam-print-root * { visibility: visible; }
          .exam-print-root { position: absolute; left: 0; top: 0; width: 100%; background: white; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-center gap-4 py-2">
        {STEPS.map((item, index) => {
          const done = step > item.id;
          const active = step === item.id;
          return (
            <div key={item.id} className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setStep(item.id)}
                className="flex flex-col items-center gap-2"
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {done ? <FiCheck /> : item.id}
                </span>
                <span className={`text-sm ${active ? 'text-blue-700 font-medium' : done ? 'text-emerald-600' : 'text-gray-500'}`}>{item.label}</span>
              </button>
              {index < STEPS.length - 1 && <div className={`h-px w-16 ${step > item.id ? 'bg-emerald-400' : 'bg-gray-300'}`} />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="no-print rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-bold text-gray-900">Thông tin đề kiểm tra</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Tên trường / đơn vị</span>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.schoolName} onChange={e => updateForm('schoolName', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Phòng/UBND</span>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.department} onChange={e => updateForm('department', e.target.value)} placeholder="UBND..." />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Lớp</span>
              <select className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.grade} onChange={e => updateForm('grade', Number(e.target.value))}>
                {[6, 7, 8, 9, 10, 11, 12].map(grade => <option key={grade} value={grade}>Toán {grade}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Năm học</span>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.schoolYear} onChange={e => updateForm('schoolYear', e.target.value)} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Tên kỳ kiểm tra</span>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.examName} onChange={e => updateForm('examName', e.target.value)} />
            </label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="no-print rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Chọn chủ đề kiểm tra - Toán {form.grade}</h2>
          <p className="mt-3 text-sm text-gray-500">Đã chọn {selectedUnits.length} chủ đề</p>
          <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-2">
            {Object.entries(chapters).map(([chapter, units]) => {
              const selectedCount = units.filter(unit => selectedUnits.some(item => item.chapter === chapter && item.unit === unit)).length;
              const allSelected = selectedCount === units.length;
              return (
                <div key={chapter} className="rounded-xl border border-gray-200 p-4">
                  <label className="flex cursor-pointer items-center gap-3 font-semibold text-gray-900">
                    <input type="checkbox" checked={allSelected} onChange={() => toggleChapter(chapter, units)} className="h-4 w-4 rounded border-gray-300" />
                    {chapter}
                    {selectedCount > 0 && <span className="text-xs font-medium text-blue-600">({selectedCount}/{units.length})</span>}
                  </label>
                  <div className="mt-3 space-y-2 pl-7">
                    {units.map(unit => {
                      const checked = selectedUnits.some(item => item.chapter === chapter && item.unit === unit);
                      return (
                        <label key={unit} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={checked} onChange={() => toggleUnit(chapter, unit)} className="h-4 w-4 rounded border-gray-300" />
                          {unit}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="no-print mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-gray-900">Cấu hình đề kiểm tra</h2>
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 p-5">
              <h3 className="mb-4 font-bold text-gray-900">Phần trắc nghiệm</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm">Số câu trắc nghiệm</span>
                  <input type="number" min="0" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.mcCount} onChange={e => updateForm('mcCount', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm">Tổng điểm TN</span>
                  <input type="number" min="0" step="0.25" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.mcPoints} onChange={e => updateForm('mcPoints', e.target.value)} />
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-5">
              <h3 className="mb-4 font-bold text-gray-900">Phần tự luận</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm">Số câu tự luận</span>
                  <input type="number" min="0" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.essayCount} onChange={e => updateForm('essayCount', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm">Tổng điểm TL</span>
                  <input type="number" min="0" step="0.25" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.essayPoints} onChange={e => updateForm('essayPoints', e.target.value)} />
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-5">
              <h3 className="mb-4 font-bold text-gray-900">Thông tin khác</h3>
              <label className="space-y-1">
                <span className="text-sm">Thời gian làm bài (phút)</span>
                <input type="number" min="0" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.duration} onChange={e => updateForm('duration', e.target.value)} />
              </label>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-center text-gray-600">
              Tổng điểm: <span className="ml-2 text-2xl font-bold text-emerald-600">{pointText(targetPoints)} điểm</span>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="no-print rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Ma trận đề kiểm tra</h2>
              <p className="mt-2 text-sm text-gray-500">Bạn có thể chỉnh sửa số câu và điểm cho từng ô trong ma trận.</p>
            </div>
            <button type="button" onClick={resetMatrix} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">
              <FiRefreshCw /> Chia lại
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-blue-50">
                <tr>
                  <th rowSpan="2" className="border px-3 py-2 text-left">Chủ đề</th>
                  <th colSpan={cognitiveLevels.length} className="border px-3 py-2">TNKQ</th>
                  <th colSpan={cognitiveLevels.length} className="border px-3 py-2">Tự luận</th>
                  <th rowSpan="2" className="border px-3 py-2">Tổng câu</th>
                  <th rowSpan="2" className="border px-3 py-2">Tổng điểm</th>
                  <th rowSpan="2" className="border px-3 py-2">%</th>
                </tr>
                <tr>
                  {cognitiveLevels.map(level => <th key={`tn-${level.key}`} className="border px-3 py-2">{level.name}</th>)}
                  {cognitiveLevels.map(level => <th key={`tl-${level.key}`} className="border px-3 py-2">{level.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, rowIndex) => {
                  const rt = rowTotals(row, cognitiveLevels);
                  const pct = targetPoints > 0 ? round2((rt.points / targetPoints) * 100) : 0;
                  return (
                    <tr key={`${row.topic}-${row.unit}`}>
                      <td className="min-w-48 border px-3 py-2">{row.unit}</td>
                      {cognitiveLevels.map(level => (
                        <td key={`tn-${level.key}`} className="border p-1">
                          <CellInput value={row.tn[level.key] || { count: 0, points: 0 }} onChange={value => updateMatrixCell(rowIndex, 'tn', level.key, value)} />
                        </td>
                      ))}
                      {cognitiveLevels.map(level => (
                        <td key={`tl-${level.key}`} className="border p-1">
                          <CellInput value={row.tl[level.key] || { count: 0, points: 0 }} onChange={value => updateMatrixCell(rowIndex, 'tl', level.key, value)} />
                        </td>
                      ))}
                      <td className="border px-3 py-2 text-center font-bold">{rt.count}</td>
                      <td className="border px-3 py-2 text-center font-bold">{pointText(rt.points)}đ</td>
                      <td className="border px-3 py-2 text-center">{pointText(pct)}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-blue-50 font-bold">
                <tr>
                  <td className="border px-3 py-2">Tổng</td>
                  {cognitiveLevels.map(level => <td key={`sum-tn-${level.key}`} className="border px-3 py-2 text-center">{totals.tn[level.key]?.count || 0} ({pointText(totals.tn[level.key]?.points || 0)}đ)</td>)}
                  {cognitiveLevels.map(level => <td key={`sum-tl-${level.key}`} className="border px-3 py-2 text-center">{totals.tl[level.key]?.count || 0} ({pointText(totals.tl[level.key]?.points || 0)}đ)</td>)}
                  <td className="border px-3 py-2 text-center">{totals.totalQuestions}</td>
                  <td className="border px-3 py-2 text-center">{pointText(totals.totalPoints)}đ</td>
                  <td className="border px-3 py-2 text-center">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">Gợi ý: ô trên là số câu, ô dưới là điểm.</p>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-5">
          <div className="no-print flex flex-wrap gap-3">
            <button onClick={generatePaper} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60">
              <FiZap /> {loading ? 'Đang sinh đề...' : paper ? 'Sinh lại đề bằng AI' : 'Sinh đề bằng AI'}
            </button>
            <button onClick={savePaper} disabled={!paper || saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60">
              <FiSave /> {saving ? 'Đang lưu...' : 'Lưu vào ngân hàng đề'}
            </button>
            <button onClick={downloadDocx} disabled={!paper} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50">
              <FiDownload /> Tải Word
            </button>
            <button onClick={() => window.print()} disabled={!paper} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50">
              <FiPrinter /> In đề
            </button>
          </div>

          {!paper ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              Nhấn “Sinh đề bằng AI” để tạo đề kiểm tra, đáp án và file Word.
            </div>
          ) : (
            <div className="exam-print-root rounded-xl bg-white p-6 shadow-sm">
              {paper.source === 'fallback' && (
                <div className="no-print mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                  AI chưa sinh được đề thật. Hệ thống đang hiển thị đề dự phòng có nội dung Toán cụ thể. Kiểm tra GEMINI_API_KEY ở backend rồi sinh lại.
                </div>
              )}
              <section className="border-b pb-4 text-center">
                <p className="font-bold">{paper.meta.schoolName}</p>
                <h2 className="mt-2 text-xl font-bold">{paper.meta.examName}</h2>
                <p>Năm học: {paper.meta.schoolYear} - Môn Toán - Lớp {paper.meta.grade}</p>
                {paper.meta.duration && <p>Thời gian: {paper.meta.duration} phút</p>}
              </section>
              <section className="mt-5">
                <h3 className="mb-2 font-bold">I. Phần trắc nghiệm ({paper.meta.mcPoints} điểm)</h3>
                <div className="space-y-3">
                  {paper.questions.multipleChoice.map(q => (
                    <div key={q.number}>
                      <p><strong>Câu {q.number}.</strong> {renderMathText(q.question)}</p>
                      <div className="mt-1 grid grid-cols-1 gap-x-6 text-sm md:grid-cols-2">
                        {['A', 'B', 'C', 'D'].map(opt => <p key={opt}>{opt}. {renderMathText(q.options?.[opt])}</p>)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="mt-5">
                <h3 className="mb-2 font-bold">II. Phần tự luận ({paper.meta.essayPoints} điểm)</h3>
                <div className="space-y-3">
                  {paper.questions.essay.map((q, idx) => (
                    <p key={q.number}><strong>Bài {idx + 1}. ({pointText(q.points)} điểm)</strong> {renderMathText(q.question)}</p>
                  ))}
                </div>
              </section>
              <section className="no-print mt-5 border-t pt-4 text-sm">
                <h3 className="mb-2 font-bold">Đáp án nhanh</h3>
                <p>Trắc nghiệm: {paper.questions.multipleChoice.map(q => `${q.number}${q.answer}`).join(' - ')}</p>
                <div className="mt-3 space-y-2">
                  {paper.questions.essay.map((q, idx) => (
                    <div key={q.number}>
                      <p className="font-medium">Bài {idx + 1}</p>
                      <p>{renderMathText(q.solution)}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      <div className="no-print flex items-center justify-between">
        <button type="button" onClick={() => setStep(prev => Math.max(1, prev - 1))} disabled={step === 1} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <FiArrowLeft /> Quay lại
        </button>
        {step < 5 ? (
          <button type="button" onClick={goNext} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700">
            Tiếp tục <FiArrowRight />
          </button>
        ) : null}
      </div>
    </div>
  );
}
