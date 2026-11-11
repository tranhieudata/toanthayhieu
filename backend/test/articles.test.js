const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const { articleInput, slugify } = require('../src/controllers/articleController');

test('article validation handles Vietnamese slugs and rejects invalid publishing data', () => {
  assert.equal(slugify('Cách giải Toán: Đồ thị hàm số!'), 'cach-giai-toan-do-thi-ham-so');
  for (const input of [{}, { title: {} }, { title: 'Test', status: 'other' }, { title: 'Test', slug: 'write' }, { title: 'Test', status: 'published', content: '<p><br></p>' }]) {
    assert.throws(() => articleInput(input));
  }
  assert.equal(articleInput({ title: 'Bản nháp' }).status, 'draft');
  assert.equal(articleInput({ title: 'Ảnh', status: 'published', content: '<p><img src="/uploads/test.png"></p>' }).status, 'published');
  assert.equal('author' in articleInput({ title: 'Test', author: 'injected' }), false);
});

test('article API enforces admin writes, private drafts and publishing lifecycle', { timeout: 30000 }, async t => {
  process.env.JWT_SECRET = 'article-test-only-secret';
  const database = `articles_test_${Date.now()}_${process.pid}`;
  let server;
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    const User = require('../src/models/User');
    const Article = require('../src/models/Article');
    await Promise.all([User.init(), Article.init()]);
    const [admin, student] = await User.create([
      { name: 'Admin', email: 'admin@articles.invalid', password: 'test', role: 'admin' },
      { name: 'Student', email: 'student@articles.invalid', password: 'test' },
    ]);
    const app = express(); app.use(express.json()); app.use('/articles', require('../src/routes/articles'));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/articles`;
    async function request(user, method, route = '', body) {
      const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    }
    const input = { title: 'Lời giải toán', content: '<p>Nội dung $x^2$</p>', category: 'Bài toán & lời giải', excerpt: 'Ví dụ toán' };
    await t.test('only admins can create, update and delete', async () => {
      for (const method of ['POST', 'PUT', 'DELETE']) {
        const route = method === 'POST' ? '' : '/507f1f77bcf86cd799439011';
        assert.equal((await request(null, method, route, method === 'DELETE' ? undefined : input)).status, 401);
        assert.equal((await request(student, method, route, method === 'DELETE' ? undefined : input)).status, 403);
      }
    });
    const draft = await request(admin, 'POST', '', { ...input, author: student._id });
    assert.equal(draft.status, 201); assert.equal(draft.data.slug, 'loi-giai-toan'); assert.equal(draft.data.author, String(admin._id));
    await t.test('drafts cannot be read or listed by guests or students', async () => {
      for (const user of [null, student]) {
        assert.equal((await request(user, 'GET', '/loi-giai-toan')).status, 404);
        assert.equal((await request(user, 'GET', '?manage=true')).data.total, 0);
      }
      assert.equal((await request(admin, 'GET', '?manage=true')).data.total, 1);
      assert.equal((await request(admin, 'GET', '/loi-giai-toan')).status, 200);
    });
    await t.test('publishing makes content public, with search, unique URLs and unpublishing', async () => {
      const url = `/${draft.data._id}`;
      const published = await request(admin, 'PUT', url, { ...input, status: 'published' });
      assert.equal(published.status, 200); assert.ok(published.data.publishedAt);
      const publicRead = await request(null, 'GET', '/loi-giai-toan');
      assert.equal(publicRead.status, 200); assert.equal(publicRead.data.content, input.content);
      assert.equal('password' in publicRead.data.author, false);
      const list = (await request(null, 'GET', '?q=to%C3%A1n')).data;
      assert.equal(list.total, 1); assert.equal('content' in list.articles[0], false);
      assert.equal((await request(null, 'GET', '?q=%5B.*')).data.total, 0, 'search treats regex symbols literally');
      assert.equal((await request(null, 'GET', '?category=Kh%C3%A1c')).data.total, 0);
      assert.equal((await request(admin, 'POST', '', input)).status, 409);
      assert.equal((await request(admin, 'PUT', url, { ...input, status: 'draft' })).status, 200);
      assert.equal((await request(null, 'GET', '/loi-giai-toan')).status, 404);
      assert.equal((await request(admin, 'DELETE', url)).status, 200);
      assert.equal((await request(admin, 'GET', '/loi-giai-toan')).status, 404);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.db?.databaseName === database && /^articles_test_\d+_\d+$/.test(database)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
