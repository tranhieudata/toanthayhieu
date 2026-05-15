import { useState, useRef, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiFilter, FiPrinter, FiTrendingUp } from 'react-icons/fi';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }));
const CUR_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CUR_YEAR - 3 + i);

function formatVND(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n || 0);
}

export default function AdminRevenue() {
  const now = new Date();

  const [filterMode, setFilterMode] = useState('month');

  // Theo tháng
  const [monthVal, setMonthVal] = useState(now.getMonth() + 1);
  const [monthYear, setMonthYear] = useState(now.getFullYear());

  // Nửa năm
  const [halfVal, setHalfVal] = useState(now.getMonth() < 6 ? 'H1' : 'H2');
  const [halfYear, setHalfYear] = useState(now.getFullYear());

  // Tùy chọn khoảng
  const [fromMonth, setFromMonth] = useState(1);
  const [fromYear, setFromYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);
  const [toYear, setToYear] = useState(now.getFullYear());

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('');
  const [siteSettings, setSiteSettings] = useState({});

  const printRef = useRef();

  useEffect(() => {
    api.get('/settings').then((r) => setSiteSettings(r.data)).catch(() => {});
  }, []);

  const getDateRange = () => {
    if (filterMode === 'month') {
      return {
        fm: monthVal, fy: monthYear,
        tm: monthVal, ty: monthYear,
        label: `Tháng ${monthVal}/${monthYear}`,
      };
    }
    if (filterMode === 'half') {
      const fm = halfVal === 'H1' ? 1 : 7;
      const tm = halfVal === 'H1' ? 6 : 12;
      return {
        fm, fy: halfYear, tm, ty: halfYear,
        label: halfVal === 'H1' ? `6 tháng đầu năm ${halfYear} (T1–T6)` : `6 tháng cuối năm ${halfYear} (T7–T12)`,
      };
    }
    return {
      fm: fromMonth, fy: fromYear,
      tm: toMonth, ty: toYear,
      label: `Tháng ${fromMonth}/${fromYear} — Tháng ${toMonth}/${toYear}`,
    };
  };

  const loadReport = async () => {
    const { fm, fy, tm, ty, label } = getDateRange();
    if (fy * 12 + fm > ty * 12 + tm) {
      toast.error('Tháng bắt đầu phải trước hoặc bằng tháng kết thúc');
      return;
    }
    setLoading(true);
    setPeriod(label);
    try {
      const { data } = await api.get(`/tuition/revenue?fromMonth=${fm}&fromYear=${fy}&toMonth=${tm}&toYear=${ty}`);
      setRows(data.rows || []);
      setTotal(data.total || 0);
      if (!data.rows?.length) toast('Không có dữ liệu trong kỳ này', { icon: 'ℹ️' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi tải báo cáo');
    } finally {
      setLoading(false);
    }
  };

  // Group by month/year
  const grouped = rows.reduce((acc, row) => {
    const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = { month: row.month, year: row.year, rows: [], subtotal: 0 };
    acc[key].rows.push(row);
    acc[key].subtotal += row.amount;
    return acc;
  }, {});
  const groupedArr = Object.values(grouped).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const schoolName = siteSettings.schoolName || 'TOÁN THẦY HIẾU';
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sổ doanh thu ${period}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; font-size: 12px; color: #111; }
  .print-header { text-align: center; margin-bottom: 16px; }
  .print-header h2 { margin: 0; font-size: 15px; text-transform: uppercase; }
  .print-header h3 { margin: 4px 0 2px; font-size: 14px; font-weight: bold; }
  .print-header p { margin: 2px 0; font-size: 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #888; padding: 6px 8px; vertical-align: middle; }
  th { background: #e8e8e8; font-weight: 600; text-align: center; }
  .month-header td { background: #d0e4ff; font-weight: 700; text-align: center; color: #1a3a6b; }
  .subtotal td { background: #f0f0f0; font-weight: 600; }
  .total td { background: #dde8d0; font-weight: 700; font-size: 13px; }
  .right { text-align: right; }
  .center { text-align: center; }
  @media print { body { padding: 10px; } }
</style></head><body>
<div class="print-header">
  <h2>${schoolName}</h2>
  <h3>SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ</h3>
  <p>Mẫu số S1a-HKD</p>
  <p>Kỳ khai: <strong>${period}</strong></p>
</div>
${el.innerHTML}
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const selectClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <FiTrendingUp className="text-green-600" /> Sổ doanh thu
      </h1>

      {/* Filter card */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        {/* Mode tabs */}
        <div className="flex gap-2 flex-wrap">
          {[['month', 'Theo tháng'], ['half', 'Nửa năm'], ['range', 'Tùy chọn']].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setFilterMode(val)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterMode === val ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Theo tháng */}
        {filterMode === 'month' && (
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Tháng</label>
              <select className={selectClass} value={monthVal} onChange={(e) => setMonthVal(Number(e.target.value))}>
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Năm</label>
              <select className={selectClass} value={monthYear} onChange={(e) => setMonthYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Nửa năm */}
        {filterMode === 'half' && (
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Kỳ</label>
              <select className={selectClass} value={halfVal} onChange={(e) => setHalfVal(e.target.value)}>
                <option value="H1">6 tháng đầu năm (T1 – T6)</option>
                <option value="H2">6 tháng cuối năm (T7 – T12)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Năm</label>
              <select className={selectClass} value={halfYear} onChange={(e) => setHalfYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Khoảng tùy chọn */}
        {filterMode === 'range' && (
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Từ tháng</label>
              <select className={selectClass} value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))}>
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Năm</label>
              <select className={selectClass} value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <span className="text-gray-400 pb-2 text-lg font-light">→</span>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Đến tháng</label>
              <select className={selectClass} value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))}>
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Năm</label>
              <select className={selectClass} value={toYear} onChange={(e) => setToYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        )}

        <button
          onClick={loadReport}
          disabled={loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          <FiFilter /> {loading ? 'Đang tải...' : 'Xem báo cáo'}
        </button>
      </div>

      {/* Result table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-gray-800">{period}</h2>
              <p className="text-sm text-gray-500">{rows.length} dòng • Tổng: <span className="font-semibold text-green-700">{formatVND(total)}</span></p>
            </div>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <FiPrinter /> In / Xuất PDF
            </button>
          </div>

          <div className="overflow-x-auto">
            <div ref={printRef}>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 py-2.5 px-3 font-semibold text-center w-10">A</th>
                    <th className="border border-gray-300 py-2.5 px-3 font-semibold text-left">B — Diễn giải</th>
                    <th className="border border-gray-300 py-2.5 px-3 font-semibold text-right min-w-36">1 — Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedArr.map((group) => (
                    <MonthGroup key={`${group.year}-${group.month}`} group={group} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-green-50 font-bold">
                    <td className="border border-gray-400 py-3 px-3 text-center" colSpan={2}>
                      TỔNG CỘNG
                    </td>
                    <td className="border border-gray-400 py-3 px-3 text-right text-green-700 text-base">
                      {formatVND(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !loading && period && (
        <div className="bg-white rounded-xl shadow-sm p-14 text-center text-gray-400">
          <FiTrendingUp className="mx-auto text-5xl mb-3 text-gray-200" />
          <p className="font-medium">Không có dữ liệu doanh thu</p>
          <p className="text-xs mt-1">Kỳ: {period}</p>
          <p className="text-xs mt-1 text-gray-300">Hãy lưu bảng học phí trong trang Tính học phí trước</p>
        </div>
      )}
    </div>
  );
}

function MonthGroup({ group }) {
  return (
    <>
      {/* Month header row */}
      <tr className="bg-blue-50">
        <td className="border border-gray-300 py-2 px-3 font-bold text-blue-700 text-center" colSpan={3}>
          Tháng {group.month}/{group.year}
        </td>
      </tr>

      {/* Student rows */}
      {group.rows.map((row, ri) => (
        <tr key={ri} className="hover:bg-gray-50">
          <td className="border border-gray-200 py-2 px-3 text-center text-gray-400 text-xs">{ri + 1}</td>
          <td className="border border-gray-200 py-2 px-3">
            <span>Thu học phí T{group.month}/{group.year} — {row.className} — </span>
            <span className="font-medium">{row.studentName}</span>
            <span className="text-xs text-gray-400 ml-1.5">
              ({row.sessions} buổi × {formatVND(row.feePerSession)})
            </span>
          </td>
          <td className="border border-gray-200 py-2 px-3 text-right font-medium text-gray-900">
            {formatVND(row.amount)}
          </td>
        </tr>
      ))}

      {/* Subtotal row */}
      <tr className="bg-gray-50 font-semibold">
        <td className="border border-gray-300 py-2 px-3"></td>
        <td className="border border-gray-300 py-2 px-3 text-right text-gray-600 text-xs uppercase tracking-wide">
          Cộng tháng {group.month}/{group.year}:
        </td>
        <td className="border border-gray-300 py-2 px-3 text-right text-blue-700">
          {formatVND(group.subtotal)}
        </td>
      </tr>
    </>
  );
}
