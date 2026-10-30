const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');

test('my-submission distinguishes unsubmitted homework from missing homework', { timeout: 30000 }, async () => {
  process.env.JWT_SECRET = 'homework-submission-test-only';
  const database = `homework_submission_test_${Date.now()}_${process.pid}`;
  let server;
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    const User = require('../src/models/User');
    const Class = require('../src/models/Class');
    const Homework = require('../src/models/Homework');
    const Submission = require('../src/models/HomeworkSubmission');
    require('../src/models/Exam');
    const [student, otherStudent, admin] = await User.create([
      { name: 'Student', email: 'student@submission.invalid' },
      { name: 'Other student', email: 'other@submission.invalid' },
      { name: 'Admin', email: 'admin@submission.invalid', role: 'admin' },
    ]);
    const classroom = await Class.create({ name: 'Test class', students: [student._id, otherStudent._id] });
    const homework = await Homework.create({ title: 'Test homework', class: classroom._id, createdBy: admin._id });
    const app = express();
    app.use('/api/homeworks', require('../src/routes/homeworks'));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    async function request(user, homeworkId) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/homeworks/${homeworkId}/my-submission`, {
        headers: user ? { Authorization: `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET)}` } : {},
      });
      return { status: response.status, data: await response.json() };
    }
    assert.equal((await request(null, homework._id)).status, 401);
    assert.deepEqual(await request(student, homework._id), { status: 200, data: null });
    assert.equal((await request(student, new mongoose.Types.ObjectId())).status, 404);
    const submission = await Submission.create({ homework: homework._id, class: classroom._id, student: student._id, status: 'graded', score: 8 });
    const result = await request(student, homework._id);
    assert.equal(result.status, 200);
    assert.equal(result.data._id, String(submission._id));
    assert.equal(result.data.score, 8);
    assert.deepEqual(await request(otherStudent, homework._id), { status: 200, data: null });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
