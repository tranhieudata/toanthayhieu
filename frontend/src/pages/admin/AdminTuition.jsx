import { useState, useEffect, useCallback, useRef } from 'react';
import api, { getUploadUrl } from '../../api/axios';
import toast from 'react-hot-toast';
import { FiSave, FiSettings, FiDollarSign, FiUsers, FiCalendar, FiInfo, FiPrinter, FiX } from 'react-icons/fi';

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

function countSessionsInMonth(schedules, month, year) {
  if (!schedules || schedules.length === 0) return 0;
  const daysOfWeek = schedules.map((s) => s.dayOfWeek); // 0=Sun,1=Mon,...
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let count = 0;
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (daysOfWeek.includes(d.getDay())) count++;
  }
  return count;
}

function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export default function AdminTuition() {
  const now = new Date();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [classData, setClassData] = useState(null);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Fee settings
  const [feePerSession, setFeePerSession] = useState(0);
  const [editFeeInput, setEditFeeInput] = useState('');
  const [showFeeEdit, setShowFeeEdit] = useState(false);

  // Tuition record state
  const [totalSessions, setTotalSessions] = useState(0);
  const [holidaySessions, setHolidaySessions] = useState(0);
  const [recordNote, setRecordNote] = useState('');
  const [studentAdjustments, setStudentAdjustments] = useState([]);
  const [existingRecordId, setExistingRecordId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Site settings (for receipt)
  const [siteSettings, setSiteSettings] = useState({ schoolName: '', bankName: '', bankAccountNumber: '', bankAccountName: '', bankQrImageUrl: '', receiptNote: '' });

  // Receipt modal
  const [receiptAdj, setReceiptAdj] = useState(null);
  const printRef = useRef();

  // All-class receipt modal
  const [showAllReceipt, setShowAllReceipt] = useState(false);
  const [allReceiptMode, setAllReceiptMode] = useState('compact');
  const printAllRef = useRef();

  // Load classes + settings
  useEffect(() => {
    api.get('/classes').then((r) => setClasses(r.data || [])).catch(() => toast.error('Không tải được danh sách lớp'));
    api.get('/settings').then((r) => setSiteSettings(r.data)).catch(() => {});
  }, []);

  // Load class detail + existing tuition record when selection changes
  const loadRecord = useCallback(async () => {
    if (!selectedClass) { setClassData(null); return; }
    try {
      const { data: cls } = await api.get(`/classes/${selectedClass}`);
      setClassData(cls);
      const fee = cls.feePerSession || 0;
      setFeePerSession(fee);
      setEditFeeInput(String(fee));
      const calc = countSessionsInMonth(cls.schedules, month, year);
      setTotalSessions(calc);

      // load existing record
      const { data: record } = await api.get(`/tuition?classId=${selectedClass}&month=${month}&year=${year}`);
      if (record) {
        setExistingRecordId(record._id);
        setTotalSessions(record.totalSessions);
        setHolidaySessions(record.holidaySessions);
        setFeePerSession(record.feePerSession);
        setEditFeeInput(String(record.feePerSession));
        setRecordNote(record.note || '');
        // map adjustments
        const adjMap = {};
        (record.studentAdjustments || []).forEach((a) => {
          adjMap[a.student._id || a.student] = a;
        });
        
        setStudentAdjustments(
          (cls.students || []).map((s) => {
            const sid = s._id || s;
            const adj = adjMap[sid] || {};
            return { student: sid, name: s.name || '', email: s.email || '', absentSessions: adj.absentSessions || 0, extraSessions: adj.extraSessions || 0, note: adj.note || '' };
          })
        );
      } else {
        setExistingRecordId(null);
        setHolidaySessions(0);
        setRecordNote('');
        setStudentAdjustments(
          (cls.students || []).map((s) => ({ student: s._id || s, name: s.name || '', email: s.email || '', absentSessions: 0, extraSessions: 0, note: '' }))
        );
      }
    } catch (err) {
      toast.error('Lỗi tải dữ liệu: ' + (err.response?.data?.message || err.message));
    }
  }, [selectedClass, month, year]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  const effectiveSessions = Math.max(0, totalSessions - holidaySessions);

  const calcStudentFee = (adj) => {
    const sessions = Math.max(0, effectiveSessions - adj.absentSessions + adj.extraSessions);
    return sessions * feePerSession;
  };

  const totalRevenue = studentAdjustments.reduce((sum, a) => sum + calcStudentFee(a), 0);
  const allReceiptBaseFee = effectiveSessions * feePerSession;

  const handleAdjChange = (idx, field, value) => {
    setStudentAdjustments((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === 'note' ? value : Math.max(0, Number(value) || 0) };
      return next;
    });
  };

  const handleSaveFee = async () => {
    try {
      await api.patch('/tuition/class-fee', { classId: selectedClass, feePerSession: Number(editFeeInput) });
      setFeePerSession(Number(editFeeInput));
      setShowFeeEdit(false);
      toast.success('Đã cập nhật học phí/buổi cho lớp');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật');
    }
  };

  const handleSaveRecord = async () => {
    if (!selectedClass) return toast.error('Chưa chọn lớp');
    setSaving(true);
    try {
      await api.post('/tuition', {
        classId: selectedClass,
        month,
        year,
        totalSessions,
        holidaySessions,
        feePerSession,
        studentAdjustments: studentAdjustments.map((a) => ({ student: a.student, absentSessions: a.absentSessions, extraSessions: a.extraSessions, note: a.note })),
        note: recordNote,
      });
      toast.success('Đã lưu bảng học phí tháng ' + month + '/' + year);
      await loadRecord();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintAll = () => {
    if (!studentAdjustments.length) return toast.error('Chưa có học sinh trong lớp');
    setAllReceiptMode('compact');
    setShowAllReceipt(true);
  };

  const handlePrintAllWindow = () => {
    const el = printAllRef.current;
    if (!el) return;
    const w = window.open('', '_blank', 'width=960,height=750');
    w.document.write(`<html><head><title>Học phí cả lớp ${classData?.name} - Tháng ${month}/${year}</title><style>
      body{font-family:Arial,sans-serif;padding:28px;font-size:13px;color:#222}
      h2{text-align:center;margin:0 0 2px;font-size:18px}
      p{margin:2px 0}
      .meta{display:flex;flex-wrap:wrap;justify-content:center;gap:20px;font-size:12px;color:#666;margin:8px 0 16px}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th{padding:8px 10px;border:1px solid #d1d5db;font-size:12px;text-align:left;background:#f3f4f6}
      td{padding:7px 10px;border:1px solid #e5e7eb;vertical-align:middle}
      tbody tr:nth-child(even){background:#fafafa}
      tfoot td{border:1px solid #d1d5db;font-weight:bold;background:#f3f4f6;padding:8px 10px}
      .qr-row{display:flex;gap:20px;align-items:flex-start;margin-top:16px;padding-top:14px;border-top:1px dashed #ccc}
      .qr-row img{width:110px;height:110px;object-fit:contain}
      .bank{font-size:12px;color:#555}
      .sig{display:flex;justify-content:flex-end;margin-top:28px;font-size:12px;color:#555;text-align:center}
      .sig div{min-width:160px}
      .summary{max-width:520px;margin:0 auto 8px}
      .summary td:first-child{color:#555}
      .summary td:last-child{text-align:right;font-weight:bold}
      @media print{body{padding:16px}}
    </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FiDollarSign className="text-green-600" /> Tính học phí</h1>
      </div>

      {/* Selectors */}
      <div className="bg-white rounded-xl shadow-sm p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lớp học</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            <option value="">-- Chọn lớp --</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tháng</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Năm</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {classData && (
        
        <>
       
          {/* Class info + fee per session */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FiSettings /> Cài đặt lớp: {classData.name}</h2>
            </div>
            <div className="flex flex-wrap gap-4 items-center text-sm text-gray-600">
              <span className="flex items-center gap-1"><FiCalendar /> Lịch học:&nbsp;
                {classData.schedules && classData.schedules.length > 0
                  ? classData.schedules.map((s) => `${DAY_NAMES[s.dayOfWeek]} ${s.startTime || ''}`).join(', ')
                  : 'Chưa có lịch'}
              </span>
              <span className="flex items-center gap-1"><FiUsers /> Sĩ số: {studentAdjustments.length || 0} học sinh</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Học phí / buổi:</span>
              {showFeeEdit ? (
                <>
                  <input type="number" min="0" className="border border-gray-300 rounded px-2 py-1 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" value={editFeeInput} onChange={(e) => setEditFeeInput(e.target.value)} />
                  <button onClick={handleSaveFee} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700">Lưu</button>
                  <button onClick={() => setShowFeeEdit(false)} className="text-xs text-gray-500 hover:text-gray-800">Hủy</button>
                </>
              ) : (
                <>
                  <span className="font-bold text-green-700 text-lg">{formatVND(feePerSession)}</span>
                  {/* <button onClick={() => setShowFeeEdit(true)} className="text-xs text-blue-600 underline hover:text-blue-800">Sửa</button> */}
                </>
              )}
            </div>
          </div>

          {/* Session count */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><FiCalendar /> Số buổi trong tháng {month}/{year}</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tổng buổi (tự tính theo lịch)</label>
                <input type="number" min="0" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" value={totalSessions} onChange={(e) => setTotalSessions(Math.max(0, Number(e.target.value)))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ngày nghỉ lễ / cả lớp nghỉ</label>
                <input type="number" min="0" max={totalSessions} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" value={holidaySessions} onChange={(e) => setHolidaySessions(Math.min(totalSessions, Math.max(0, Number(e.target.value))))} />
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">Buổi thực học</div>
                <div className="text-2xl font-bold text-blue-700">{effectiveSessions}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">Phí cơ bản / học sinh</div>
                <div className="text-xl font-bold text-green-700">{formatVND(effectiveSessions * feePerSession)}</div>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs text-gray-500 mb-1">Ghi chú bảng học phí</label>
              <input type="text" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="VD: Tháng 3 có 1 buổi nghỉ lễ 8/3..." value={recordNote} onChange={(e) => setRecordNote(e.target.value)} />
            </div>
          </div>

          {/* Per-student table */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FiUsers /> Học phí từng học sinh</h2>
              <div className="text-sm text-gray-500 flex items-center gap-1"><FiInfo /> Điều chỉnh vắng / bổ sung riêng cho từng bạn</div>
            </div>

            {studentAdjustments.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Chưa có học sinh trong lớp</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="pb-3 pr-4 font-medium">Học sinh</th>
                      <th className="pb-3 px-4 font-medium text-center w-32">Vắng thêm<br/><span className="text-xs font-normal text-gray-400">(buổi)</span></th>
                      <th className="pb-3 px-4 font-medium text-center w-32">Học bù / thêm<br/><span className="text-xs font-normal text-gray-400">(buổi)</span></th>
                      <th className="pb-3 px-4 font-medium text-center w-24">Buổi thực</th>
                      <th className="pb-3 px-4 font-medium text-right w-36">Học phí</th>
                      <th className="pb-3 px-3 font-medium">Ghi chú</th>
                      <th className="pb-3 pl-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                   
                    {studentAdjustments.map((adj, idx) => {
                      const actualSessions = Math.max(0, effectiveSessions - adj.absentSessions + adj.extraSessions);
                      const fee = actualSessions * feePerSession;
                      const diff = fee - effectiveSessions * feePerSession;
                      return (
                        <tr key={adj.student} className="hover:bg-gray-50">
                          <td className="py-3 pr-4">
                            <div className="font-medium text-gray-900">{adj.name || 'Học sinh'}</div>
                            <div className="text-xs text-gray-400">{adj.email}</div>
                          </td>
                          <td className="py-3 px-4">
                            <input type="number" min="0" max={effectiveSessions + adj.extraSessions} className="border border-gray-300 rounded px-2 py-1 w-full text-center focus:outline-none focus:ring-2 focus:ring-red-400" value={adj.absentSessions} onChange={(e) => handleAdjChange(idx, 'absentSessions', e.target.value)} />
                          </td>
                          <td className="py-3 px-4">
                            <input type="number" min="0" className="border border-gray-300 rounded px-2 py-1 w-full text-center focus:outline-none focus:ring-2 focus:ring-green-400" value={adj.extraSessions} onChange={(e) => handleAdjChange(idx, 'extraSessions', e.target.value)} />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-semibold text-gray-800">{actualSessions}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-bold text-gray-900">{formatVND(fee)}</div>
                            {diff !== 0 && (
                              <div className={`text-xs ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {diff > 0 ? '+' : ''}{formatVND(diff)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <input type="text" className="border border-gray-200 rounded px-2 py-1 w-full text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Ghi chú..." value={adj.note} onChange={(e) => handleAdjChange(idx, 'note', e.target.value)} />
                          </td>
                          <td className="py-3 pl-2">
                            <button
                              title="Xuất phiếu thu"
                              onClick={() => setReceiptAdj({ ...adj, actualSessions: Math.max(0, effectiveSessions - adj.absentSessions + adj.extraSessions), fee: Math.max(0, effectiveSessions - adj.absentSessions + adj.extraSessions) * feePerSession })}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap border border-blue-200 hover:border-blue-400 rounded px-2 py-1"
                            ><FiPrinter /> Phiếu thu</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td colSpan={4} className="py-3 pr-4 font-semibold text-gray-700 text-right">Tổng thu dự kiến:</td>
                      <td className="py-3 px-4 text-right font-bold text-green-700 text-base">{formatVND(totalRevenue)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handlePrintAll}
              disabled={!studentAdjustments.length}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              <FiPrinter /> In phiếu thu cả lớp
            </button>
            <button onClick={handleSaveRecord} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
              <FiSave /> {saving ? 'Đang lưu...' : (existingRecordId ? 'Cập nhật bảng học phí' : 'Lưu bảng học phí')}
            </button>
          </div>
        </>
      )}

      {!selectedClass && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <FiDollarSign className="mx-auto text-4xl mb-3 text-gray-300" />
          <p>Chọn lớp và tháng để bắt đầu tính học phí</p>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptAdj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setReceiptAdj(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <span className="font-semibold text-gray-800">Phiếu thu học phí</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const el = printRef.current;
                    if (!el) return;
                    const w = window.open('', '_blank', 'width=420,height=620');
                    w.document.write(`<html><head><title>Phiếu thu</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px}h2{text-align:center;margin:0 0 4px}p{margin:2px 0}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{padding:6px 8px;border:1px solid #ddd;text-align:left}th{background:#f3f4f6}.total td{font-weight:bold;font-size:15px}.qr{display:flex;flex-direction:column;align-items:center;margin-top:12px}.qr img{width:130px;height:130px;object-fit:contain}.bank{font-size:12px;text-align:center;color:#555;margin-top:4px}.note{font-size:11px;color:#888;text-align:center;margin-top:8px}</style></head><body>${el.innerHTML}</body></html>`);
                    w.document.close();
                    w.focus();
                    w.print();
                    w.close();
                  }}
                  className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                ><FiPrinter /> In / Lưu PDF</button>
                <button onClick={() => setReceiptAdj(null)} className="text-gray-400 hover:text-gray-700"><FiX /></button>
              </div>
            </div>

            {/* Printable receipt */}
            <div className="p-5">
              <div ref={printRef}>
                <h2 className="text-center font-bold text-lg text-gray-900 mb-0.5">{siteSettings.schoolName || 'Toán Thầy Hiếu'}</h2>
                <p className="text-center font-semibold text-base text-gray-800">PHIẾU THU HỌC PHÍ</p>
                <p className="text-center text-sm text-gray-500 mb-3">Tháng {month}/{year} — {classData?.name}</p>

                <div className="text-sm space-y-1 mb-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Học sinh:</span>
                    <span className="font-semibold text-gray-900">{receiptAdj.name}</span>
                  </div>
                  {receiptAdj.email && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Email:</span>
                      <span className="text-gray-700">{receiptAdj.email}</span>
                    </div>
                  )}
                </div>

                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-1.5 px-2 border border-gray-200 font-medium">Nội dung</th>
                      <th className="text-right py-1.5 px-2 border border-gray-200 font-medium">Số lượng</th>
                      <th className="text-right py-1.5 px-2 border border-gray-200 font-medium">Đơn giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1.5 px-2 border border-gray-200">Buổi học ({month}/{year})</td>
                      <td className="py-1.5 px-2 border border-gray-200 text-right">{effectiveSessions} buổi</td>
                      <td className="py-1.5 px-2 border border-gray-200 text-right">{formatVND(feePerSession)}</td>
                    </tr>
                    {receiptAdj.absentSessions > 0 && (
                      <tr>
                        <td className="py-1.5 px-2 border border-gray-200 text-red-600">Vắng (giảm trừ)</td>
                        <td className="py-1.5 px-2 border border-gray-200 text-right text-red-600">-{receiptAdj.absentSessions} buổi</td>
                        <td className="py-1.5 px-2 border border-gray-200 text-right text-red-600">{formatVND(feePerSession)}</td>
                      </tr>
                    )}
                    {receiptAdj.extraSessions > 0 && (
                      <tr>
                        <td className="py-1.5 px-2 border border-gray-200 text-green-600">Học bù / thêm</td>
                        <td className="py-1.5 px-2 border border-gray-200 text-right text-green-600">+{receiptAdj.extraSessions} buổi</td>
                        <td className="py-1.5 px-2 border border-gray-200 text-right text-green-600">{formatVND(feePerSession)}</td>
                      </tr>
                    )}
                    <tr className="bg-gray-50 font-bold">
                      <td className="py-2 px-2 border border-gray-300" colSpan={2}>TỔNG CỘNG ({receiptAdj.actualSessions} buổi)</td>
                      <td className="py-2 px-2 border border-gray-300 text-right text-green-700 text-base">{formatVND(receiptAdj.fee)}</td>
                    </tr>
                  </tbody>
                </table>
                {receiptAdj.note && (
                  <p className="text-xs text-gray-500 mt-1">Ghi chú: {receiptAdj.note}</p>
                )}

                {/* Bank transfer */}
                {(siteSettings.bankAccountNumber || siteSettings.bankQrImageUrl) && (
                  <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
                    <p className="text-xs font-semibold text-gray-700 text-center mb-2">Chuyển khoản</p>
                    {siteSettings.bankQrImageUrl && (
                      <div className="flex justify-center mb-2">
                        <img src={getUploadUrl(siteSettings.bankQrImageUrl)} alt="QR" className="w-32 h-32 object-contain" />
                      </div>
                    )}
                    <div className="text-xs text-gray-600 text-center space-y-0.5">
                      {siteSettings.bankName && <p className="font-medium">{siteSettings.bankName}</p>}
                      {siteSettings.bankAccountNumber && <p>STK: <strong>{siteSettings.bankAccountNumber}</strong></p>}
                      {siteSettings.bankAccountName && <p>{siteSettings.bankAccountName}</p>}
                      <p className="text-gray-400">Nội dung: HP {receiptAdj.name} T{month}/{year}</p>
                    </div>
                  </div>
                )}

                {siteSettings.receiptNote && (
                  <p className="text-xs text-gray-400 text-center mt-2 italic">{siteSettings.receiptNote}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All-class Receipt Modal */}
      {showAllReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAllReceipt(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <span className="font-semibold text-gray-800">Bảng học phí — Tháng {month}/{year} · {classData?.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAllReceiptMode((mode) => mode === 'compact' ? 'detail' : 'compact')}
                  className="flex items-center gap-1 text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-50"
                >
                  {allReceiptMode === 'compact' ? <><FiUsers /> Hiển thị chi tiết</> : <><FiInfo /> Hiển thị gọn</>}
                </button>
                <button
                  onClick={handlePrintAllWindow}
                  className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                ><FiPrinter /> In / Lưu PDF</button>
                <button onClick={() => setShowAllReceipt(false)} className="text-gray-400 hover:text-gray-700"><FiX /></button>
              </div>
            </div>

            {/* Printable content */}
            <div className="overflow-y-auto p-6">
              <div ref={printAllRef}>
                <h2 className="text-center font-bold text-xl text-gray-900 mb-0.5">{siteSettings.schoolName || 'Toán Thầy Hiếu'}</h2>
                <p className="text-center font-semibold text-base text-gray-700">BẢNG HỌC PHÍ THÁNG {month}/{year}</p>
                <div className="meta flex flex-wrap justify-center gap-5 text-sm text-gray-500 mt-1 mb-4">
                  <span>Lớp: <strong className="text-gray-800">{classData?.name}</strong></span>
                  <span>Học phí/buổi: <strong className="text-gray-800">{formatVND(feePerSession)}</strong></span>
                  <span>Buổi thực học: <strong className="text-gray-800">{effectiveSessions}</strong>{holidaySessions > 0 ? ` (tổng ${totalSessions}, nghỉ ${holidaySessions})` : ` / ${totalSessions} buổi`}</span>
                
                </div>

                {allReceiptMode === 'compact' ? (
                  <table className="summary w-full text-sm border-collapse">
                    <tbody>
                      <tr>
                        <td className="py-2 px-3 border border-gray-200">Số buổi</td>
                        <td className="py-2 px-3 border border-gray-200">{effectiveSessions} buổi</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 border border-gray-200">Số tiền / buổi</td>
                        <td className="py-2 px-3 border border-gray-200">{formatVND(feePerSession)}</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="py-2 px-3 border border-gray-200 font-semibold">Tổng tiền mỗi học sinh</td>
                        <td className="py-2 px-3 border border-gray-200 text-green-700">{formatVND(allReceiptBaseFee)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="py-2 px-3 border border-gray-200 font-medium text-center w-10">STT</th>
                      <th className="py-2 px-3 border border-gray-200 font-medium">Họ tên</th>
                      <th className="py-2 px-3 border border-gray-200 font-medium text-center w-24">Số buổi</th>
                      <th className="py-2 px-3 border border-gray-200 font-medium text-right w-32">Thành tiền</th>
                      <th className="py-2 px-3 border border-gray-200 font-medium w-40">Ghi chú</th>
                      <th className="py-2 px-3 border border-gray-200 font-medium text-center w-24">Ký nhận</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentAdjustments.map((adj, idx) => {
                      const actualSessions = Math.max(0, effectiveSessions - adj.absentSessions + adj.extraSessions);
                      const fee = actualSessions * feePerSession;
                      const detail = [
                        adj.absentSessions > 0 ? `vắng ${adj.absentSessions}` : '',
                        adj.extraSessions > 0 ? `bù +${adj.extraSessions}` : '',
                      ].filter(Boolean).join(', ');
                      return (
                        <tr key={adj.student} className="hover:bg-gray-50">
                          <td className="py-2 px-3 border border-gray-100 text-center text-gray-400">{idx + 1}</td>
                          <td className="py-2 px-3 border border-gray-100">
                            <div className="font-medium text-gray-900">{adj.name || 'Học sinh'}</div>
                            {/* {adj.email && <div className="text-xs text-gray-400">{adj.email}</div>} */}
                          </td>
                          <td className="py-2 px-3 border border-gray-100 text-center">
                            <span className="font-semibold">{actualSessions}</span>
                            {detail && <div className="text-xs text-gray-400">{detail}</div>}
                          </td>
                          <td className="py-2 px-3 border border-gray-100 text-right font-bold text-green-700">{formatVND(fee)}</td>
                          <td className="py-2 px-3 border border-gray-100 text-xs text-gray-500">{adj.note}</td>
                          <td className="py-2 px-3 border border-gray-100"></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* <tfoot>
                    <tr className="bg-gray-50 font-bold">
                      <td colSpan={3} className="py-2 px-3 border border-gray-200 text-right">TỔNG THU DỰ KIẾN:</td>
                      <td className="py-2 px-3 border border-gray-200 text-right text-green-700 text-base">{formatVND(totalRevenue)}</td>
                      <td colSpan={2} className="border border-gray-200"></td>
                    </tr>
                  </tfoot> */}
                </table>
                )}

                {recordNote && <p className="text-xs text-gray-500 mt-2">Ghi chú: {recordNote}</p>}

                {/* QR + bank info */}
                {(siteSettings.bankAccountNumber || siteSettings.bankQrImageUrl) && (
                  <div className="qr-row mt-4 pt-4 border-t border-dashed border-gray-300 flex gap-6 items-start">
                    {siteSettings.bankQrImageUrl && (
                      <img src={getUploadUrl(siteSettings.bankQrImageUrl)} alt="QR chuyển khoản" className="w-28 h-28 object-contain shrink-0" />
                    )}
                    <div className="bank text-sm text-gray-600 space-y-0.5">
                      <p className="font-semibold text-gray-800">Thông tin chuyển khoản:</p>
                      {siteSettings.bankName && <p>{siteSettings.bankName}</p>}
                      {siteSettings.bankAccountNumber && <p>STK: <strong>{siteSettings.bankAccountNumber}</strong></p>}
                      {siteSettings.bankAccountName && <p>Chủ TK: {siteSettings.bankAccountName}</p>}
                      <p className="text-gray-400 text-xs">Nội dung: HP [Tên học sinh] T{month} {year}</p>
                    </div>
                  </div>
                )}

                {siteSettings.receiptNote && (
                  <p className="text-xs text-gray-400 text-center mt-3 italic">{siteSettings.receiptNote}</p>
                )}

                <div className="sig flex justify-end mt-8 text-xs text-gray-500 text-center">
                  <div>Ngày &nbsp;&nbsp; tháng {month} năm {year}<br /><br /><br />Giáo viên</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
