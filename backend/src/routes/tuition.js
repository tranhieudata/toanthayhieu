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
  updateTuitionPayment,
} = require('../controllers/tuitionController');

router.use(protect, adminOnly);

router.get('/revenue', getRevenueReport);
router.get('/list', listTuitionRecords);
router.get('/', getTuitionRecord);
router.post('/', upsertTuitionRecord);
router.patch('/class-fee', updateClassFee);
router.patch('/payment', updateTuitionPayment);
router.delete('/:id', deleteTuitionRecord);

module.exports = router;
