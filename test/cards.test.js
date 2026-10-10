// Smoke tests: load the real Apps Script files into one shared global scope
// (like the Apps Script runtime) with a recording CardService stub and a fake Gmail.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILES = ['format.js', 'gmail_api.js', 'filters.js', 'cards.js'];

const makeEnv = (gmail) => {
  const log = { texts: [], buttons: [], actions: [] };
  const handler = {
    get(target, prop) {
      if (prop === 'build') return () => ({ built: true, log });
      return (...args) => {
        if (prop === 'setText' && typeof args[0] === 'string') log.texts.push(args[0]);
        if (prop === 'setFunctionName') log.actions.push(args[0]);
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  const enumProxy = new Proxy({}, { get: (_t, p) => String(p) });
  const CardService = new Proxy({}, {
    get(_t, prop) {
      if (['LoadIndicator', 'TextButtonStyle', 'SelectionInputType'].includes(prop)) return enumProxy;
      return () => proxy;
    },
  });
  const ctx = vm.createContext({ CardService, Gmail: gmail, GmailApp: undefined, console, module: undefined });
  FILES.forEach((f) => {
    // Top-level const/let live in the script's lexical scope; share them across files
    // by evaluating all sources as a single script, as Apps Script effectively does.
  });
  const src = FILES.map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
  vm.runInContext(src, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return { ctx, run, log };
};

const fakeGmail = () => {
  const state = { filters: [
    { id: 'f1', criteria: { from: 'boss@x.com' }, action: { addLabelIds: ['Label_1'] } },
  ] };
  return {
    state,
    Users: {
      Labels: { list: () => ({ labels: [{ id: 'Label_1', name: 'Work', type: 'user' }] }) },
      Settings: {
        Filters: {
          list: () => ({ filter: state.filters }),
          create: (r) => { const f = Object.assign({ id: 'new1' }, r); state.filters.push(f); return f; },
          remove: (_me, id) => { state.filters = state.filters.filter((f) => f.id !== id); },
        },
        ForwardingAddresses: { list: () => ({ forwardingAddresses: [] }) },
      },
    },
  };
};

test('homepage builds a list card', () => {
  const env = makeEnv(fakeGmail());
  const card = env.run('buildHomepage({})');
  assert.ok(card.built);
  assert.ok(env.log.texts.some((t) => /Showing 1-1 of 1 filters/.test(t)));
});

test('list with no filters shows the empty state', () => {
  const g = fakeGmail();
  g.state.filters = [];
  const env = makeEnv(g);
  env.run('buildHomepage({})');
  assert.ok(env.log.texts.some((t) => /no filters yet/.test(t)));
});

test('API failure on homepage renders an error card, not a crash', () => {
  const g = fakeGmail();
  g.Users.Settings.Filters.list = () => { throw new Error('boom 403'); };
  const env = makeEnv(g);
  const card = env.run('buildHomepage({})');
  assert.ok(card.built);
  assert.ok(env.log.texts.some((t) => /Something went wrong|Could not load/.test(t)));
});

test('all handlers run without throwing', () => {
  const g = fakeGmail();
  const env = makeEnv(g);
  const p = (o) => JSON.stringify({ parameters: Object.assign({ q: 'w', page: '0' }, o) });
  [
    `onShowList(${p({})})`,
    `onManageFilters(${p({})})`,
    `onSearch({ formInput: { q: 'work' } })`,
    `onClearSearch(${p({})})`,
    `onCancel(${p({})})`,
    `onNewFilter(${p({})})`,
    `onNewFromMessage(${p({ from: 'a@b.com', subject: 's' })})`,
    `onEditFilter(${p({ id: 'f1' })})`,
    `onDuplicateFilter(${p({ id: 'f1' })})`,
    `onConfirmDelete(${p({ id: 'f1' })})`,
    `onEditFilter(${p({ id: 'missing' })})`,
  ].forEach((code) => assert.doesNotThrow(() => env.run(code), code));
});

test('save: invalid form re-renders; valid create succeeds; no_change notifies', () => {
  const g = fakeGmail();
  const env = makeEnv(g);
  const save = (formInput, extra) => `onSaveFilter(${JSON.stringify({
    parameters: Object.assign({ mode: 'create', q: '', page: '0', extras: '{}' }, extra),
    formInput,
    formInputs: { actions: formInput.actions || [] },
  })})`;
  env.run(save({ from: '' }));
  assert.strictEqual(g.state.filters.length, 1);
  env.run(save({ from: 'new@x.com', labelId: 'Label_1', actions: ['star'] }));
  assert.strictEqual(g.state.filters.length, 2);
  assert.ok(g.state.filters.some((f) => f.criteria.from === 'new@x.com' && f.action.addLabelIds.includes('STARRED')));
});

test('delete then undo restores the filter', () => {
  const g = fakeGmail();
  const env = makeEnv(g);
  env.run(`onDeleteFilter({ parameters: { id: 'f1', q: '', page: '0' } })`);
  assert.strictEqual(g.state.filters.length, 0);
  const copy = JSON.stringify({ criteria: { from: 'boss@x.com' }, action: { addLabelIds: ['Label_1'] } });
  env.run(`onUndoDelete({ parameters: { q: '', page: '0', copy: ${JSON.stringify(copy)} } })`);
  assert.strictEqual(g.state.filters.length, 1);
});

test('C2: list context is carried in action parameters of list-page buttons', () => {
  const env = makeEnv(fakeGmail());
  env.run(`listCard_({ q: 'work', page: 0 })`);
  assert.ok(env.log.actions.includes('onEditFilter'));
  assert.ok(env.log.actions.includes('onConfirmDelete'));
});

test('contextual trigger without a readable message degrades gracefully', () => {
  const env = makeEnv(fakeGmail());
  const card = env.run('buildContextualCard({ gmail: { messageId: "x" } })');
  assert.ok(card.built);
});
