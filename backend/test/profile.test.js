const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs/promises');
const path = require('path');
const { validBirthday } = require('../src/controllers/profileController');
const { localDay } = require('../src/utils/communityRules');

test('birthday validates real dates, leap years and future dates without timezone shifts', () => {
  for (const value of ['', '2000-02-29', '1900-01-01', '2008-12-31', localDay()]) assert.equal(validBirthday(value), true, value);
  for (const value of ['2001-02-29', '1900-02-29', '2000-02-30', '2000-13-01', '9999-01-01', '1899-12-31', '01/02/2000', null, {}, 123]) assert.equal(validBirthday(value), false, String(value));
});

test('account settings API with isolated MongoDB', { timeout: 60000 }, async t => {
  process.env.JWT_SECRET = 'profile-test-only-secret';
  const database = `profile_test_${Date.now()}_${process.pid}`;
  let server;
  const avatars = [];
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    const User = require('../src/models/User');
    const { Policy } = require('../src/models/Community');
    await Promise.all([User.init(), Policy.init()]);
    const password = await bcrypt.hash('OldPassword2026!', 4);
    const [a, b, admin, oauth] = await User.create([
      { name: 'Bạn An', email: 'an@profile.invalid', password },
      { name: 'Bạn Bình', email: 'binh@profile.invalid', password },
      { name: 'Thầy', email: 'admin@profile.invalid', password, role: 'admin' },
      { name: 'Google User', email: 'google@profile.invalid', googleId: 'test-only-google-id' },
    ]);
    await Policy.create({ curfewEnabled: false, bannedWords: ['vcl'] });
    const app = express(); app.use(express.json());
    app.use('/api/auth', require('../src/routes/auth'));
    app.use('/api/community', require('../src/routes/community'));
    app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(user, method, route, body) {
      const multipart = body instanceof FormData;
      const r = await fetch(base + route, { method, headers: { ...(user ? { Authorization: `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' })}` } : {}), ...(!multipart && body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? multipart ? body : JSON.stringify(body) : undefined });
      return { status: r.status, data: r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.arrayBuffer() };
    }
    const image = () => {
      const form = new FormData();
      form.append('avatar', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'avatar.png');
      return form;
    };
    await t.test('profile updates require authentication and only update the current account', async () => {
      assert.equal((await request(null, 'PUT', '/api/auth/me', { name: 'Không được' })).status, 401);
      const r = await request(a, 'PUT', '/api/auth/me', { name: '  An mới  ', dateOfBirth: '2008-02-29', _id: String(b._id), role: 'admin', email: b.email, isActive: false, password: 'injected' });
      assert.equal(r.status, 200); assert.equal(r.data.user.name, 'An mới'); assert.equal(r.data.user.dateOfBirth, '2008-02-29');
      assert.equal(r.data.user.role, 'student'); assert.equal(r.data.user.email, a.email); assert.equal(r.data.user.hasPassword, true);
      assert.equal('password' in r.data.user, false); assert.equal((await User.findById(b._id)).name, 'Bạn Bình');
      assert.equal((await User.findById(a._id)).isActive, true);
    });
    await t.test('theme is private per account, persists across login and validates both JSON and multipart updates', async () => {
      assert.equal((await request(a, 'GET', '/api/auth/me')).data.user.theme, 'light');
      assert.equal((await request(null, 'PUT', '/api/auth/me', { theme: 'dark' })).status, 401);
      const dark = await request(a, 'PUT', '/api/auth/me', { theme: 'dark', _id: String(b._id) });
      assert.equal(dark.status, 200); assert.equal(dark.data.user.theme, 'dark');
      assert.equal((await request(b, 'GET', '/api/auth/me')).data.user.theme, 'light');
      const login = await request(null, 'POST', '/api/auth/login', { email: a.email, password: 'OldPassword2026!' });
      assert.equal(login.data.user.theme, 'dark');
      for (const theme of ['system', 'white', '', null, {}, true]) {
        assert.equal((await request(a, 'PUT', '/api/auth/me', { theme })).status, 400);
      }
      assert.equal((await request(a, 'GET', '/api/auth/me')).data.user.theme, 'dark');
      await request(a, 'PUT', '/api/auth/me', { phone: 'not-editable' });
      assert.equal((await request(a, 'GET', '/api/auth/me')).data.user.theme, 'dark', 'other profile updates preserve theme');
      const form = new FormData(); form.append('theme', 'light');
      assert.equal((await request(a, 'PUT', '/api/auth/me', form)).data.user.theme, 'light');
      assert.equal((await request(admin, 'PUT', '/api/auth/me', { theme: 'dark' })).data.user.theme, 'dark');
      const people = (await request(b, 'GET', '/api/community/people')).data;
      assert.equal(people.some(person => 'theme' in person), false);
      await User.collection.updateOne({ _id: b._id }, { $unset: { theme: '' } });
      assert.equal((await request(b, 'GET', '/api/auth/me')).data.user.theme, 'light', 'legacy accounts have a default');
    });
    await t.test('invalid names and birthdays are rejected without changing saved details', async () => {
      for (const name of ['', ' '.repeat(3), 'a'.repeat(81), {}, 'vcl']) assert.equal((await request(a, 'PUT', '/api/auth/me', { name })).status, 400);
      for (const dateOfBirth of ['2026-02-30', '9999-01-01', {}, null]) assert.equal((await request(a, 'PUT', '/api/auth/me', { dateOfBirth })).status, 400);
      assert.equal((await User.findById(a._id)).dateOfBirth, '2008-02-29');
    });
    await t.test('profile and login serialize new display name and birthday without password hashes', async () => {
      const own = (await request(a, 'GET', '/api/auth/me')).data.user;
      assert.equal(own.name, 'An mới'); assert.equal(own.dateOfBirth, '2008-02-29'); assert.equal('password' in own, false);
      const login = (await request(null, 'POST', '/api/auth/login', { email: a.email, password: 'OldPassword2026!' })).data.user;
      assert.equal(login.name, 'An mới'); assert.equal(login.dateOfBirth, '2008-02-29'); assert.equal(login.hasPassword, true);
      const people = (await request(b, 'GET', '/api/community/people')).data;
      assert.equal(people.find(p => p._id === String(a._id)).name, 'An mới');
      assert.equal(people.some(p => 'dateOfBirth' in p || 'password' in p), false);
    });
    await t.test('avatar can be uploaded, replaced and removed with managed file cleanup', async () => {
      const first = await request(a, 'PUT', '/api/auth/me', image());
      assert.equal(first.status, 200); avatars.push(first.data.user.avatar);
      assert.match(first.data.user.avatar, /^\/uploads\/avatars\/[a-f0-9-]+\.png$/);
      assert.equal((await request(null, 'GET', first.data.user.avatar)).status, 200);
      const second = await request(a, 'PUT', '/api/auth/me', image());
      assert.equal(second.status, 200); avatars.push(second.data.user.avatar);
      assert.notEqual(second.data.user.avatar, first.data.user.avatar);
      assert.equal((await request(null, 'GET', first.data.user.avatar)).status, 404);
      assert.equal((await request(null, 'GET', second.data.user.avatar)).status, 200);
      assert.equal((await request(a, 'PUT', '/api/auth/me', { removeAvatar: true })).data.user.avatar, '');
      assert.equal((await request(null, 'GET', second.data.user.avatar)).status, 404);
    });
    await t.test('invalid avatar content, conflicting actions and oversized uploads are rejected', async () => {
      const fake = new FormData(); fake.append('avatar', new Blob(['<script>bad</script>'], { type: 'image/png' }), 'fake.png');
      assert.equal((await request(a, 'PUT', '/api/auth/me', fake)).status, 400);
      const conflict = image(); conflict.append('removeAvatar', 'true');
      assert.equal((await request(a, 'PUT', '/api/auth/me', conflict)).status, 400);
      const large = new FormData(); large.append('avatar', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
      assert.equal((await request(a, 'PUT', '/api/auth/me', large)).status, 400);
      await request(a, 'PUT', '/api/auth/me', { avatar: 'https://untrusted.invalid/avatar.svg' });
      assert.equal((await User.findById(a._id)).avatar, '');
    });
    await t.test('birthday can be cleared and admin can update their own profile', async () => {
      assert.equal((await request(a, 'PUT', '/api/auth/me', { dateOfBirth: '' })).data.user.dateOfBirth, '');
      const r = await request(admin, 'PUT', '/api/auth/me', { name: 'Thầy Hiếu', dateOfBirth: '1990-01-02' });
      assert.equal(r.status, 200); assert.equal(r.data.user.role, 'admin'); assert.equal(r.data.user.name, 'Thầy Hiếu');
    });
    await t.test('password change verifies current password and new password limits', async () => {
      for (const currentPassword of ['', 'wrong', {}]) assert.equal((await request(a, 'PUT', '/api/auth/change-password', { currentPassword, newPassword: 'NewPassword2026!' })).status, 400);
      for (const newPassword of ['123', {}, 'x'.repeat(73)]) assert.equal((await request(a, 'PUT', '/api/auth/change-password', { currentPassword: 'OldPassword2026!', newPassword })).status, 400);
      assert.equal((await request(a, 'PUT', '/api/auth/change-password', { currentPassword: 'OldPassword2026!', newPassword: 'NewPassword2026!' })).status, 200);
      assert.equal((await request(null, 'POST', '/api/auth/login', { email: a.email, password: 'OldPassword2026!' })).status, 400);
      const login = await request(null, 'POST', '/api/auth/login', { email: a.email, password: 'NewPassword2026!' });
      assert.equal(login.status, 200); assert.equal('password' in login.data.user, false);
    });
    await t.test('OAuth accounts can set a first password; later changes require the current password', async () => {
      assert.equal((await request(oauth, 'GET', '/api/auth/me')).data.user.hasPassword, false);
      assert.equal((await request(oauth, 'PUT', '/api/auth/change-password', { newPassword: 'FirstPassword2026!' })).status, 200);
      assert.equal((await request(oauth, 'GET', '/api/auth/me')).data.user.hasPassword, true);
      assert.equal((await request(oauth, 'PUT', '/api/auth/change-password', { newPassword: 'OtherPassword2026!' })).status, 400);
      assert.equal((await request(null, 'POST', '/api/auth/login', { email: oauth.email, password: 'FirstPassword2026!' })).status, 200);
    });
    await t.test('disabled accounts cannot edit profile or password', async () => {
      await User.updateOne({ _id: b._id }, { isActive: false });
      assert.equal((await request(b, 'PUT', '/api/auth/me', { name: 'Không được' })).status, 403);
      assert.equal((await request(b, 'PUT', '/api/auth/change-password', { currentPassword: 'OldPassword2026!', newPassword: 'OtherPassword2026!' })).status, 403);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    for (const avatar of avatars) await fs.unlink(path.resolve(__dirname, '../uploads/avatars', path.basename(avatar))).catch(() => {});
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && database.startsWith('profile_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
