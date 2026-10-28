const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');

test('admin student energy listing and balance adjustments', { timeout: 30000 }, async t => {
  process.env.JWT_SECRET = 'student-energy-test-only';
  const database = `student_energy_test_${Date.now()}_${process.pid}`;
  let server;
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    const User = require('../src/models/User');
    const { Profile } = require('../src/models/Community');
    const { grant } = require('../src/services/community');
    await Promise.all([User.init(), Profile.init()]);
    const [admin, a, b] = await User.create([
      { name: 'Admin', email: 'admin@energy.invalid', role: 'admin' },
      { name: 'Student A', email: 'a@energy.invalid' },
      { name: 'Student B', email: 'b@energy.invalid' },
    ]);
    await Profile.create({ user: a._id, energy: 15, studyPoints: 30, communityPoints: 20, grantKeys: ['earned'], inventory: ['sticker-star'] });
    const app = express(); app.use(express.json()); app.use('/users', require('../src/routes/users'));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(user, method, path, body) {
      const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET)}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, data: await r.json() };
    }
    const path = `/users/${a._id}/energy`;
    await t.test('balances are included in paginated searches without creating empty profiles', async () => {
      const list = await request(admin, 'GET', '/users?role=student&search=Student');
      assert.equal(list.status, 200); assert.equal(list.data.total, 2);
      assert.equal(list.data.users.find(u => u._id === String(a._id)).energy, 15);
      assert.equal(list.data.users.find(u => u._id === String(b._id)).energy, 0);
      const page = await request(admin, 'GET', '/users?role=student&search=Student&page=2&limit=1');
      assert.equal(page.data.users.length, 1); assert.equal(page.data.page, 2);
      assert.equal(await Profile.countDocuments({ user: b._id }), 0);
      assert.equal((await request(admin, 'GET', path)).data.energy, 15);
    });
    await t.test('only admins may read or change student balances', async () => {
      assert.equal((await request(null, 'GET', path)).status, 401);
      assert.equal((await request(a, 'GET', path)).status, 403);
      assert.equal((await request(b, 'PUT', path, { energy: 100, expectedEnergy: 15 })).status, 403);
      assert.equal((await request(admin, 'PUT', `/users/${admin._id}/energy`, { energy: 100, expectedEnergy: 0 })).status, 404);
      assert.equal((await request(admin, 'GET', '/users/not-an-id/energy')).status, 400);
      assert.equal((await request(admin, 'GET', `/users/${new mongoose.Types.ObjectId()}/energy`)).status, 404);
    });
    await t.test('invalid numbers never change the balance', async () => {
      for (const energy of [-1, 1.5, '20', null, {}, Number.MAX_SAFE_INTEGER + 1]) {
        assert.equal((await request(admin, 'PUT', path, { energy, expectedEnergy: 15 })).status, 400);
      }
      assert.equal((await request(admin, 'PUT', path, { energy: 20 })).status, 400);
      assert.equal((await Profile.findOne({ user: a._id })).energy, 15);
    });
    await t.test('increase, decrease and zero preserve lifetime points and existing rewards', async () => {
      assert.equal((await request(admin, 'PUT', path, { energy: 50, expectedEnergy: 15 })).data.energy, 50);
      assert.equal((await request(admin, 'PUT', path, { energy: 50, expectedEnergy: 15 })).status, 200, 'repeating a completed set is harmless');
      assert.equal((await request(admin, 'PUT', path, { energy: 10, expectedEnergy: 50 })).data.energy, 10);
      assert.equal((await request(admin, 'PUT', path, { energy: 0, expectedEnergy: 10 })).data.energy, 0);
      const p = await Profile.findOne({ user: a._id }).lean();
      assert.equal(p.studyPoints, 30); assert.equal(p.communityPoints, 20);
      assert.deepEqual(p.grantKeys, ['earned']); assert.deepEqual(p.inventory, ['sticker-star']);
      const first = await request(admin, 'PUT', `/users/${b._id}/energy`, { energy: 12, expectedEnergy: 0 });
      assert.equal(first.status, 200); assert.equal(first.data.energy, 12);
    });
    await t.test('concurrent rewards and other admin updates cannot be silently overwritten', async () => {
      await grant(a._id, 'new-award', 7);
      const stale = await request(admin, 'PUT', path, { energy: 20, expectedEnergy: 0 });
      assert.equal(stale.status, 409); assert.equal(stale.data.energy, 7);
      assert.equal((await request(admin, 'PUT', path, { energy: 20, expectedEnergy: 7 })).status, 200);
      const updates = await Promise.all([30, 40].map(energy => request(admin, 'PUT', path, { energy, expectedEnergy: 20 })));
      assert.deepEqual(updates.map(r => r.status).sort(), [200, 409]);
      const latest = await Profile.findOne({ user: a._id });
      assert.ok([30, 40].includes(latest.energy)); assert.equal(latest.studyPoints, 37);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (mongoose.connection.name === database) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
