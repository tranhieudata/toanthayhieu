const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
      user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar },
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
      user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    await touchStudentSession(req.user);
    res.json({
      user: { _id: req.user._id, name: req.user.name, email: req.user.email, phone: req.user.phone, role: req.user.role, avatar: req.user.avatar },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });

    if (user.password) {
      if (!currentPassword) {
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
