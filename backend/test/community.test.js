const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs/promises');
const path = require('path');
const { fork } = require('child_process');
const { containsBanned, inCurfew, localDay } = require('../src/utils/communityRules');

test('Vietnamese moderation and curfew boundaries', () => {
  const banned = ['địt', 'đụ', 'lồn', 'ma túy', 'vcl'];
  for (const text of ['ĐỊT', 'DIT', 'đ.ị.t', 'l ồ n', 'MA TUY', 'v\u200bcl']) assert.equal(containsBanned(text, banned), true, text);
  for (const text of ['Bài giải đầy đủ', 'Cây lớn lên', 'Con lợn', 'Học vui mỗi ngày']) assert.equal(containsBanned(text, banned), false, text);
  const p = { curfewEnabled: true, curfewStart: '22:00', curfewEnd: '06:00' };
  assert.equal(inCurfew(p, new Date('2026-10-01T14:59:00Z')), false);
  assert.equal(inCurfew(p, new Date('2026-10-01T15:00:00Z')), true);
  assert.equal(inCurfew(p, new Date('2026-10-01T22:59:00Z')), true);
  assert.equal(inCurfew(p, new Date('2026-10-01T23:00:00Z')), false);
  assert.equal(inCurfew({ ...p, curfewStart: '12:00', curfewEnd: '14:00' }, new Date('2026-10-01T06:00:00Z')), true);
  assert.equal(localDay(new Date('2026-10-01T18:00:00Z')), '2026-10-02');
});

test('story cleanup schedules the next Vietnam midnight independently of VPS timezone', () => {
  const { untilNextCleanup } = require('../src/services/storyCleanup');
  assert.equal(untilNextCleanup(new Date('2026-10-29T16:59:59.000Z')), 1000);
  assert.equal(untilNextCleanup(new Date('2026-10-29T17:00:00.000Z')), 86400000);
  assert.equal(untilNextCleanup(new Date('2026-10-29T05:00:00.000Z')), 43200000);
  assert.equal(untilNextCleanup(new Date('2026-12-31T16:59:59.999Z')), 1);
});

