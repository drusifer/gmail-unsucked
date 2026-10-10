// D5: labels and forwarding addresses are cached (per user, 60 s) at the gmail_api layer.
const test = require('node:test');
const assert = require('node:assert');
const GmailApi = require('../gmail_api.js');

const fakeCache = () => {
  const store = {};
  const calls = { get: 0, put: [], remove: [] };
  return {
    store, calls,
    get: (k) => { calls.get += 1; return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    put: (k, v, ttl) => { calls.put.push({ k, ttl }); store[k] = v; },
    remove: (k) => { calls.remove.push(k); delete store[k]; },
    removeAll: (ks) => ks.forEach((k) => { calls.remove.push(k); delete store[k]; }),
  };
};

const fakeGmail = () => {
  const n = { labels: 0, fwd: 0, filters: 0, creates: 0, removes: 0 };
  const g = {
    n,
    Users: {
      Labels: { list: () => { n.labels += 1; return { labels: [{ id: 'L1', name: 'Work', type: 'user' }] }; } },
      Settings: {
        Filters: {
          list: () => { n.filters += 1; return { filter: [{ id: 'f1' }] }; },
          create: (r) => { n.creates += 1; return Object.assign({ id: 'n1' }, r); },
          remove: () => { n.removes += 1; },
        },
        ForwardingAddresses: { list: () => { n.fwd += 1; return { forwardingAddresses: [{ forwardingEmail: 'a@x.com', verificationStatus: 'accepted' }] }; } },
      },
    },
  };
  return g;
};

test('labels are fetched once, then served from cache with a 60 s TTL', () => {
  const g = fakeGmail();
  const c = fakeCache();
  const api = GmailApi.create(g, c);
  const a = api.listLabels();
  const b = api.listLabels();
  assert.strictEqual(g.n.labels, 1);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(c.calls.put.length, 1);
  assert.strictEqual(c.calls.put[0].ttl, 60);
});

test('forwarding addresses are cached independently of labels', () => {
  const g = fakeGmail();
  const api = GmailApi.create(g, fakeCache());
  api.listForwardingAddresses();
  api.listForwardingAddresses();
  api.listLabels();
  assert.strictEqual(g.n.fwd, 1);
  assert.strictEqual(g.n.labels, 1);
});

test('filters are cached (E9), so search and re-render do not refetch', () => {
  const g = fakeGmail();
  const c = fakeCache();
  const api = GmailApi.create(g, c);
  api.listFilters();
  api.listFilters();
  api.listFilters();
  assert.strictEqual(g.n.filters, 1);
});

test('createFilter and deleteFilter both invalidate the filter list', () => {
  const g = fakeGmail();
  const api = GmailApi.create(g, fakeCache());
  api.listFilters();
  api.createFilter({ criteria: { from: 'x' }, action: {} });
  api.listFilters();
  assert.strictEqual(g.n.filters, 2);
  api.deleteFilter('f1');
  api.listFilters();
  assert.strictEqual(g.n.filters, 3);
});

test('a filter list larger than one cache value is chunked and reassembled', () => {
  const g = fakeGmail();
  const big = [];
  for (let i = 0; i < 900; i += 1) big.push({ id: `f${i}`, criteria: { from: `sender${i}@example.com`, subject: 'x'.repeat(60) }, action: { addLabelIds: ['Label_1'] } });
  g.Users.Settings.Filters.list = () => { g.n.filters += 1; return { filter: big }; };
  const c = fakeCache();
  const api = GmailApi.create(g, c);
  const first = api.listFilters();
  const second = api.listFilters();
  assert.strictEqual(g.n.filters, 1);
  assert.deepStrictEqual(second, first);
  assert.strictEqual(second.length, 900);
  Object.keys(c.store).forEach((k) => assert.ok(c.store[k].length <= 30000, `${k} too large: ${c.store[k].length}`));
  assert.ok(c.calls.put.length > 2, 'expected several chunks plus a count');
});

test('a missing or corrupt chunk falls back to the API instead of returning partial data', () => {
  const g = fakeGmail();
  const big = [];
  for (let i = 0; i < 900; i += 1) big.push({ id: `f${i}`, criteria: { from: `sender${i}@example.com`, subject: 'x'.repeat(60) }, action: {} });
  g.Users.Settings.Filters.list = () => { g.n.filters += 1; return { filter: big }; };
  const c = fakeCache();
  const api = GmailApi.create(g, c);
  api.listFilters();
  const chunkKey = Object.keys(c.store).find((k) => /:1$/.test(k));
  delete c.store[chunkKey];
  assert.strictEqual(api.listFilters().length, 900);
  assert.strictEqual(g.n.filters, 2);
});

test('createFilter invalidates both cached lists', () => {
  const g = fakeGmail();
  const api = GmailApi.create(g, fakeCache());
  api.listLabels(); api.listForwardingAddresses();
  api.createFilter({ criteria: { from: 'x' }, action: {} });
  api.listLabels(); api.listForwardingAddresses();
  assert.strictEqual(g.n.labels, 2);
  assert.strictEqual(g.n.fwd, 2);
});

test('deleteFilter does not need to invalidate (labels unaffected)', () => {
  const g = fakeGmail();
  const api = GmailApi.create(g, fakeCache());
  api.listLabels();
  api.deleteFilter('f1');
  api.listLabels();
  assert.strictEqual(g.n.labels, 1);
});

test('no cache available (Node/tests/old runtime): works, just uncached', () => {
  const g = fakeGmail();
  const api = GmailApi.create(g, null);
  api.listLabels(); api.listLabels();
  assert.strictEqual(g.n.labels, 2);
});

test('cache failures never break reads (get/put throw, corrupt value)', () => {
  const g = fakeGmail();
  const bad = { get: () => { throw new Error('cache down'); }, put: () => { throw new Error('cache down'); }, remove: () => { throw new Error('x'); } };
  const api = GmailApi.create(g, bad);
  assert.strictEqual(api.listLabels().length, 1);
  api.createFilter({ criteria: {}, action: {} }); // invalidate must not throw either

  const c = fakeCache();
  const api2 = GmailApi.create(fakeGmail(), c);
  api2.listLabels();
  Object.keys(c.store).forEach((k) => { c.store[k] = '{not json'; });
  assert.strictEqual(api2.listLabels().length, 1); // falls back to the API
});

test('API errors are not cached and still surface as {code,message}', () => {
  const g = fakeGmail();
  g.Users.Labels.list = () => { throw new Error('boom 403'); };
  const c = fakeCache();
  const api = GmailApi.create(g, c);
  assert.throws(() => api.listLabels(), (e) => e.code === 403);
  assert.strictEqual(c.calls.put.length, 0);
});
