const TuitionRecord = require('../models/TuitionRecord');
const Class = require('../models/Class');

// GET /api/tuition?classId=&month=&year=
const getTuitionRecord = async (req, res) => {
  try {
    const { classId, month, year } = req.query;
    if (!classId || !month || !year) {
      return res.status(400).json({ message: 'Thiếu classId, month hoặc year' });
    }
    const record = await TuitionRecord.findOne({ class: classId, month: Number(month), year: Number(year) })
      .populate('studentAdjustments.student', 'name email');
    res.json(record || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/tuition  — create or replace a tuition record for class+month+year
const upsertTuitionRecord = async (req, res) => {
  try {
    const { classId, month, year, totalSessions, holidaySessions, feePerSession, studentAdjustments, note } = req.body;
    if (!classId || !month || !year || totalSessions == null || feePerSession == null) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    const existingRecord = await TuitionRecord.findOne({ class: classId, month: Number(month), year: Number(year) });
    const existingPaymentByStudent = new Map(
      (existingRecord?.studentAdjustments || []).map((adj) => [
        String(adj.student?._id || adj.student),
        { isPaid: !!adj.isPaid, paidAt: adj.paidAt || null },
      ])
    );

    const record = await TuitionRecord.findOneAndUpdate(
      { class: classId, month: Number(month), year: Number(year) },
      {
        class: classId,
        month: Number(month),
        year: Number(year),
        totalSessions: Number(totalSessions),
        holidaySessions: Number(holidaySessions) || 0,
        feePerSession: Number(feePerSession),
        studentAdjustments: (studentAdjustments || []).map((a) => {
          const studentId = a.student?._id || a.student;
          const previousPayment = existingPaymentByStudent.get(String(studentId));
          return {
            student: studentId,
            absentSessions: Number(a.absentSessions) || 0,
            extraSessions: Number(a.extraSessions) || 0,
            isPaid: a.isPaid != null ? !!a.isPaid : !!previousPayment?.isPaid,
            paidAt: a.isPaid != null ? (a.isPaid ? (a.paidAt || previousPayment?.paidAt || new Date()) : null) : (previousPayment?.paidAt || null),
            note: a.note || '',
          };
        }),
        note: note || '',
        createdBy: req.user._id,
      },
      { upsert: true, new: true, runValidators: true }
    ).populate('studentAdjustments.student', 'name email');

    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/tuition/list?classId=  — list all records for a class
const listTuitionRecords = async (req, res) => {
  try {
    const { classId } = req.query;
    if (!classId) return res.status(400).json({ message: 'Thiếu classId' });
    const records = await TuitionRecord.find({ class: classId })
      .sort({ year: -1, month: -1 })
      .select('month year totalSessions holidaySessions feePerSession note createdAt');
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/tuition/:id
const deleteTuitionRecord = async (req, res) => {
  try {
    await TuitionRecord.findByIdAndDelete(req.params.id);
    res.json({ message: 'Đã xóa bản ghi học phí' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/tuition/class-fee  — update feePerSession on Class model
const updateClassFee = async (req, res) => {
  try {
    const { classId, feePerSession } = req.body;
    if (!classId || feePerSession == null) return res.status(400).json({ message: 'Thiếu classId hoặc feePerSession' });
    const cls = await Class.findByIdAndUpdate(classId, { feePerSession: Number(feePerSession) }, { new: true });
    if (!cls) return res.status(404).json({ message: 'Không tìm thấy lớp' });
    res.json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/tuition/payment - mark one student's tuition row as paid/unpaid
const updateTuitionPayment = async (req, res) => {
  try {
    const { recordId, adjustmentId, classId, className, month, year, studentId, studentName, isPaid } = req.body;
    if ((!recordId || !adjustmentId) && (!month || !year || (!classId && !className) || (!studentId && !studentName))) {
      return res.status(400).json({ message: 'Thiếu thông tin dòng học phí cần cập nhật' });
    }

    let resolvedClassId = classId;
    if (!resolvedClassId && className) {
      const cls = await Class.findOne({ name: className }).select('_id');
      resolvedClassId = cls?._id;
    }

    const record = recordId
      ? await TuitionRecord.findById(recordId).populate('studentAdjustments.student', 'name email')
      : await TuitionRecord.findOne({ class: resolvedClassId, month: Number(month), year: Number(year) }).populate('studentAdjustments.student', 'name email');
    if (!record) return res.status(404).json({ message: 'Không tìm thấy bảng học phí' });

    const adjustment = adjustmentId
      ? record.studentAdjustments.id(adjustmentId)
      : record.studentAdjustments.find((item) => {
          const sameStudentId = studentId && String(item.student?._id || item.student) === String(studentId);
          const sameStudentName = studentName && item.student?.name === studentName;
          return sameStudentId || sameStudentName;
        });
    if (!adjustment) return res.status(404).json({ message: 'Không tìm thấy học sinh trong bảng học phí' });

    adjustment.isPaid = !!isPaid;
    adjustment.paidAt = adjustment.isPaid ? (adjustment.paidAt || new Date()) : null;
    await record.save();

    res.json({ recordId, adjustmentId, isPaid: adjustment.isPaid, paidAt: adjustment.paidAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/tuition/revenue?fromMonth=1&fromYear=2026&toMonth=6&toYear=2026
const getRevenueReport = async (req, res) => {
  try {
    const { fromMonth, fromYear, toMonth, toYear } = req.query;
    if (!fromMonth || !fromYear || !toMonth || !toYear) {
      return res.status(400).json({ message: 'Thiếu tham số: fromMonth, fromYear, toMonth, toYear' });
    }
    const fm = Number(fromMonth), fy = Number(fromYear);
    const tm = Number(toMonth), ty = Number(toYear);
    if (fy * 12 + fm > ty * 12 + tm) {
      return res.status(400).json({ message: 'Tháng bắt đầu phải trước hoặc bằng tháng kết thúc' });
    }

    const records = await TuitionRecord.find({
      $and: [
        { $or: [{ year: { $gt: fy } }, { year: fy, month: { $gte: fm } }] },
        { $or: [{ year: { $lt: ty } }, { year: ty, month: { $lte: tm } }] },
      ],
    })
      .populate('class', 'name')
      .populate('studentAdjustments.student', 'name email')
      .sort({ year: 1, month: 1 });

    const rows = [];
    let total = 0;
    let paidTotal = 0;
    let unpaidTotal = 0;

    for (const record of records) {
      const effectiveSessions = record.totalSessions - record.holidaySessions;
      for (const adj of record.studentAdjustments) {
        const sessions = Math.max(0, effectiveSessions - adj.absentSessions + adj.extraSessions);
        const amount = sessions * record.feePerSession;
        if (amount > 0) {
          const isPaid = !!adj.isPaid;
          rows.push({
            recordId: record._id,
            adjustmentId: adj._id,
            month: record.month,
            year: record.year,
            classId: record.class?._id || record.class,
            className: record.class?.name || '',
            studentName: adj.student?.name || '',
            studentId: adj.student?._id || adj.student,
            sessions,
            feePerSession: record.feePerSession,
            amount,
            isPaid,
            paidAt: adj.paidAt,
          });
          total += amount;
          if (isPaid) paidTotal += amount;
          else unpaidTotal += amount;
        }
      }
    }

    // Sort rows within each month group by className then studentName
    rows.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.month !== b.month) return a.month - b.month;
      if (a.className !== b.className) return a.className.localeCompare(b.className, 'vi');
      return a.studentName.localeCompare(b.studentName, 'vi');
    });

    res.json({ rows, total, paidTotal, unpaidTotal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getTuitionRecord, upsertTuitionRecord, listTuitionRecords, deleteTuitionRecord, updateClassFee, getRevenueReport, updateTuitionPayment };
