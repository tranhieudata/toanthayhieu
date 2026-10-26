const express = require('express');
const router = express.Router();
const passport = require('passport');
const { register, login, getMe, changePassword, oauthCallback } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const { updateProfile } = require('../controllers/profileController');
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
  else cb(new Error('Ảnh đại diện cần là JPEG, PNG hoặc WebP'));
} });

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/me', protect, (req, res, next) => {
  if (!req.user.isActive) return res.status(403).json({ message: 'Tài khoản không hoạt động' });
  avatarUpload.single('avatar')(req, res, error => {
    if (error) return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Ảnh đại diện tối đa 5 MB' : error.message });
    next();
  });
}, updateProfile);
router.put('/change-password', protect, changePassword);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login' }), oauthCallback);

// Facebook OAuth
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback', passport.authenticate('facebook', { session: false, failureRedirect: '/login' }), oauthCallback);

module.exports = router;
