// selfTest.js is a real-runtime test, but it is code too: run it here against the strict fake
// so it cannot rot. A passing run proves the self-test's own logic, not the live platform.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { newCardService } = require('./strict_cardservice');

const FILES = ['format.js', 'gmail_api.js', 'filters.js', 'cards.js', 'selfTest.js'];

const makeEnv = (mutate) => {
  const state = { filters: [], seq: 0 };
  const gmail = {
    Users: {
      Labels: { list: () => ({ labels: [] }) },
      Settings: {
        Filters: {
          list: () => ({ filter: state.filters }),
          create: (r) => {
            if (state.filters.some((x) => JSON.stringify([x.criteria, x.action]) === JSON.stringify([r.criteria, r.action]))) throw new Error('API call to gmail.users.settings.filters.create failed with error: Filter already exists');
            const f = Object.assign({ id: `n${++state.seq}` }, r); state.filters.push(f); return f; },
          remove: (_me, id) => { state.filters = state.filters.filter((f) => f.id !== id); },
        },
        ForwardingAddresses: { list: () => ({ forwardingAddresses: [] }) },
      },
    },
  };
  if (mutate) mutate(gmail, state);
  const logs = [];
  const ctx = vm.createContext({ CardService: newCardService(), Gmail: gmail, GmailApp: undefined, Logger: { log: (m) => logs.push(m) }, console });
  vm.runInContext(FILES.map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n'), ctx);
  return { run: (c) => vm.runInContext(c, ctx), state, logs };
};

test('selfTest passes against a healthy fake and leaves no filters behind', () => {
  const env = makeEnv();
  const out = env.run('selfTest()');
  assert.match(out, /^\d+\/\d+ passed$/);
  assert.strictEqual(env.state.filters.length, 0);
});

test('selfTest fails loudly when an API scope is missing, and still cleans up', () => {
  const env = makeEnv((g) => { g.Users.Labels.list = () => { throw new Error('You do not have permission to call gmail.users.labels.list'); }; });
  assert.throws(() => env.run('selfTest()'), /selfTest FAILED[\s\S]*labels\.list/);
  assert.strictEqual(env.state.filters.length, 0);
});

test('selfTest cleans up even when a handler blows up mid-run', () => {
  const env = makeEnv((g, state) => {
    const create = g.Users.Settings.Filters.create;
    g.Users.Settings.Filters.create = (r) => { const f = create(r); if (state.seq > 0) g.Users.Settings.Filters.remove = () => { throw new Error('transient'); }; return f; };
  });
  assert.throws(() => env.run('selfTest()'), /FAILED/);
});

test('selfTest sweeps real filters read-only and names each one', () => {
  const seeded = { id: 'real1', criteria: { from: 'boss@x.com' }, action: { addLabelIds: ['Label_1'] } };
  const env = makeEnv((_g, state) => { state.filters.push(JSON.parse(JSON.stringify(seeded))); });
  env.run('selfTest()');
  const log = env.logs.join('\n');
  assert.match(log, /PASS\s+real filter real1: .*onEditFilter/);
  assert.match(log, /PASS\s+real filter real1: .*onDuplicateFilter/);
  assert.match(log, /PASS\s+real filter real1: .*onConfirmDelete/);
  assert.deepStrictEqual(env.state.filters, [seeded]); // untouched
});
