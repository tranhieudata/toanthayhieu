const User = require('../models/User');
const Enrollment = require('../models/Enrollment');

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
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    await User.findByIdAndDelete(req.params.id);
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
    const [totalUsers, totalCourses, totalEnrollments] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      require('../models/Course').countDocuments(),
      Enrollment.countDocuments(),
    ]);
    res.json({ totalUsers, totalCourses, totalEnrollments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getUsers, getUserById, updateUser, deleteUser, getMyEnrollments, getAdminStats };
