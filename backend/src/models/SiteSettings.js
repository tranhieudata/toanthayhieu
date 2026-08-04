const mongoose = require('mongoose');

const difficultyLevelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  color: { type: String, default: 'gray' }, // Tailwind color class
  bgColor: { type: String, default: 'bg-gray-100' },
  textColor: { type: String, default: 'text-gray-700' },
}, { _id: false });

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    schoolName: { type: String, default: 'Toán Thầy Hiếu' },
    bankName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankQrImageUrl: { type: String, default: '' },
    receiptNote: { type: String, default: '' },
    curriculum: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    difficultyLevels: {
      type: [difficultyLevelSchema],
      default: [
        { name: 'Nhận biết', bgColor: 'bg-green-100', textColor: 'text-green-700' },
        { name: 'Thông hiểu', bgColor: 'bg-blue-100', textColor: 'text-blue-700' },
        { name: 'Vận dụng cao', bgColor: 'bg-orange-100', textColor: 'text-orange-700' },
      ]
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
