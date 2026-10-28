const { Policy } = require('../models/Community');
const { REWARDS } = require('../utils/communityRules');
const actions = [
  { key: 'homework', label: 'Nộp bài tập có ảnh', unit: 'năng lượng / bài', value: 10 },
  { key: 'photo', label: 'Ảnh học tập được duyệt', unit: 'năng lượng / ngày', value: 15 },
  { key: 'help', label: 'Giúp bạn được ghi nhận', unit: 'năng lượng / ảnh hỏi bài', value: 10 },
  { key: 'reviewCorrect', label: 'Ôn tập tưới cây: trả lời đúng', unit: 'năng lượng / câu đúng', value: 1 },
  { key: 'challengeCorrect', label: 'Thử thách: trả lời đúng', unit: 'năng lượng / câu đúng', value: 5 },
  { key: 'arenaWin', label: 'Thắng đấu trường', unit: 'năng lượng / người thắng', value: 10 },
  { key: 'practiceCost', label: 'Phí tự luyện 10 câu', unit: 'năng lượng / lượt', value: 10 },
  ...REWARDS.map(r => ({ key: `redeem:${r.id}`, label: `Đổi ${r.label}`, unit: 'năng lượng / lần đổi', value: r.cost })),
];
const defaults = Object.fromEntries(actions.map(a => [a.key, a.value]));
async function energySettings() {
  const policy = await Policy.findOne({ key: 'default' }).select('energySettings').lean();
  return { ...defaults, ...policy?.energySettings };
}
function validate(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !Object.hasOwn(defaults, key)) || Object.entries(values).some(([, value]) => !Number.isInteger(value) || value < 0 || value > 100000)) {
    const error = new Error('Mức năng lượng phải là số nguyên từ 0 đến 100.000 và đúng hành động được hỗ trợ');
    error.status = 400; throw error;
  }
  return values;
}
async function rewardCatalog() {
  const values = await energySettings();
  return REWARDS.map(r => ({ ...r, cost: values[`redeem:${r.id}`] }));
}
module.exports = { actions, defaults, energySettings, validate, rewardCatalog };
