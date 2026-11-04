function hasAnswerText(value) {
  return Boolean(String(value || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || /<img\b/i.test(value || ''));
}

function teacherAnswerText(exam) {
  // The teacher's own rubric takes priority over answers in generated packages.
  if (hasAnswerText(exam.solutionContent)) return exam.solutionContent;
  if (exam.solutionImages?.length) return '';
  const paper = exam.examPackage;
  return [
    ...(paper?.questions?.multipleChoice || []).filter(q => hasAnswerText(q.answer)).map(q => `Câu ${q.number}: ${q.answer}. ${q.explanation || ''}`),
    ...(paper?.questions?.essay || []).filter(q => hasAnswerText(q.solution)).map(q => `Bài ${q.number}: ${q.solution}`),
  ].join('\n');
}

function normalizeGradingReport(raw, maxScore) {
  if (!raw || typeof raw !== 'object') throw new Error('AI chưa trả về phiếu chấm hợp lệ');
  const normalizeRows = (rows, objective) => {
    if (!Array.isArray(rows)) throw new Error('Phiếu chấm thiếu bảng kết quả');
    const labels = new Set();
    return rows.map(row => {
      const score = Number(row.score);
      const maximum = Number(row.maxScore);
      if (!String(row.label || '').trim() || !Number.isFinite(score) || !Number.isFinite(maximum) || maximum < 0 || score < 0 || score > maximum) {
        throw new Error('Phiếu chấm có điểm hoặc nhãn câu không hợp lệ');
      }
      if (labels.has(String(row.label).trim())) throw new Error('Phiếu chấm bị trùng câu/ý');
      labels.add(String(row.label).trim());
      return {
        label: String(row.label), score, maxScore: maximum, note: String(row.note || ''),
        ...(objective ? { studentAnswer: String(row.studentAnswer || ''), expectedAnswer: String(row.expectedAnswer || ''), correct: row.correct === true } : {}),
      };
    });
  };
  const objective = normalizeRows(raw.objective, true);
  const essay = normalizeRows(raw.essay, false);
  const rows = [...objective, ...essay];
  if (!rows.length) throw new Error('AI chưa đọc được các câu trong bài làm');
  const total = rows.reduce((s, row) => s + row.score, 0);
  const maximum = rows.reduce((s, row) => s + row.maxScore, 0);
  if (Math.abs(maximum - maxScore) > 0.02 || total > maxScore + 0.001) throw new Error('Tổng thang điểm AI trả về chưa khớp điểm tối đa của đề. Vui lòng kiểm tra đáp án và chấm lại.');
  return {
    objective, essay, totalScore: Math.round(total * 100) / 100, maxScore,
    feedback: String(raw.feedback || ''), recommendation: String(raw.recommendation || ''),
    levels: Array.isArray(raw.levels) ? raw.levels.filter(row => row.label && Number.isFinite(Number(row.score)) && Number(row.score) >= 0 && Number(row.maxScore) > 0 && Number(row.score) <= Number(row.maxScore)).map(row => ({ label: String(row.label), score: Number(row.score), maxScore: Number(row.maxScore) })) : [],
  };
}

function gradingPrompt({ exam, studentName, answerText, maxScore }) {
  return `Bạn là giáo viên Toán Việt Nam, chấm từ ẢNH BÀI LÀM được gắn nhãn bên dưới.
Đề: ${exam.title}. Học sinh: ${studentName}. Tổng thang điểm: ${maxScore}.
Nội dung đề: ${exam.content || ''}\n${JSON.stringify(exam.examPackage?.questions || {})}
Tên mức độ (chỉ dùng để tổng hợp nếu có dữ liệu tương ứng): ${JSON.stringify(exam.examPackage?.cognitiveLevels || [])}
ĐÁP ÁN VÀ THANG ĐIỂM CHUẨN:\n${answerText || '(Đáp án chuẩn nằm trong tài liệu đáp án đính kèm)'}
Ưu tiên tuyệt đối đáp án, cách chia ý, ký hiệu câu và thang điểm của giáo viên. Không thay đáp án của giáo viên bằng đáp án tự sinh. Nếu đáp án chỉ có một phần, không tự bịa phần thiếu: báo lỗi cần bổ sung.
Không chia điểm theo ma trận/mức độ thay cho thang điểm đáp án. Giữ nhãn 1a, 1b, 7a...; chấp nhận cách giải khác đúng và lập luận chặt chẽ. Phân biệt ảnh đề, ảnh đáp án với ảnh bài làm; chỉ ghi nhận câu trả lời thực tế của học sinh.
Nếu ảnh mờ/thiếu trang hoặc không đọc được, trả {"error":"Nêu rõ ảnh/câu cần bổ sung"}; không đoán hoặc tự cho điểm. Câu bỏ trống rõ ràng được 0 điểm.
Lập phiếu giống mẫu: phần trắc nghiệm có hàng HS chọn, Đáp án, Kết quả Đ/S; phần tự luận có Ý, Đạt, Tối đa, Nhận xét/lỗi sai. Công thức toán dùng LaTeX trong dấu $...$. Phần mức độ chỉ ghi khi xác định được từ đề/đáp án, không suy đoán. Nhận xét của thầy nêu điểm mạnh, lỗi cụ thể và gợi ý luyện tập; chỉ đề xuất lớp khi có tiêu chí trong đáp án, nếu không để trống.
Chỉ trả JSON (không HTML/markdown):
{"objective":[{"label":"1","studentAnswer":"C","expectedAnswer":"C","correct":true,"score":0.25,"maxScore":0.25,"note":""}],"essay":[{"label":"1a","score":0.5,"maxScore":0.5,"note":"Nhận xét/lỗi sai cụ thể"}],"levels":[{"label":"Mức 1","score":0,"maxScore":0}],"feedback":"Nhận xét của thầy","recommendation":""}
Mỗi phần không có thì trả mảng rỗng. Tổng maxScore của các câu/ý phải bằng ${maxScore}. Tổng điểm được tính từ các dòng, không tự nâng điểm.`;
}

module.exports = { teacherAnswerText, normalizeGradingReport, gradingPrompt };
