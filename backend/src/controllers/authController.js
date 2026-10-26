const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { account } = require('./profileController');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const recordLogin = async (user) => {
  const lastLoginAt = new Date();
  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt }, $inc: { loginCount: 1 } }
  );
  user.lastLoginAt = lastLoginAt;
  user.loginCount = (user.loginCount || 0) + 1;
};

const touchStudentSession = async (user) => {
  if (user.role !== 'student') return;
  const lastLoginAt = new Date();
  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt } }
  );
  user.lastLoginAt = lastLoginAt;
};

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email đã được sử dụng' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed, phone: phone || '', role: 'student' });

    const token = generateToken(user._id);
    res.status(201).json({
      token,
      user: account(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    if (!password) return res.status(400).json({ message: 'Vui lòng nhập mật khẩu' });
    
    let user;
    if (email) {
      user = await User.findOne({ email }).select('+password');
      if (!user) return res.status(400).json({ message: 'Email không tồn tại' });
    } else if (phone) {
      user = await User.findOne({ phone }).select('+password');
      if (!user) return res.status(400).json({ message: 'Số điện thoại không tồn tại' });
    } else {
      return res.status(400).json({ message: 'Vui lòng nhập email hoặc số điện thoại' });
    }

    if (!user.password) return res.status(400).json({ message: 'Tài khoản này đăng nhập qua mạng xã hội' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu không đúng' });

    await recordLogin(user);
    const token = generateToken(user._id);
    res.json({
      token,
      user: account(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    await touchStudentSession(req.user);
    const user = await User.findById(req.user._id).select('+password');
    res.json({
      user: account(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (typeof newPassword !== 'string' || newPassword.length < 6 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự và tối đa 72 byte' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    if (!user.isActive) return res.status(403).json({ message: 'Tài khoản không hoạt động' });

    if (user.password) {
      if (typeof currentPassword !== 'string' || !currentPassword) {
        return res.status(400).json({ message: 'Vui lòng nhập mật khẩu hiện tại' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
      }
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// OAuth callback helper
const oauthCallback = async (req, res) => {
  try {
    await recordLogin(req.user);
    const token = generateToken(req.user._id);
    res.redirect(`${process.env.CLIENT_URL}/oauth-success?token=${token}&role=${req.user.role}`);
  } catch (err) {
    res.redirect(`${process.env.CLIENT_URL}/login`);
  }
};

module.exports = { register, login, getMe, changePassword, oauthCallback };
