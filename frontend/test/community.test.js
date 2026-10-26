import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthToken, setAuthToken, clearAuthToken, openAuthenticatedPage, subscribeAuthChanges } from '../src/utils/authSession.js';
import { createCommunityRefresh } from '../src/utils/communitySync.js';

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
}
test('tabs share login, account changes and logout despite old pinned sessions', () => {
  const shared = storage(), tabA = storage(), tabB = storage();
  globalThis.localStorage = shared;
  globalThis.sessionStorage = tabA;
  tabA.setItem('toanthayhieu.auth.token', '');
  assert.equal(getAuthToken(), null);
  setAuthToken('token-student-A');
  globalThis.sessionStorage = tabB;
  assert.equal(getAuthToken(), 'token-student-A');
  setAuthToken('token-student-B');
  globalThis.sessionStorage = tabA;
  tabA.setItem('toanthayhieu.auth.token', 'token-student-A');
  assert.equal(getAuthToken(), 'token-student-B', 'existing tabs use the shared account');
  clearAuthToken();
  assert.equal(getAuthToken(), null);
  globalThis.sessionStorage = tabB;
  assert.equal(getAuthToken(), null, 'logout applies to every tab');
  assert.equal(shared.getItem('token'), null);
  globalThis.sessionStorage = tabA;
  assert.equal(getAuthToken(), null);
  delete globalThis.localStorage; delete globalThis.sessionStorage;
});
test('remembered login and subsequent changes are read directly from shared storage', () => {
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  localStorage.setItem('token', 'remembered-account');
  assert.equal(getAuthToken(), 'remembered-account');
  localStorage.setItem('token', 'account-in-another-tab');
  assert.equal(getAuthToken(), 'account-in-another-tab');
  delete globalThis.localStorage; delete globalThis.sessionStorage;
});
test('preview inherits the shared login without pinning a separate account', () => {
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  setAuthToken('admin-account');
  localStorage.setItem('token', 'student-in-another-tab');
  const previewStorage = storage(); let destination;
  const preview = { opener: {}, sessionStorage: previewStorage, location: { replace: url => { destination = url; } } };
  globalThis.window = {
    location: { href: 'https://school.invalid/admin/content', origin: 'https://school.invalid' },
    open: () => preview,
  };
  try {
    openAuthenticatedPage('/lesson/draft-lesson');
    assert.equal(previewStorage.getItem('toanthayhieu.auth.token'), null);
    assert.equal(preview.opener, null);
    assert.equal(destination, 'https://school.invalid/lesson/draft-lesson');
    assert.equal(localStorage.getItem('token'), 'student-in-another-tab');
    assert.equal(getAuthToken(), 'student-in-another-tab');
    assert.throws(() => openAuthenticatedPage('https://other.invalid/'), /same-origin/);
  } finally { delete globalThis.window; delete globalThis.localStorage; delete globalThis.sessionStorage; }
});
test('cross-tab storage notifications track login, logout and clear, with cleanup', () => {
  globalThis.localStorage = storage();
  const events = new EventTarget();
  globalThis.window = events;
  const observed = [];
  const unsubscribe = subscribeAuthChanges(() => observed.push(getAuthToken()));
  const dispatch = (key, storageArea = localStorage) => {
    const event = new Event('storage');
    Object.assign(event, { key, storageArea });
    events.dispatchEvent(event);
  };
  try {
    setAuthToken('account-A'); dispatch('token');
    setAuthToken('account-B'); dispatch('token');
    dispatch('theme'); dispatch('token', storage());
    clearAuthToken(); dispatch('token');
    dispatch(null);
    assert.deepEqual(observed, ['account-A', 'account-B', null, null]);
    unsubscribe();
    setAuthToken('account-C'); dispatch('token');
    assert.equal(observed.length, 4);
  } finally { unsubscribe(); delete globalThis.window; delete globalThis.localStorage; }
});
test('blocked preview popup opens in the current authenticated tab', () => {
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  setAuthToken('admin-account'); let destination;
  globalThis.window = {
    location: { href: 'https://school.invalid/admin/content', origin: 'https://school.invalid', assign: url => { destination = url; } },
    open: () => null,
  };
  try {
    openAuthenticatedPage('/lesson/draft-lesson');
    assert.equal(destination, 'https://school.invalid/lesson/draft-lesson');
    assert.equal(getAuthToken(), 'admin-account');
  } finally { delete globalThis.window; delete globalThis.localStorage; delete globalThis.sessionStorage; }
});
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
test('incoming invitation appears even while notification and inbox requests are stalled', async () => {
  const requests = new Map(), state = {};
  const refresh = createCommunityRefresh({ isCurrent: () => true, get: path => { const d = deferred(); requests.set(path, d); return d.promise; }, resources: ['friends', 'notifications', 'inbox'].map(key => ({ path: key, apply: data => { state[key] = data; } })) });
  const loading = refresh();
  requests.get('friends').resolve({ data: { incoming: [{ _id: 'student-A' }] } });
  await tick();
  assert.equal(state.friends.incoming[0]._id, 'student-A');
  assert.equal(state.notifications, undefined);
  requests.get('notifications').resolve({ data: [] }); requests.get('inbox').resolve({ data: [] });
  await loading;
});
test('overlapping refreshes cannot starve incoming invitations or overwrite newer data', async () => {
  const requests = [], states = [];
  const refresh = createCommunityRefresh({ isCurrent: () => true, get: () => { const d = deferred(); requests.push(d); return d.promise; }, resources: [{ path: 'friends', apply: data => states.push(data) }] });
  const first = refresh(), second = refresh();
  requests[0].resolve({ data: { incoming: ['A'] } }); await tick();
  assert.equal(states.length, 1, 'a newer pending request must not suppress a successful response');
  requests[1].resolve({ data: { incoming: ['A', 'B'] } }); await Promise.all([first, second]);
  const third = refresh(), fourth = refresh();
  requests[3].resolve({ data: { incoming: ['B'] } }); await tick();
  requests[2].resolve({ data: { incoming: ['A', 'B'] } }); await Promise.all([third, fourth]);
  assert.deepEqual(states.at(-1), { incoming: ['B'] });
});
test('failed friendship reads show an error and never pretend there are no invitations', async () => {
  let value = { incoming: ['A'] }, error;
  const refresh = createCommunityRefresh({ isCurrent: () => true, get: async () => { throw new Error('offline'); }, resources: [{ path: 'friends', apply: data => { value = data; }, onError: e => { error = e.message; } }] });
  await refresh(); assert.equal(error, 'offline'); assert.deepEqual(value.incoming, ['A']);
});
test('results from the previous account are discarded after switching login', async () => {
  let current = true, applied = false;
  const d = deferred();
  const refresh = createCommunityRefresh({ isCurrent: () => current, get: () => d.promise, resources: [{ path: 'friends', apply: () => { applied = true; } }] });
  const loading = refresh(); current = false; d.resolve({ data: { incoming: ['old-account'] } }); await loading;
  assert.equal(applied, false);
});
