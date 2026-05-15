const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getTuitionRecord,
  upsertTuitionRecord,
  listTuitionRecords,
  deleteTuitionRecord,
  updateClassFee,
  getRevenueReport,
} = require('../controllers/tuitionController');

router.use(protect, adminOnly);

router.get('/revenue', getRevenueReport);
router.get('/list', listTuitionRecords);
router.get('/', getTuitionRecord);
router.post('/', upsertTuitionRecord);
router.delete('/:id', deleteTuitionRecord);
router.patch('/class-fee', updateClassFee);

module.exports = router;
