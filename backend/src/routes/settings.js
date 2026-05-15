const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getSettings, updateSettings } = require('../controllers/settingsController');

router.get('/', protect, getSettings);
router.put('/', protect, adminOnly, updateSettings);

module.exports = router;
