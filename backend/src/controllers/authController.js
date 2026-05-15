const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

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
  res.json({
    user: { _id: req.user._id, name: req.user.name, email: req.user.email, phone: req.user.phone, role: req.user.role, avatar: req.user.avatar },
  });
};

// OAuth callback helper
const oauthCallback = (req, res) => {
  const token = generateToken(req.user._id);
  res.redirect(`${process.env.CLIENT_URL}/oauth-success?token=${token}&role=${req.user.role}`);
};

module.exports = { register, login, getMe, oauthCallback };
