function sessionDayRange(value) {
  const start = new Date(value);
  if (!value || !Number.isFinite(start.getTime())) throw new Error('Ngày dạy không hợp lệ');
  start.setUTCHours(0, 0, 0, 0);
  return { $gte: start, $lt: new Date(start.getTime() + 86400000) };
}

module.exports = { sessionDayRange };