// Requires local MongoDB. Every run uses an isolated database; never loads project .env.
test('community API integration with real MongoDB', { timeout: 60000 }, async t => {
  process.env.JWT_SECRET = 'community-test-only-not-a-production-secret';
  const database = `community_test_${Date.now()}_${process.pid}`;
  let server;
  const imagePaths = [];
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
    const User = require('../src/models/User');
    const Class = require('../src/models/Class');
    const HomeworkSubmission = require('../src/models/HomeworkSubmission');
    const models = require('../src/models/Community');
    const { Policy, Post, Comment, Profile, Attempt, Challenge, Friendship, Message, Notification, Event } = models;
    const { grant, ensureProfile } = require('../src/services/community');
    await Promise.all([User, Class, HomeworkSubmission, ...Object.values(models)].map(m => m.init()));
    const [a, b, outsider, admin, studentAdmin] = await User.create([
      { name: 'An', email: 'a@test.invalid' }, { name: 'Bình', email: 'b@test.invalid' },
      { name: 'Châu', email: 'c@test.invalid' }, { name: 'Admin', email: 'admin@test.invalid', role: 'admin' },
      { name: 'Admin', email: 'student-admin@test.invalid', role: 'student' },
    ]);
    const cls = await Class.create({ name: 'Lớp kiểm thử', students: [a._id, b._id] });
    await Policy.create({ curfewEnabled: false, bannedWords: ['địt', 'đụ', 'lồn', 'vcl', 'từ cấm'] });
    const legacyStoryImage = `legacy-story-${process.pid}-${Date.now()}.png`;
    imagePaths.push(legacyStoryImage);
    await fs.mkdir(path.resolve(__dirname, '../community-uploads'), { recursive: true });
    await fs.writeFile(path.resolve(__dirname, '../community-uploads', legacyStoryImage), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const [legacyStory, rejectedStory, expiredPendingStory, pendingStudy] = await Post.create([
      { author: a._id, text: 'Tin cũ chờ duyệt', kind: 'story', status: 'pending', image: legacyStoryImage, expiresAt: new Date(Date.now() + 86400000) },
      { author: a._id, text: 'Tin đã gỡ', kind: 'story', status: 'rejected', expiresAt: new Date(Date.now() + 86400000) },
      { author: a._id, text: 'Tin cũ hết hạn', kind: 'story', status: 'pending', expiresAt: new Date(0) },
      { author: a._id, text: 'Bài chờ duyệt', kind: 'study', status: 'pending' },
    ]);
    const app = express(); app.use(express.json()); app.use('/api/community', require('../src/routes/community'));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/community`;
    const token = user => jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
    async function request(user, method, route, body, baseUrl = base) {
      const form = body instanceof FormData;
      const r = await fetch(baseUrl + route, { method, headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), ...(!form && body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? form ? body : JSON.stringify(body) : undefined });
      const data = r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.arrayBuffer();
      return { status: r.status, data };
    }
    let post, photo, challenge;
    function events(reader) {
      let buffer = '';
      return async function until(predicate) {
        for (;;) {
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const line = block.split('\n').find(l => l.startsWith('data:'));
            if (line) { const event = JSON.parse(line.slice(5)); if (predicate(event)) return event; }
          }
          const next = await reader.read();
          if (next.done) throw new Error('Event stream closed before delivery');
          buffer += new TextDecoder().decode(next.value);
        }
      };
    }
    await t.test('authentication, admin access and malformed IDs', async () => {
      assert.equal((await request(null, 'GET', '/posts')).status, 401);
      assert.equal((await request(a, 'GET', '/admin')).status, 403);
      assert.equal((await request(a, 'GET', '/posts/not-an-id')).status, 400);
      assert.equal((await request(a, 'POST', '/admin/challenges', {})).status, 403);
    });
    await t.test('old pending stories become viewable after upgrading while removed and expired stories stay hidden', async () => {
      assert.equal((await Post.findById(legacyStory._id)).status, 'approved');
      const list = (await request(b, 'GET', '/stories')).data;
      assert.equal(list.some(s => s._id === String(legacyStory._id)), true);
      assert.equal((await request(b, 'GET', `/posts/${legacyStory._id}`)).status, 200);
      assert.equal((await request(b, 'GET', `/posts/${legacyStory._id}/image`)).status, 200);
      assert.equal((await request(a, 'GET', '/my-posts')).data.some(s => s._id === String(legacyStory._id)), false);
      assert.equal((await Post.findById(rejectedStory._id)).status, 'rejected');
      assert.equal((await Post.findById(expiredPendingStory._id)).status, 'pending');
      assert.equal((await Post.findById(pendingStudy._id)).status, 'pending');
      for (const p of [rejectedStory, expiredPendingStory]) assert.equal(list.some(s => s._id === String(p._id)), false);
    });
    await t.test('personal wall exposes garden achievements without private account data', async () => {
      assert.equal((await request(null, 'GET', `/people/${outsider._id}/wall`)).status, 401);
      assert.equal((await request(a, 'GET', '/people/not-an-id/wall')).status, 400);
      assert.equal((await request(a, 'GET', `/people/${new mongoose.Types.ObjectId()}/wall`)).status, 404);
      const empty = await request(a, 'GET', `/people/${outsider._id}/wall`);
      assert.equal(empty.status, 200);
      assert.equal(empty.data.person.name, outsider.name);
      assert.equal(empty.data.garden.growth, 0);
      assert.equal(empty.data.postCount, 0);
      assert.equal(empty.data.person.email, undefined);
      assert.equal(await Profile.countDocuments({ user: outsider._id }), 0);
      await Profile.create({ user: outsider._id, studyPoints: 40, communityPoints: 15, growth: 7,
        inventory: ['sticker-sprout'], grantKeys: ['private-key'], waterTask: { answer: 42 }, energy: 20 });
      await models.MonthlyAward.create({ student: outsider._id, month: '2026-10', gift: 'Chăm học' });
      await Post.create([
        { author: outsider._id, text: 'Bài công khai', status: 'approved' },
        { author: outsider._id, text: 'Chờ duyệt', status: 'pending' },
        { author: outsider._id, text: 'Tin đã hết hạn', kind: 'story', expiresAt: new Date(0) },
      ]);
      const wall = (await request(b, 'GET', `/people/${outsider._id}/wall`)).data;
      assert.equal(wall.garden.studyPoints, 40);
      assert.equal(wall.garden.communityPoints, 15);
      assert.equal(wall.garden.growth, 7);
      assert.equal(wall.garden.rewards[0].id, 'sticker-sprout');
      assert.deepEqual(wall.awards, [{ month: '2026-10', gift: 'Chăm học' }]);
      assert.equal(wall.postCount, 1);
      for (const field of ['energy', 'grantKeys', 'waterTask', 'gameUntil', 'redemptions']) assert.equal(wall.garden[field], undefined);
      const wallPosts = (await request(b, 'GET', `/posts?author=${outsider._id}`)).data;
      assert.equal(wallPosts.length, 1);
      assert.equal(wallPosts[0].text, 'Bài công khai');
      await Post.deleteMany({ author: outsider._id });
      await Profile.deleteOne({ user: outsider._id });
      await models.MonthlyAward.deleteMany({ student: outsider._id });
    });
    await t.test('post, wall, positive reactions and notifications', async () => {
      const r = await request(a, 'POST', '/posts', { text: 'Bài giải đầy đủ, cùng học nhé!', kind: 'study' });
      assert.equal(r.status, 201); post = r.data;
      assert.equal((await request(b, 'GET', `/posts?author=${a._id}`)).data.length, 1);
      assert.equal((await request(b, 'POST', `/posts/${post._id}/reactions`, { kind: 'heart' })).status, 200);
      await request(b, 'POST', `/posts/${post._id}/reactions`, { kind: 'cheer' });
      const decorated = (await request(a, 'GET', `/posts/${post._id}`)).data;
      assert.deepEqual(decorated.reactions, { heart: 0, cheer: 1, helpful: 0 });
      assert.equal((await request(a, 'GET', '/notifications')).data.unread, 2);
      assert.equal((await request(b, 'DELETE', `/posts/${post._id}`)).status, 403);
    });
    await t.test('strangers and pending requests cannot read or send messages', async () => {
      assert.equal((await request(a, 'POST', `/messages/${b._id}`, { text: 'Xin chào' })).status, 403);
      assert.equal((await request(a, 'GET', `/messages/${b._id}`)).status, 403);
      assert.equal((await request(a, 'POST', `/friends/${a._id}/request`, {})).status, 400);
      assert.equal((await request(a, 'POST', `/friends/${new mongoose.Types.ObjectId()}/request`, {})).status, 404);
      assert.equal((await request(a, 'POST', `/friends/${b._id}/request`, {})).status, 200);
      const before = await Notification.countDocuments({ user: b._id });
      assert.equal((await request(a, 'POST', `/friends/${b._id}/request`, {})).status, 200);
      assert.equal(await Notification.countDocuments({ user: b._id }), before, 'repeated requests do not spam notifications');
      assert.equal((await request(a, 'GET', '/friends')).data.outgoing[0]._id, String(b._id));
      assert.equal((await request(b, 'GET', '/friends')).data.incoming[0]._id, String(a._id));
      assert.equal((await request(b, 'POST', `/messages/${a._id}`, { text: 'Xin chào' })).status, 403);
      assert.equal((await request(a, 'POST', `/friends/${b._id}/accept`, {})).status, 403);
      assert.equal((await request(outsider, 'POST', `/friends/${a._id}/accept`, {})).status, 403);
      assert.equal((await request(b, 'POST', `/friends/${a._id}/request`, {})).status, 409);
    });
    await t.test('only recipient can accept; both sides then see the same friendship', async () => {
      assert.equal((await request(b, 'POST', `/friends/${a._id}/accept`, {})).status, 200);
      const left = (await request(a, 'GET', '/friends')).data;
      const right = (await request(b, 'GET', '/friends')).data;
      assert.equal(left.friends[0]._id, String(b._id)); assert.equal(right.friends[0]._id, String(a._id));
      assert.equal(left.outgoing.length, 0); assert.equal(right.incoming.length, 0);
      assert.equal(await Friendship.countDocuments(), 1);
    });
    await t.test('friend requests can be rejected or withdrawn without granting chat access', async () => {
      await request(outsider, 'POST', `/friends/${b._id}/request`, {});
      assert.equal((await request(a, 'DELETE', `/friends/${outsider._id}`)).status, 404);
      assert.equal((await request(b, 'DELETE', `/friends/${outsider._id}`)).status, 200);
      assert.equal((await request(outsider, 'POST', `/messages/${b._id}`, { text: 'Xin chào' })).status, 403);
      await request(outsider, 'POST', `/friends/${b._id}/request`, {});
      assert.equal((await request(outsider, 'DELETE', `/friends/${b._id}`)).status, 200);
      assert.equal((await request(b, 'POST', `/friends/${outsider._id}/accept`, {})).status, 403);
    });
    await t.test('duplicate Admin names are discoverable with distinct roles and account IDs', async () => {
      const people = await request(outsider, 'GET', '/people?q=Admin');
      assert.equal(people.status, 200);
      assert.equal(people.data.length, 2);
      assert.equal(people.data.find(p => p._id === String(admin._id)).role, 'admin');
      assert.equal(people.data.find(p => p._id === String(studentAdmin._id)).role, 'student');
      assert.equal(people.data.some(p => 'email' in p), false);
      assert.equal((await request(outsider, 'GET', '/students?q=Admin')).data.length, 2, 'legacy discovery alias stays compatible');
    });
    await t.test('invitation to student named Admin cannot appear in real administrator account', async () => {
      assert.equal((await request(outsider, 'POST', `/friends/${studentAdmin._id}/request`, {})).status, 200);
      assert.equal((await request(studentAdmin, 'GET', '/friends')).data.incoming[0]._id, String(outsider._id));
      assert.equal((await request(admin, 'GET', '/friends')).data.incoming.length, 0);
      assert.equal((await request(admin, 'POST', `/friends/${outsider._id}/accept`, {})).status, 403, 'a matching display name never grants another account access');
      await request(outsider, 'DELETE', `/friends/${studentAdmin._id}`);
    });
    await t.test('student invitation reaches admin, opens chat only after acceptance, and revokes on unfriend', async () => {
      assert.equal((await request(admin, 'GET', `/messages/${outsider._id}`)).status, 403);
      assert.equal((await request(admin, 'POST', `/messages/${outsider._id}`, { text: 'Chưa kết bạn' })).status, 403);
      assert.equal((await request(outsider, 'POST', `/friends/${admin._id}/request`, {})).status, 200);
      const incoming = (await request(admin, 'GET', '/friends')).data.incoming;
      assert.equal(incoming[0]._id, String(outsider._id)); assert.equal(incoming[0].role, 'student');
      assert.equal((await request(outsider, 'GET', '/friends')).data.outgoing[0].role, 'admin');
      assert.equal((await request(admin, 'GET', '/notifications')).data.items[0].kind, 'friendship');
      assert.equal((await request(outsider, 'POST', `/messages/${admin._id}`, { text: 'Chưa chấp nhận' })).status, 403);
      assert.equal((await request(admin, 'POST', `/friends/${outsider._id}/accept`, {})).status, 200);
      assert.equal((await request(outsider, 'POST', `/messages/${admin._id}`, { text: 'Em chào thầy' })).status, 201);
      assert.equal((await request(admin, 'GET', '/inbox')).data[0]._id, String(outsider._id));
      assert.equal((await request(admin, 'GET', `/messages/${outsider._id}`)).data.at(-1).text, 'Em chào thầy');
      assert.equal((await request(admin, 'POST', `/messages/${outsider._id}`, { text: 'Chào con' })).status, 201);
      assert.equal((await request(outsider, 'GET', `/messages/${admin._id}`)).data.at(-1).text, 'Chào con');
      assert.equal((await request(admin, 'DELETE', `/friends/${outsider._id}`)).status, 200);
      assert.equal((await request(admin, 'GET', `/messages/${outsider._id}`)).status, 403);
      assert.equal((await request(outsider, 'POST', `/messages/${admin._id}`, { text: 'Đã hủy' })).status, 403);
    });
    await t.test('banned content blocked in posts, comments and chat', async () => {
      assert.equal((await request(a, 'POST', '/posts', { text: 'vcl' })).status, 400);
      assert.equal((await request(b, 'POST', `/posts/${post._id}/comments`, { text: 'đ.ị.t' })).status, 400);
      assert.equal((await request(a, 'POST', `/messages/${b._id}`, { text: 'TỪ CẤM' })).status, 400);
    });
    await t.test('SSE pushes a notification after a real comment', async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const stream = await fetch(base + '/events', { headers: { Authorization: `Bearer ${token(a)}` }, signal: controller.signal });
        assert.equal(stream.status, 200);
        const until = events(stream.body.getReader());
        await until(e => e.type === 'connected');
        assert.equal((await request(b, 'POST', `/posts/${post._id}/comments`, { text: 'Cách giải rất hay!' })).status, 201);
        const notification = await Notification.findOne({ user: a._id }).sort({ _id: -1 });
        await until(e => e.type === 'notification' && e.notificationId === String(notification._id));
      } finally { clearTimeout(timeout); controller.abort(); }
    });
    await t.test('private chat and unread state', async () => {
      assert.equal((await request(a, 'POST', `/messages/${b._id}`, { text: 'Cùng ôn bài nhé' })).status, 201);
      assert.equal((await request(b, 'GET', '/inbox')).data[0].count, 1);
      assert.equal((await request(outsider, 'GET', `/messages/${b._id}`)).status, 403);
      assert.equal((await request(b, 'GET', `/messages/${a._id}`)).data[0].text, 'Cùng ôn bài nhé');
      assert.equal((await request(b, 'GET', '/inbox')).data.length, 0);
    });
    await t.test('two users exchange live messages across separate backend processes', async () => {
      const worker = fork(path.join(__dirname, 'fixtures/community-server.js'), [], { env: { ...process.env, COMMUNITY_TEST_DB: database }, silent: true });
      const controllerA = new AbortController(), controllerB = new AbortController();
      const timeout = setTimeout(() => { controllerA.abort(); controllerB.abort(); }, 15000);
      try {
        const port = await new Promise((resolve, reject) => {
          worker.once('message', result => resolve(result.port));
          worker.once('error', reject);
          worker.once('exit', code => reject(new Error(`Second backend exited (${code})`)));
        });
        const second = `http://127.0.0.1:${port}/api/community`;
        const [streamA, streamB] = await Promise.all([
          fetch(base + '/events', { headers: { Authorization: `Bearer ${token(a)}` }, signal: controllerA.signal }),
          fetch(second + '/events', { headers: { Authorization: `Bearer ${token(b)}` }, signal: controllerB.signal }),
        ]);
        const untilA = events(streamA.body.getReader()), untilB = events(streamB.body.getReader());
        await Promise.all([untilA(e => e.type === 'connected'), untilB(e => e.type === 'connected')]);
        const sent = await request(a, 'POST', `/messages/${b._id}`, { text: 'Tin từ máy chủ thứ nhất' });
        assert.equal(sent.status, 201);
        assert.equal((await untilB(e => e.type === 'message' && e.messageId === sent.data._id)).peer, String(a._id));
        assert.equal((await request(b, 'GET', `/messages/${a._id}`, undefined, second)).data.at(-1).text, 'Tin từ máy chủ thứ nhất');
        const reply = await request(b, 'POST', `/messages/${a._id}`, { text: 'Phản hồi từ máy chủ thứ hai' }, second);
        assert.equal(reply.status, 201);
        assert.equal((await untilA(e => e.type === 'message' && e.messageId === reply.data._id)).peer, String(b._id));
        assert.equal((await request(a, 'GET', `/messages/${b._id}`)).data.at(-1).text, 'Phản hồi từ máy chủ thứ hai');
      } finally {
        clearTimeout(timeout); controllerA.abort(); controllerB.abort();
        if (worker.exitCode === null) {
          await new Promise(resolve => { const timer = setTimeout(() => worker.kill(), 3000); worker.once('exit', () => { clearTimeout(timer); resolve(); }); worker.send('shutdown'); });
        }
      }
    });
    await t.test('unfriending revokes both directions, hides inbox, and preserves historical data', async () => {
      const count = await Message.countDocuments();
      await request(a, 'POST', `/messages/${b._id}`, { text: 'Tin trước khi hủy kết bạn' });
      assert.equal((await request(a, 'DELETE', `/friends/${b._id}`)).status, 200);
      for (const [sender, recipient] of [[a, b], [b, a]]) {
        assert.equal((await request(sender, 'POST', `/messages/${recipient._id}`, { text: 'Không được gửi' })).status, 403);
        assert.equal((await request(sender, 'GET', `/messages/${recipient._id}`)).status, 403);
      }
      assert.equal((await request(b, 'GET', '/inbox')).data.length, 0);
      assert.equal(await Message.countDocuments(), count + 1);
      assert.equal((await request(a, 'GET', '/friends')).data.friends.length, 0);
      assert.equal((await request(b, 'GET', '/friends')).data.friends.length, 0);
      await request(a, 'POST', `/friends/${b._id}/request`, {});
      await request(b, 'POST', `/friends/${a._id}/accept`, {});
      assert.equal((await request(b, 'GET', `/messages/${a._id}`)).status, 200);
    });
    await t.test('curfew enforced for all writing endpoints', async () => {
      const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      const [h, m] = time.split(':').map(Number), endMinute = (h * 60 + m + 2) % 1440;
      await Policy.updateOne({}, { curfewEnabled: true, curfewStart: time, curfewEnd: `${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}` });
      assert.equal((await request(a, 'POST', '/posts', { text: 'Cùng học' })).status, 403);
      assert.equal((await request(b, 'POST', `/posts/${post._id}/comments`, { text: 'Cùng học' })).status, 403);
      assert.equal((await request(a, 'POST', `/messages/${b._id}`, { text: 'Cùng học' })).status, 403);
      await Policy.updateOne({}, { curfewEnabled: false });
    });
    await t.test('uploaded images quarantined until reviewed, daily points granted once', async () => {
      const data = new FormData(); data.append('text', 'Tóm tắt bài học'); data.append('hasImage', 'true');
      data.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'study.png');
      const r = await request(a, 'POST', '/posts', data); assert.equal(r.status, 201); photo = r.data; imagePaths.push(photo.image);
      assert.equal(photo.status, 'pending');
      assert.equal((await request(b, 'GET', `/posts/${photo._id}/image`)).status, 403);
      assert.equal((await request(a, 'GET', `/posts/${photo._id}/image`)).status, 200);
      assert.equal((await request(b, 'GET', `/posts/${photo._id}`)).status, 404);
      assert.equal((await request(admin, 'POST', `/admin/posts/${photo._id}/review`, { status: 'approved' })).status, 200);
      assert.equal((await request(b, 'GET', `/posts/${photo._id}/image`)).status, 200);
      assert.equal((await Profile.findOne({ user: a._id })).energy, 15);
      assert.equal((await request(admin, 'POST', `/admin/posts/${photo._id}/review`, { status: 'approved' })).status, 409);
      assert.equal((await Profile.findOne({ user: a._id })).energy, 15);
    });
    await t.test('photo stories publish immediately without text and only the owner or admin can delete them', async () => {
      const form = new FormData();
      form.append('kind', 'story'); form.append('hasImage', 'true');
      form.append('image', new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'story.png');
      const result = await request(a, 'POST', '/posts', form);
      assert.equal(result.status, 201);
      imagePaths.push(result.data.image);
      assert.equal(result.data.kind, 'story');
      assert.equal(result.data.text, 'Tin 24 giờ');
      assert.equal(result.data.status, 'approved');
      assert.ok(Math.abs(new Date(result.data.expiresAt) - new Date(result.data.createdAt) - 86400000) < 2000);
      assert.equal((await request(a, 'GET', '/my-posts')).data.some(p => p._id === result.data._id && p.image), false);
      assert.equal((await request(a, 'GET', `/posts/${result.data._id}/image`)).status, 200);
      assert.equal((await request(b, 'GET', `/posts/${result.data._id}/image`)).status, 200);
      assert.equal((await request(b, 'GET', `/posts/${result.data._id}`)).data.kind, 'story');
      assert.equal((await request(b, 'GET', '/stories')).data.some(p => p._id === result.data._id), true);
      assert.equal((await request(b, 'DELETE', `/posts/${result.data._id}`)).status, 403);
      assert.equal((await request(b, 'GET', `/posts/${result.data._id}/image`)).status, 200);
      await Comment.create({ post: result.data._id, author: b._id, text: 'Cố lên' });
      assert.equal((await request(a, 'DELETE', `/posts/${result.data._id}`)).status, 200);
      assert.equal(await Post.findById(result.data._id), null);
      assert.equal(await Comment.countDocuments({ post: result.data._id }), 0);
      for (const viewer of [a, b, admin]) assert.equal((await request(viewer, 'GET', `/posts/${result.data._id}/image`)).status, 404);
      await assert.rejects(fs.access(path.resolve(__dirname, '../community-uploads', result.data.image)), { code: 'ENOENT' });
      assert.equal((await request(b, 'GET', '/stories')).data.some(p => p._id === result.data._id), false);
      const adminRemoved = await Post.create({ author: a._id, kind: 'story', text: 'Tin để gỡ', expiresAt: new Date(Date.now() + 86400000) });
      assert.equal((await request(admin, 'DELETE', `/posts/${adminRemoved._id}`)).status, 200);
      assert.equal(await Post.findById(adminRemoved._id), null);
      assert.equal((await request(a, 'POST', '/posts', { kind: 'story', text: '' })).status, 400);
    });
    await t.test('stories expire and removed images become inaccessible', async () => {
      const story = await Post.create({ author: a._id, text: 'Tin cũ', kind: 'story', expiresAt: new Date(Date.now() - 1000) });
      assert.equal((await request(b, 'GET', '/stories')).data.some(s => s._id === String(story._id)), false);
      assert.equal((await request(b, 'GET', `/posts/${story._id}`)).status, 404);
      await request(a, 'DELETE', `/posts/${photo._id}`);
      assert.equal((await request(b, 'GET', `/posts/${photo._id}/image`)).status, 403);
    });
    await t.test('story cleanup removes expired files and related data, preserving active stories and regular posts', async () => {
      const { cleanupExpiredStories } = require('../src/services/storyCleanup');
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 1);
      const created = await request(a, 'POST', '/posts', { text: 'Tin mới', kind: 'story' });
      assert.equal(created.status, 201);
      assert.ok(Math.abs(new Date(created.data.expiresAt) - new Date(created.data.createdAt) - 86400000) < 2000);
      const filenames = ['expired', 'pending', 'rejected', 'active', 'regular'].map(label => `cleanup-${process.pid}-${Date.now()}-${label}.png`);
      await fs.mkdir(path.resolve(__dirname, '../community-uploads'), { recursive: true });
      for (const filename of filenames) {
        imagePaths.push(filename);
        await fs.writeFile(path.resolve(__dirname, '../community-uploads', filename), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      }
      const [expired, pending, rejected, active, regular] = await Post.create([
        { author: a._id, text: 'Tin hết hạn', kind: 'story', image: filenames[0], expiresAt },
        { author: a._id, text: 'Tin chờ duyệt', kind: 'story', image: filenames[1], status: 'pending', expiresAt },
        { author: a._id, text: 'Tin bị từ chối', kind: 'story', image: filenames[2], status: 'rejected', expiresAt },
        { author: a._id, text: 'Tin còn hạn', kind: 'story', image: filenames[3], expiresAt: new Date(now.getTime() + 60000) },
        { author: a._id, text: 'Chia sẻ', kind: 'study', image: filenames[4] },
      ]);
      await Comment.create({ post: expired._id, author: b._id, text: 'Cố lên' });
      await models.Reaction.create({ post: expired._id, user: b._id, kind: 'heart' });
      await Notification.create({ post: expired._id, user: a._id, text: 'Tin cũ' });
      for (const viewer of [a, b, admin]) assert.equal((await request(viewer, 'GET', `/posts/${expired._id}/image`)).status, 404);
      const stories = (await request(b, 'GET', '/stories')).data;
      assert.equal(stories.find(s => s._id === String(active._id)).image, true);
      await cleanupExpiredStories(now);
      await cleanupExpiredStories(now);
      for (const p of [expired, pending, rejected]) assert.equal(await Post.findById(p._id), null);
      for (const filename of filenames.slice(0, 3)) await assert.rejects(fs.access(path.resolve(__dirname, '../community-uploads', filename)), { code: 'ENOENT' });
      for (const p of [active, regular]) assert.ok(await Post.findById(p._id));
      for (const filename of filenames.slice(3)) await fs.access(path.resolve(__dirname, '../community-uploads', filename));
      for (const model of [Comment, models.Reaction, Notification]) assert.equal(await model.countDocuments({ post: expired._id }), 0);
    });
    await t.test('helpful answer reward is owner-authorized and idempotent', async () => {
      const question = await Post.create({ author: a._id, text: 'Giúp mình bài này', image: 'test-only.png', kind: 'question' });
      const comment = await Comment.create({ post: question._id, author: b._id, text: 'Dùng định lý Pythagore' });
      assert.equal((await request(outsider, 'POST', `/comments/${comment._id}/helpful`, {})).status, 403);
      await request(a, 'POST', `/comments/${comment._id}/helpful`, {});
      await request(a, 'POST', `/comments/${comment._id}/helpful`, {});
      assert.equal((await Profile.findOne({ user: b._id })).communityPoints, 10);
    });
    await t.test('parallel reward grants and redemption do not duplicate or overdraw', async () => {
      await ensureProfile(outsider._id);
      await Promise.all(Array.from({ length: 8 }, () => grant(outsider._id, 'same-event', 100)));
      assert.equal((await Profile.findOne({ user: outsider._id })).energy, 100);
      const redeemed = await Promise.all([request(outsider, 'POST', '/rewards/redeem', { item: 'frame-green' }), request(outsider, 'POST', '/rewards/redeem', { item: 'frame-green' })]);
      assert.deepEqual(redeemed.map(r => r.status).sort(), [200, 400]);
      assert.equal((await Profile.findOne({ user: outsider._id })).energy, 20);
      assert.equal((await request(a, 'POST', '/rewards/equip', { item: 'frame-green' })).status, 400);
    });
    await t.test('watering validates answers and does not award repeatedly', async () => {
      assert.equal((await request(outsider, 'POST', '/garden/task', {})).status, 400);
      const profile = await Profile.findOne({ user: outsider._id });
      assert.equal((await request(outsider, 'POST', '/garden/water', { answer: -100 })).status, 400);
      assert.equal((await request(outsider, 'POST', '/garden/water', {})).status, 400);
      assert.equal((await Profile.findOne({ user: outsider._id })).energy, 20);
      assert.equal('waterTask' in (await request(outsider, 'GET', '/garden')).data, false);
    });
    await t.test('empty homework gets no reward and actual submission is reconciled once', async () => {
      await HomeworkSubmission.create({ homework: new mongoose.Types.ObjectId(), class: cls._id, student: b._id });
      let g = (await request(b, 'GET', '/garden')).data; assert.equal(g.studyPoints, 0);
      await HomeworkSubmission.create({ homework: new mongoose.Types.ObjectId(), class: cls._id, student: b._id, submissionImages: [{ url: '/uploads/test.png' }] });
      g = (await request(b, 'GET', '/garden')).data; assert.equal(g.studyPoints, 10);
      assert.equal((await request(b, 'GET', '/garden')).data.studyPoints, 10);
    });
    await t.test('challenge management paginates all exams and protects answer keys', async () => {
      const before = await Challenge.countDocuments();
      const created = await Challenge.insertMany(Array.from({ length: 53 }, (_, i) => ({
        title: `Đề phân trang ${i}`, startsAt: new Date(Date.now() + (i + 1) * 86400000),
        endsAt: new Date(Date.now() + (i + 2) * 86400000), durationMinutes: 15,
        questions: [{ prompt: '1 + 1 = ?', options: ['2', '3', '4', '5'], correctIndex: 0 }],
      })));
      try {
        assert.equal((await request(a, 'GET', '/admin/challenges?page=1')).status, 403);
        assert.equal((await request(a, 'GET', `/admin/challenges/${created[0]._id}`)).status, 403);
        const first = await request(admin, 'GET', '/admin/challenges?page=1');
        assert.equal(first.status, 200);
        assert.equal(first.data.total, before + 53);
        assert.equal(first.data.items.length, 10);
        assert.equal(first.data.items[0]._id, String(created[52]._id));
        assert.equal(first.data.items[0].questionCount, 1);
        assert.equal(first.data.items[0].questions, undefined);
        const second = await request(admin, 'GET', '/admin/challenges?page=2');
        assert.equal(second.data.items.length, 10);
        assert.ok(second.data.items.every(item => !first.data.items.some(old => old._id === item._id)));
        const last = await request(admin, 'GET', '/admin/challenges?page=999');
        assert.equal(last.data.page, last.data.pages);
        assert.ok(last.data.items.length > 0 && last.data.items.length <= 10);
        const student = await request(a, 'GET', '/challenges?page=6');
        assert.equal(student.data.total, before + 53);
        assert.ok(student.data.items.some(item => item._id === String(created[0]._id)));
        assert.ok(student.data.items.every(item => item.questions === undefined));
        const detail = await request(admin, 'GET', `/admin/challenges/${created[0]._id}`);
        assert.equal(detail.data.questions[0].correctIndex, 0);
        assert.equal((await request(admin, 'GET', '/admin/challenges/not-an-id')).status, 400);
        assert.equal((await request(admin, 'GET', `/admin/challenges/${new mongoose.Types.ObjectId()}`)).status, 404);
        assert.equal((await request(admin, 'GET', '/admin')).data.challenges, undefined);
      } finally { await Challenge.deleteMany({ _id: { $in: created.map(c => c._id) } }); }
    });
    await t.test('challenge membership, private answer key, one attempt and server scoring', async () => {
      const r = await request(admin, 'POST', '/admin/challenges', { title: 'Thử thách tuần', classes: [String(cls._id)], startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000), durationMinutes: 15, questions: [{ prompt: '2 + 2 = ?', options: ['1', '2', '3', '4'], correctIndex: 3 }] });
      assert.equal(r.status, 201); challenge = r.data;
      assert.equal((await request(outsider, 'POST', `/challenges/${challenge._id}/start`, {})).status, 403);
      const started = await request(a, 'POST', `/challenges/${challenge._id}/start`, {});
      assert.equal(started.status, 200); assert.equal('correctIndex' in started.data.questions[0], false);
      const resumed = await request(a, 'POST', `/challenges/${challenge._id}/start`, {});
      assert.equal(resumed.data.attempt.deadline, started.data.attempt.deadline);
      const submitted = await request(a, 'POST', `/challenges/${challenge._id}/submit`, { answers: [3], score: 999 });
      assert.equal(submitted.status, 200); assert.equal(submitted.data.score, 1);
      assert.equal((await request(a, 'POST', `/challenges/${challenge._id}/submit`, { answers: [3] })).status, 400);
    });
    await t.test('expired attempts cannot submit and removed students cannot start', async () => {
      await request(b, 'POST', `/challenges/${challenge._id}/start`, {});
      await Attempt.updateOne({ student: b._id, challenge: challenge._id }, { deadline: new Date(Date.now() - 1) });
      assert.equal((await request(b, 'POST', `/challenges/${challenge._id}/submit`, { answers: [3] })).status, 400);
      await Class.updateOne({ _id: cls._id }, { $pull: { students: b._id } });
      assert.equal((await request(b, 'POST', `/challenges/${challenge._id}/start`, {})).status, 403);
    });
    await t.test('monthly aggregation includes last Vietnam day and excludes next month', async () => {
      await Attempt.create([
        { challenge: new mongoose.Types.ObjectId(), student: outsider._id, startedAt: new Date('2025-10-31T15:00Z'), deadline: new Date('2025-10-31T17:00Z'), submittedAt: new Date('2025-10-31T16:59:59Z'), score: 7 },
        { challenge: new mongoose.Types.ObjectId(), student: outsider._id, startedAt: new Date('2025-10-31T16:00Z'), deadline: new Date('2025-10-31T18:00Z'), submittedAt: new Date('2025-10-31T17:00:00Z'), score: 9 },
      ]);
      const result = await request(a, 'GET', '/monthly?month=2025-10');
      assert.equal(result.data.rows[0].score, 7);
      assert.equal((await request(admin, 'POST', '/admin/awards', { month: '2025-10', student: String(outsider._id), gift: 'Bộ bút' })).status, 200);
      assert.equal((await request(a, 'GET', '/monthly?month=2025-10')).data.rows[0].gift, 'Bộ bút');
    });
    await t.test('game time requires earned energy and cannot be decremented twice for one session', async () => {
      assert.equal((await request(outsider, 'POST', '/game/start', {})).status, 400);
      await grant(outsider._id, 'game-credit', 50);
      assert.equal((await request(outsider, 'POST', '/rewards/redeem', { item: 'game-5' })).status, 200);
      const r = await request(outsider, 'POST', '/game/start', {});
      assert.equal(r.status, 200);
      assert.equal((await request(outsider, 'POST', '/game/start', {})).data.until, r.data.until);
      assert.equal((await Profile.findOne({ user: outsider._id })).gameMinutes, 4);
    });
    await t.test('gift redemption is recorded and only admin can mark delivered', async () => {
      await grant(outsider._id, 'gift-credit', 200);
      assert.equal((await request(outsider, 'POST', '/rewards/redeem', { item: 'gift-small' })).status, 200);
      const p = await Profile.findOne({ user: outsider._id });
      const route = `/admin/gifts/${outsider._id}/${p.redemptions[0]._id}`;
      assert.equal((await request(outsider, 'POST', route, {})).status, 403);
      assert.equal((await request(admin, 'POST', route, {})).status, 200);
      assert.equal((await request(admin, 'POST', route, {})).status, 409);
    });
    await t.test('admin policy rejects invalid times and accepts keyword updates', async () => {
      assert.equal((await request(admin, 'PUT', '/admin/policy', { curfewEnabled: true, curfewStart: '25:00', curfewEnd: '06:00', bannedWords: [] })).status, 400);
      assert.equal((await request(admin, 'PUT', '/admin/policy', { curfewEnabled: false, curfewStart: '22:00', curfewEnd: '06:00', bannedWords: ['từ khóa mới'] })).status, 200);
      assert.equal((await request(a, 'POST', '/posts', { text: 'TỪ KHÓA MỚI' })).status, 400);
    });
    const { imageQuota, reserveImage, dayWindow } = require('../src/services/communityImageQuota');
    const quotaUser = await User.create({ name: 'Ảnh mỗi ngày', email: 'photo-limit@test.invalid' });
    const legacyUser = await User.create({ name: 'Ảnh có sẵn', email: 'photo-legacy@test.invalid' });
    const uploadPhoto = async (user, kind = 'study') => {
      const body = new FormData(); body.append('text', 'Khoảnh khắc học tập'); body.append('kind', kind); body.append('hasImage', 'true');
      body.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'quota.png');
      const result = await request(user, 'POST', '/posts', body);
      if (result.status === 201) imagePaths.push(result.data.image);
      return result;
    };
    const quotaPolicy = { curfewEnabled: false, curfewStart: '22:00', curfewEnd: '06:00', bannedWords: [], dailyImageLimitEnabled: true, dailyImageLimit: 2, dailyImageLimitScope: 'all' };
    await t.test('daily quota defaults to five and counts legacy photos including rejected posts', async () => {
      const first = await request(quotaUser, 'GET', '/image-quota');
      assert.equal(first.data.limit, 5); assert.equal(first.data.used, 0); assert.equal(first.data.remaining, 5);
      await Post.create([
        { author: legacyUser._id, text: 'Ảnh cũ hôm nay', image: 'legacy-one.png' },
        { author: legacyUser._id, text: 'Ảnh bị từ chối hôm nay', image: 'legacy-two.png', status: 'rejected' },
        { author: legacyUser._id, text: 'Chỉ có chữ' },
        { author: legacyUser._id, text: 'Ảnh hôm qua', image: 'legacy-yesterday.png', createdAt: new Date(dayWindow().start.getTime() - 1000) },
      ]);
      const quota = (await request(legacyUser, 'GET', '/image-quota')).data;
      assert.equal(quota.used, 2); assert.equal(quota.remaining, 3);
    });
    await t.test('only admin can configure image quota and invalid limits are rejected', async () => {
      assert.equal((await request(quotaUser, 'PUT', '/admin/policy', quotaPolicy)).status, 403);
      for (const invalid of [-1, 1.5, 101, '2']) assert.equal((await request(admin, 'PUT', '/admin/policy', { ...quotaPolicy, dailyImageLimit: invalid })).status, 400);
      assert.equal((await request(admin, 'PUT', '/admin/policy', { ...quotaPolicy, dailyImageLimitScope: 'unknown' })).status, 400);
      assert.equal((await request(admin, 'PUT', '/admin/policy', quotaPolicy)).status, 200);
    });
    await t.test('concurrent photo posts share one quota across study, question and story', async () => {
      const results = await Promise.all(['study', 'story', 'question', 'study'].map(kind => uploadPhoto(quotaUser, kind)));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 201, 429, 429]);
      for (const r of results.filter(r => r.status === 429)) { assert.equal(r.data.code, 'DAILY_IMAGE_LIMIT'); assert.equal(r.data.imageQuota.remaining, 0); }
      assert.equal((await request(quotaUser, 'GET', '/image-quota')).data.used, 2);
      const photos = results.filter(r => r.status === 201);
      await request(quotaUser, 'DELETE', `/posts/${photos[0].data._id}`);
      await request(admin, 'POST', `/admin/posts/${photos[1].data._id}/review`, { status: 'rejected' });
      assert.equal((await uploadPhoto(quotaUser)).status, 429, 'deletion and rejection do not restore an image slot');
      assert.equal((await request(quotaUser, 'POST', '/posts', { text: 'Vẫn chia sẻ được bằng chữ' })).status, 201);
      assert.equal((await request(quotaUser, 'GET', '/image-quota')).data.used, 2);
    });
    await t.test('daily quota rolls over at Vietnam midnight and remains independent per account', async () => {
      const settings = await Policy.findOne({ key: 'default' });
      const tomorrow = new Date(dayWindow().end.getTime() + 1000);
      assert.equal((await imageQuota(quotaUser, settings, tomorrow)).used, 0);
      await reserveImage(quotaUser, settings, tomorrow);
      assert.equal((await imageQuota(quotaUser, settings, tomorrow)).used, 1);
      assert.equal((await imageQuota(quotaUser, settings)).used, 2);
      assert.equal(dayWindow(new Date('2026-10-26T16:59:59Z')).day, '2026-10-26');
      assert.equal(dayWindow(new Date('2026-10-26T17:00:00Z')).day, '2026-10-27');
      assert.equal(dayWindow(new Date('2026-10-26T16:59:59Z')).end.toISOString(), '2026-10-26T17:00:00.000Z');
    });
    await t.test('failed validation or persistence does not consume a photo slot', async () => {
      const user = await User.create({ name: 'Lượt ảnh lỗi', email: 'photo-failure@test.invalid' });
      const invalid = new FormData(); invalid.append('text', 'Ảnh không hợp lệ'); invalid.append('hasImage', 'true'); invalid.append('image', new Blob(['not a PNG'], { type: 'image/png' }), 'invalid.png');
      assert.equal((await request(user, 'POST', '/posts', invalid)).status, 400);
      assert.equal((await request(user, 'GET', '/image-quota')).data.used, 0);
      const originalCreate = Post.create;
      try {
        Post.create = async () => { const error = new Error('Simulated persistence failure'); error.status = 503; throw error; };
        assert.equal((await uploadPhoto(user)).status, 503);
      } finally { Post.create = originalCreate; }
      assert.equal((await request(user, 'GET', '/image-quota')).data.used, 0);
      assert.equal((await uploadPhoto(user)).status, 201);
    });
    await t.test('admin quota scope, zero limit and disabled limits are enforced at the server', async () => {
      await request(admin, 'PUT', '/admin/policy', { ...quotaPolicy, dailyImageLimit: 0 });
      assert.equal((await uploadPhoto(admin)).status, 429, 'all accounts includes admin');
      await request(admin, 'PUT', '/admin/policy', { ...quotaPolicy, dailyImageLimit: 0, dailyImageLimitScope: 'students' });
      assert.equal((await uploadPhoto(admin)).status, 201, 'student-only limit exempts admin');
      assert.equal((await uploadPhoto(quotaUser)).status, 429);
      await request(admin, 'PUT', '/admin/policy', { ...quotaPolicy, dailyImageLimitEnabled: false });
      assert.equal((await uploadPhoto(quotaUser)).status, 201);
      assert.equal((await request(quotaUser, 'GET', '/image-quota')).data.used, 3);
      await request(admin, 'PUT', '/admin/policy', quotaPolicy);
      assert.equal((await uploadPhoto(quotaUser)).status, 429, 'photos sent while disabled still count after enabling');
    });
    await t.test('homework gate permits no assignments and requires every published assignment', async () => {
      const Homework = require('../src/models/Homework');
      const pupil = await User.create({ name: 'Homework gate', email: 'homework-gate@test.invalid' });
      assert.equal((await request(pupil, 'GET', '/access')).data.allowed, true);
      assert.equal((await request(pupil, 'GET', '/posts')).status, 200);
      const classroom = await Class.create({ name: 'Assigned homework', students: [pupil._id, admin._id] });
      const otherClass = await Class.create({ name: 'Other students', students: [b._id] });
      const inactiveClass = await Class.create({ name: 'Inactive class', students: [pupil._id], isActive: false });
      const defaults = { class: classroom._id, createdBy: admin._id };
      await Homework.create([
        { ...defaults, title: 'Draft', isPublished: false },
        { ...defaults, title: 'Other class', class: otherClass._id },
        { ...defaults, title: 'Inactive class', class: inactiveClass._id },
      ]);
      assert.equal((await request(pupil, 'GET', '/access')).data.allowed, true);
      const [first, second] = await Homework.create([
        { ...defaults, title: 'Overdue homework', dueDate: new Date('2020-01-01') },
        { ...defaults, title: 'Second homework' },
      ]);
      let access = (await request(pupil, 'GET', '/access')).data;
      assert.equal(access.allowed, false); assert.equal(access.remaining, 2);
      assert.deepEqual(new Set(access.homeworks.map(item => item.title)), new Set([first.title, second.title]));
      for (const route of ['/posts', '/stories', '/friends', '/inbox', '/events', `/messages/${a._id}`]) {
        const denied = await request(pupil, 'GET', route);
        assert.equal(denied.status, 403, route); assert.equal(denied.data.code, 'HOMEWORK_REQUIRED');
      }
      assert.equal((await request(pupil, 'POST', '/posts', { text: 'Bypass' })).status, 403);
      assert.equal((await request(admin, 'GET', '/posts')).status, 200);
      await HomeworkSubmission.create({ student: pupil._id, homework: first._id, class: classroom._id });
      assert.equal((await request(pupil, 'GET', '/access')).data.remaining, 2, 'empty teacher-created record does not count');
      await HomeworkSubmission.updateOne({ student: pupil._id, homework: first._id }, { submissionImages: [{ url: '/uploads/answer.png' }] });
      assert.equal((await request(pupil, 'GET', '/access')).data.remaining, 1, 'pending grading is complete after upload');
      await HomeworkSubmission.create({ student: a._id, homework: second._id, class: classroom._id, status: 'graded' });
      assert.equal((await request(pupil, 'GET', '/access')).data.remaining, 1, 'another student cannot unlock access');
      await HomeworkSubmission.create({ student: pupil._id, homework: second._id, class: classroom._id, status: 'graded', score: 8, gradedBy: admin._id });
      assert.equal((await request(pupil, 'GET', '/access')).data.allowed, true, 'teacher-graded paper work counts');
      assert.equal((await request(pupil, 'GET', '/posts')).status, 200);

      const controller = new AbortController();
      try {
        const stream = await fetch(base + '/events', { headers: { Authorization: `Bearer ${token(pupil)}` }, signal: controller.signal });
        const next = events(stream.body.getReader());
        await next(event => event.type === 'connected');
        const revocation = next(event => event.type === 'access-revoked');
        const task = await Homework.create({ ...defaults, title: 'New assignment while chatting' });
        await revocation;
        assert.equal((await request(pupil, 'GET', '/posts')).status, 403);
        await Homework.updateOne({ _id: task._id }, { isPublished: false });
        assert.equal((await request(pupil, 'GET', '/access')).data.allowed, true);
      } finally { controller.abort(); }
      await HomeworkSubmission.updateOne({ student: pupil._id, homework: first._id }, { submissionImages: [] });
      assert.equal((await request(pupil, 'GET', '/posts')).status, 403, 'removing submitted work locks access again');
      await Class.updateOne({ _id: classroom._id }, { $pull: { students: pupil._id } });
      assert.equal((await request(pupil, 'GET', '/access')).data.allowed, true, 'leaving a class removes its assignments');
    });
    await t.test('admin access policy switches between free, submitted and graded requirements', async () => {
      const Homework = require('../src/models/Homework');
      const pupil = await User.create({ name: 'Access policy', email: 'access-policy@test.invalid' });
      const emptyPupil = await User.create({ name: 'No homework', email: 'no-homework-policy@test.invalid' });
      const classroom = await Class.create({ name: 'Policy class', students: [pupil._id] });
      const task = await Homework.create({ class: classroom._id, createdBy: admin._id, title: 'Policy homework' });
      const settings = (await request(admin, 'GET', '/admin')).data.settings;
      assert.equal(settings.homeworkAccessMode, 'submitted');
      const save = mode => request(admin, 'PUT', '/admin/policy', { ...settings, homeworkAccessMode: mode });
      assert.equal((await request(pupil, 'PUT', '/admin/policy', { ...settings, homeworkAccessMode: 'none' })).status, 403);
      for (const mode of ['invalid', false, null]) assert.equal((await save(mode)).status, 400);
      assert.equal((await save('none')).status, 200);
      assert.equal((await request(pupil, 'GET', '/access')).data.allowed, true);
      assert.equal((await request(pupil, 'GET', '/posts')).status, 200);
      const { homeworkAccessMode, ...oldClientSettings } = settings;
      await request(admin, 'PUT', '/admin/policy', oldClientSettings);
      assert.equal((await request(admin, 'GET', '/admin')).data.settings.homeworkAccessMode, 'none');
      const controller = new AbortController();
      try {
        const stream = await fetch(base + '/events', { headers: { Authorization: `Bearer ${token(pupil)}` }, signal: controller.signal });
        const next = events(stream.body.getReader());
        await next(event => event.type === 'connected');
        const revoked = next(event => event.type === 'access-revoked');
        await save('submitted');
        await revoked;
      } finally { controller.abort(); }
      assert.equal((await request(pupil, 'GET', '/posts')).status, 403);
      await HomeworkSubmission.create({ student: pupil._id, homework: task._id, class: classroom._id, submissionImages: [{ url: '/uploads/policy-answer.png' }] });
      assert.equal((await request(pupil, 'GET', '/access')).data.allowed, true);
      assert.equal((await save('graded')).status, 200);
      const access = (await request(pupil, 'GET', '/access')).data;
      assert.equal(access.allowed, false); assert.equal(access.homeworkAccessMode, 'graded'); assert.equal(access.remaining, 1);
      assert.equal((await request(pupil, 'GET', '/posts')).status, 403);
      assert.equal((await request(emptyPupil, 'GET', '/posts')).status, 200);
      assert.equal((await request(admin, 'GET', '/posts')).status, 200);
      await HomeworkSubmission.updateOne({ homework: task._id, student: pupil._id }, { status: 'graded', score: 8, gradedBy: admin._id });
      assert.equal((await request(pupil, 'GET', '/posts')).status, 200);
      await save('submitted');
    });
    await t.test('inactive users cannot access community', async () => {
      await User.updateOne({ _id: outsider._id }, { isActive: false });
      assert.equal((await request(outsider, 'GET', '/posts')).status, 403);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    for (const filename of imagePaths) await fs.unlink(path.resolve(__dirname, '../community-uploads', path.basename(filename))).catch(() => {});
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && database.startsWith('community_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
