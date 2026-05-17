const SiteSettings = require('../models/SiteSettings');

// GET /api/settings  (public — receipt page needs QR)
const getSettings = async (req, res) => {
  try {
    let settings = await SiteSettings.findOne({ key: 'default' });
    if (!settings) settings = await SiteSettings.create({ key: 'default' });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/settings  (admin only)
const updateSettings = async (req, res) => {
  try {
    const {
      schoolName,
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankQrImageUrl,
      receiptNote,
      difficultyLevels,
    } = req.body;

    const updateData = {
      schoolName,
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankQrImageUrl,
      receiptNote,
    };

    // Only update difficultyLevels if provided
    if (difficultyLevels && Array.isArray(difficultyLevels)) {
      updateData.difficultyLevels = difficultyLevels;
    }

    const settings = await SiteSettings.findOneAndUpdate(
      { key: 'default' },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSettings, updateSettings };
