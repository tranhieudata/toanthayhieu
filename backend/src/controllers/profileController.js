const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const User = require('../models/User');
const { Policy } = require('../models/Community');
const { containsBanned, localDay } = require('../utils/communityRules');
const avatarDir = path.resolve(__dirname, '../../uploads/avatars');
function account(user) {
  return { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar, dateOfBirth: user.dateOfBirth || '', theme: user.theme || 'light', hasPassword: Boolean(user.password) };
}
function validBirthday(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > localDay()) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
async function removeManagedAvatar(url) {
  const match = /^\/uploads\/avatars\/([a-f0-9-]+\.(?:jpg|png|webp))$/.exec(url || '');
  if (match) await fs.unlink(path.join(avatarDir, match[1])).catch(() => {});
}
async function updateProfile(req, res) {
  let newAvatar = '';
  try {
    const update = {};
    if (req.body.theme !== undefined) {
      if (!['light', 'dark'].includes(req.body.theme)) return res.status(400).json({ message: 'Chế độ giao diện không hợp lệ' });
      update.theme = req.body.theme;
    }
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(req.body.name)) return res.status(400).json({ message: 'Tên hiển thị cần từ 1 đến 80 ký tự hợp lệ' });
      const settings = await Policy.findOne({ key: 'default' });
      if (settings && containsBanned(req.body.name, settings.bannedWords)) return res.status(400).json({ message: 'Tên hiển thị có từ ngữ bị cấm. Vui lòng chọn tên khác.' });
      update.name = req.body.name.trim();
    }
    if (req.body.dateOfBirth !== undefined) {
      if (!validBirthday(req.body.dateOfBirth)) return res.status(400).json({ message: 'Ngày sinh không hợp lệ. Chọn ngày có thật từ năm 1900 đến hôm nay.' });
      update.dateOfBirth = req.body.dateOfBirth;
    }
    const removeAvatar = req.body.removeAvatar === true || req.body.removeAvatar === 'true';
    if (req.file && removeAvatar) return res.status(400).json({ message: 'Chọn thay ảnh hoặc gỡ ảnh, không thực hiện cùng lúc' });
    if (req.file) {
      const bytes = req.file.buffer;
      const ext = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'jpg'
        : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : '';
      if (!ext) return res.status(400).json({ message: 'Ảnh không hợp lệ. Chỉ dùng JPEG, PNG hoặc WebP.' });
      await fs.mkdir(avatarDir, { recursive: true });
      newAvatar = `/uploads/avatars/${crypto.randomUUID()}.${ext}`;
      await fs.writeFile(path.join(avatarDir, path.basename(newAvatar)), bytes);
      update.avatar = newAvatar;
    } else if (removeAvatar) update.avatar = '';
    const user = await User.findOneAndUpdate({ _id: req.user._id, isActive: true }, { $set: update }, { new: true, runValidators: true }).select('+password');
    if (!user) {
      await removeManagedAvatar(newAvatar);
      return res.status(403).json({ message: 'Tài khoản không hoạt động' });
    }
    if (update.avatar !== undefined && req.user.avatar !== update.avatar) await removeManagedAvatar(req.user.avatar);
    res.json({ user: account(user), message: 'Đã cập nhật tài khoản' });
  } catch (err) {
    await removeManagedAvatar(newAvatar);
    console.error('[profile]', err.message);
    res.status(500).json({ message: 'Chưa thể lưu thông tin tài khoản. Vui lòng thử lại.' });
  }
}
module.exports = { account, validBirthday, updateProfile };
