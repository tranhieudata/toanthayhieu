import { useRef } from 'react';
import { FiPrinter } from 'react-icons/fi';
import ReviewText from './ReviewText';
import './exam-grading-report.css';

const points = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

export default function ExamGradingReport({ result, exam, studentName, showGeneratedAnswer = false }) {
  const paperRef = useRef(null);
  if (!result || result.status !== 'graded') return null;
  const report = result.gradingReport;
  const objective = report?.objective || [];
  const essay = report?.essay || [];
  const printReport = () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
    document.body.appendChild(frame);
    frame.onload = async () => {
      await frame.contentDocument.fonts?.ready;
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1000);
    };
    const styles = [...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node => node.outerHTML).join('');
    frame.contentDocument.open();
    frame.contentDocument.write(`<!doctype html><html><head><title>Phiếu kết quả chấm bài</title>${styles}</head><body>${paperRef.current.outerHTML}</body></html>`);
    frame.contentDocument.close();
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{result.gradingMethod === 'ai' ? 'Chấm bằng AI · ' : 'Chấm thủ công · '}{report?.answerSource === 'generated' ? 'AI tự lập đáp án vì chưa có đáp án của thầy' : report ? 'Theo đáp án của thầy' : 'Điểm và nhận xét của thầy'}</span>
        <button type="button" onClick={printReport} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-slate-700"><FiPrinter /> In phiếu / Lưu PDF</button>
      </div>
      <article className="exam-grade-report" ref={paperRef}>
        <header><p>Toán Thầy Hiếu</p><h1>PHIẾU KẾT QUẢ CHẤM BÀI</h1><p>{exam?.title}</p></header>
        <div className="report-summary">
          <div><p><b>Học sinh:</b> {studentName}</p><p><b>Bài tập:</b> {exam?.title}</p>{report?.recommendation && <p><b>Đề xuất lớp:</b> {report.recommendation}</p>}</div>
          <div className="report-total"><b>TỔNG ĐIỂM:</b> <strong>{points(result.totalScore)}</strong><span> / {points(result.maxScore)}</span></div>
        </div>
        {objective.length > 0 && <section>
          <h2>PHẦN I. TRẮC NGHIỆM: {points(sum(objective, 'score'))} / {points(sum(objective, 'maxScore'))}</h2>
          <div className="report-table-scroll"><table>
            <thead><tr><th>Câu</th>{objective.map((row, i) => <th key={i}>{row.label}</th>)}</tr></thead>
            <tbody>
              <tr><th>HS chọn</th>{objective.map((row, i) => <td key={i}><ReviewText>{row.studentAnswer || '—'}</ReviewText></td>)}</tr>
              <tr><th>Đáp án</th>{objective.map((row, i) => <td key={i}><ReviewText>{row.expectedAnswer}</ReviewText></td>)}</tr>
              <tr><th>Kết quả</th>{objective.map((row, i) => <td key={i} className={row.correct ? 'report-correct' : 'report-wrong'}>{row.correct ? 'Đ' : 'S'}</td>)}</tr>
              <tr><th>Điểm</th>{objective.map((row, i) => <td key={i}>{points(row.score)}/{points(row.maxScore)}</td>)}</tr>
            </tbody>
          </table></div>
        </section>}
        {essay.length > 0 && <section>
          <h2>PHẦN {objective.length ? 'II' : 'I'}. TỰ LUẬN: {points(sum(essay, 'score'))} / {points(sum(essay, 'maxScore'))}</h2>
          <table className="report-essay"><thead><tr><th>Ý</th><th>Đạt</th><th>Tối đa</th><th>Nhận xét / lỗi sai</th></tr></thead>
            <tbody>{essay.map((row, i) => <tr key={i}><td>{row.label}</td><td>{points(row.score)}</td><td>{points(row.maxScore)}</td><td><ReviewText>{row.note}</ReviewText></td></tr>)}</tbody>
          </table>
        </section>}
        {report?.levels?.length > 0 && <section><h2>ĐIỂM THEO MỨC</h2><p>{report.levels.map(row => `${row.label}: ${points(row.score)}/${points(row.maxScore)}`).join(' · ')}</p></section>}
        <section><h2>NHẬN XÉT CỦA THẦY</h2><p className="report-feedback"><ReviewText>{result.teacherNote || report?.feedback || result.autoFeedback || 'Chưa có nhận xét.'}</ReviewText></p></section>
      </article>
      {showGeneratedAnswer && report?.generatedAnswerKey && <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer font-medium">Xem đáp án AI đã tự lập</summary><pre className="mt-2 whitespace-pre-wrap font-sans">{report.generatedAnswerKey}</pre></details>}
    </div>
  );
}
