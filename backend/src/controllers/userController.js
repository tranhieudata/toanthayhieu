const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const TuitionRecord = require('../models/TuitionRecord');
const ClassEnrollment = require('../models/ClassEnrollment');
const mongoose = require('mongoose');
const { Profile } = require('../models/Community');
const { ensureProfile } = require('../services/community');

const getVietnamTodayRange = () => {
  const now = new Date();
  const vietnamNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const year = vietnamNow.getFullYear();
  const month = vietnamNow.getMonth();
  const date = vietnamNow.getDate();

  return {
    start: new Date(Date.UTC(year, month, date, -7, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, date + 1, -7, 0, 0, 0)),
  };
};

// GET /api/users (admin)
const getUsers = async (req, res) => {
  try {
    const { search, role, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const profiles = await Profile.find({ user: { $in: users.map(user => user._id) } }).select('user energy').lean();
    const energyByUser = new Map(profiles.map(profile => [String(profile.user), profile.energy]));
    res.json({ users: users.map(user => ({ ...user.toObject(), energy: energyByUser.get(String(user._id)) ?? 0 })), total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin balance changes use the balance shown in the dialog as a compare-and-swap.
// Concurrent rewards or spending must be reviewed instead of being overwritten.
const studentEnergy = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Mã học sinh không hợp lệ' });
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('_id');
    if (!student) return res.status(404).json({ message: 'Không tìm thấy học sinh' });
    if (req.method === 'GET') {
      const profile = await Profile.findOne({ user: student._id }).select('energy').lean();
      return res.json({ userId: student._id, energy: profile?.energy ?? 0 });
    }
    const { energy, expectedEnergy } = req.body;
    if (![energy, expectedEnergy].every(value => Number.isSafeInteger(value) && value >= 0)) {
      return res.status(400).json({ message: 'Năng lượng phải là số nguyên không âm hợp lệ' });
    }
    await ensureProfile(student._id);
    const updated = await Profile.findOneAndUpdate({ user: student._id, energy: expectedEnergy }, { $set: { energy } }, { new: true }).select('energy').lean();
    if (updated) return res.json({ userId: student._id, energy: updated.energy });
    const latest = await Profile.findOne({ user: student._id }).select('energy').lean();
    if (latest?.energy === energy) return res.json({ userId: student._id, energy });
    return res.status(409).json({ message: 'Số dư năng lượng vừa thay đổi. Hãy kiểm tra số dư mới trước khi lưu lại.', energy: latest?.energy ?? 0 });
  } catch (err) {
    res.status(500).json({ message: 'Chưa cập nhật được năng lượng. Vui lòng thử lại.' });
  }
};

// GET /api/users/:id
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const enrollments = await Enrollment.find({ user: user._id }).populate('course', 'title thumbnail');
    res.json({ user, enrollments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/users/:id (admin)
const updateUser = async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, rest, { new: true });
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/users/:id (admin)
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng' });

    await TuitionRecord.updateMany(
      { 'studentAdjustments.student': user._id },
      {
        $set: {
          'studentAdjustments.$[item].studentName': user.name || '',
          'studentAdjustments.$[item].studentEmail': user.email || '',
        },
      },
      { arrayFilters: [{ 'item.student': user._id }] }
    );

    await ClassEnrollment.updateMany(
      { student: user._id },
      { $set: { studentName: user.name || '', studentEmail: user.email || '' } }
    );

    await User.findByIdAndDelete(user._id);
    res.json({ message: 'Xóa người dùng thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/users/me/enrollments
const getMyEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ user: req.user._id })
      .populate('course', 'title thumbnail category level instructor')
      .sort({ enrolledAt: -1 });
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/stats
const getAdminStats = async (req, res) => {
  try {
    const { start, end } = getVietnamTodayRange();
    const todayLoginFilter = {
      role: 'student',
      lastLoginAt: { $gte: start, $lt: end },
    };

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      loggedInToday,
      todayLoginUsers,
      totalCourses,
      totalEnrollments,
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'student', isActive: false }),
      User.countDocuments(todayLoginFilter),
      User.find(todayLoginFilter)
        .select('name email avatar lastLoginAt loginCount isActive')
        .sort({ lastLoginAt: -1 })
        .limit(12),
      require('../models/Course').countDocuments(),
      Enrollment.countDocuments(),
    ]);

    res.json({
      totalUsers,
      activeUsers,
      inactiveUsers,
      loggedInToday,
      todayLoginUsers,
      totalCourses,
      totalEnrollments,
      todayRange: { start, end, timezone: 'Asia/Bangkok' },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/users (admin - tạo học sinh)
const createStudent = async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Vui lòng nhập tên học sinh' });

    const DEFAULT_PASSWORD = 'toanthayhieu@123';

    let finalEmail = email ? email.trim().toLowerCase() : null;
    if (!finalEmail) {
      const slug = name.toLowerCase()
        .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
        .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
        .replace(/[ìíịỉĩ]/g, 'i')
        .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
        .replace(/[ùúụủũưừứựửữ]/g, 'u')
        .replace(/[ỳýỵỷỹ]/g, 'y')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '.');
      finalEmail = `${slug}@toanthayhieu.com`;
      let exists = await User.findOne({ email: finalEmail });
      let counter = 1;
      while (exists) {
        finalEmail = `${slug}${counter}@toanthayhieu.com`;
        exists = await User.findOne({ email: finalEmail });
        counter++;
      }
    } else {
      const exists = await User.findOne({ email: finalEmail });
      if (exists) return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    const user = await User.create({ name: name.trim(), email: finalEmail, password: hashed, role: 'student' });

    res.status(201).json({
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt },
      defaultPassword: DEFAULT_PASSWORD,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateStudentProfile = async (req, res) => {
  try {
    const { name, email, isActive } = req.body;
    const $set = {};

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Vui lòng nhập tên học sinh' });
      $set.name = String(name).trim();
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail) return res.status(400).json({ message: 'Vui lòng nhập email' });
      const exists = await User.findOne({ email: normalizedEmail, _id: { $ne: req.params.id } });
      if (exists) return res.status(400).json({ message: 'Email đã được sử dụng' });
      $set.email = normalizedEmail;
    }

    if (isActive !== undefined) {
      $set.isActive = Boolean(isActive);
    }

    const user = await User.findByIdAndUpdate(req.params.id, { $set }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'Không tìm thấy học sinh' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const resetStudentPassword = async (req, res) => {
  try {
    const DEFAULT_PASSWORD = 'toanthayhieu@123';
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'Không tìm thấy học sinh' });
    if (user.role !== 'student') return res.status(400).json({ message: 'Chỉ có thể reset mật khẩu học sinh' });

    user.password = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    await user.save();

    res.json({
      message: 'Đã reset mật khẩu học sinh',
      defaultPassword: DEFAULT_PASSWORD,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getUsers, getUserById, updateUser, updateStudentProfile, resetStudentPassword, deleteUser, getMyEnrollments, getAdminStats, createStudent, studentEnergy };

