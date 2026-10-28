const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const isGrade = grade => Number.isInteger(grade) && grade >= 1 && grade <= 12;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const TARGET = 10;
const REWARD = 10;
function validateQuestion(q) {
  if (!q || !isGrade(q.grade) || !DIFFICULTIES.includes(q.difficulty) || !['choice', 'short'].includes(q.kind) || typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 1000 || typeof q.published !== 'boolean') fail('Cần khối lớp, độ khó, nội dung và trạng thái hợp lệ');
  if (q.explanation !== undefined && (typeof q.explanation !== 'string' || q.explanation.length > 1500)) fail('Giải thích tối đa 1500 ký tự');
  if (q.chapter !== undefined && (typeof q.chapter !== 'string' || q.chapter.length > 300)) fail('Chương không hợp lệ');
  const result = { chapter: q.chapter?.trim() || '', grade: q.grade, difficulty: q.difficulty, kind: q.kind, prompt: q.prompt.trim(), explanation: q.explanation?.trim() || '', published: q.published, options: [], answer: '', correctIndex: null };
  if (q.kind === 'choice') {
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 300) || new Set(q.options.map(o => o.trim())).size !== 4 || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) fail('Trắc nghiệm cần 4 lựa chọn khác nhau và một đáp án đúng');
    result.options = q.options.map(o => o.trim()); result.correctIndex = q.correctIndex;
  } else {
    if (typeof q.answer !== 'string' || !q.answer.trim() || q.answer.length > 100) fail('Đáp án ngắn cần từ 1 đến 100 ký tự');
    result.answer = q.answer.trim();
  }
  return result;
}
function normalize(value) { return String(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '').replace(/−/g, '-').replace(/,/g, '.'); }
function number(value) {
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d+)?|\.\d+))?$/.test(value)) return null;
  const [a, b = '1'] = value.split('/');
  const decimal = text => {
    const sign = text.startsWith('-') ? -1n : 1n;
    const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
    return { n: sign * BigInt((whole || '0') + fraction), d: 10n ** BigInt(fraction.length) };
  };
  const numerator = decimal(a), denominator = decimal(b);
  if (denominator.n === 0n) return null;
  return { n: numerator.n * denominator.d, d: numerator.d * denominator.n };
}
function isCorrect(question, answer) {
  if (question.kind === 'choice') return Number.isInteger(answer) && answer === question.correctIndex;
  if (typeof answer !== 'string' || answer.length > 100) return false;
  const a = normalize(answer), b = normalize(question.answer);
  const na = number(a), nb = number(b);
  return a === b || (na !== null && nb !== null && na.n * nb.d === nb.n * na.d);
}
function scores(match) { return [0, 1].map(team => match.participants.filter(p => p.team === team).reduce((sum, p) => sum + p.score, 0)); }
module.exports = { fail, isGrade, DIFFICULTIES, TARGET, REWARD, validateQuestion, isCorrect, scores };
