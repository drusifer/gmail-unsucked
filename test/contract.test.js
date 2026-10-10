// Handler contract tests: run the real add-on files against the strict CardService fake.
// Catches the class of failure the lenient stub in cards.test.js cannot: wrong argument
// types, unbuilt builders, handlers returning something the add-on platform rejects,
// and card buttons that name a handler function which does not exist.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { newCardService, collectActions } = require('./strict_cardservice');

const FILES = ['format.js', 'gmail_api.js', 'filters.js', 'cards.js'];

// A spread of filter shapes: simple, forwarding, size, trash, many labels, unknown fields.
const FILTERS = [
  { id: 'f1', criteria: { from: 'boss@x.com' }, action: { addLabelIds: ['Label_1'] } },
  { id: 'f2', criteria: { to: 'me@x.com', subject: 'Invoice', hasAttachment: true, size: 5242880, sizeComparison: 'larger' },
    action: { removeLabelIds: ['INBOX', 'UNREAD'], addLabelIds: ['STARRED', 'IMPORTANT'] } },
  { id: 'f3', criteria: { query: 'deal OR offer', negatedQuery: 'spam' }, action: { addLabelIds: ['TRASH'], removeLabelIds: ['SPAM'] } },
  { id: 'f4', criteria: { from: 'a@x.com' }, action: { forward: 'fwd@x.com' } },
  { id: 'f5', criteria: { from: 'b@x.com', excludeChats: true, mystery: 'x' },
    action: { addLabelIds: ['Label_1', 'Label_2', 'CATEGORY_UPDATES'], removeLabelIds: ['INBOX', 'Label_9'] } },
  { id: 'f6', criteria: {}, action: {} },
];

const makeEnv = (overrides = {}) => {
  const state = { filters: FILTERS.map((f) => JSON.parse(JSON.stringify(f))) };
  const gmail = {
    Users: {
      Labels: { list: () => ({ labels: [{ id: 'Label_1', name: 'Work', type: 'user' }, { id: 'Label_2', name: 'Home', type: 'user' }] }) },
      Settings: {
        Filters: {
          list: () => ({ filter: state.filters }),
          create: (r) => { const f = Object.assign({ id: `n${state.filters.length}` }, r); state.filters.push(f); return f; },
          remove: (_me, id) => { state.filters = state.filters.filter((f) => f.id !== id); },
        },
        ForwardingAddresses: { list: () => ({ forwardingAddresses: [{ forwardingEmail: 'fwd@x.com', verificationStatus: 'accepted' }] }) },
      },
    },
  };
  const ctx = vm.createContext(Object.assign({ CardService: newCardService(), Gmail: gmail, console }, overrides));
  vm.runInContext(FILES.map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n'), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return { run, state };
};

const ev = (parameters, extra) => JSON.stringify(Object.assign({ parameters: Object.assign({ q: '', page: '0' }, parameters) }, extra));

const isActionResponse = (r) => r && r.__kind === 'ActionResponse' && r.__built === true;
const titles = (r) => {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.__kind === 'CardHeader') out.push(n.props.title);
    Object.values(n.props || {}).forEach((v) => (Array.isArray(v) ? v.forEach(walk) : walk(v)));
  };
  walk(r);
  return out;
};
const isCard = (r) => r && r.__kind === 'Card' && r.__built === true;

test('homepage and contextual triggers return a built Card', () => {
  const { run } = makeEnv();
  assert.ok(isCard(run('buildHomepage({})')));
  assert.ok(isCard(run('buildContextualCard({ gmail: { messageId: "m1" } })')));
});

test('every handler returns a built ActionResponse for every filter shape', () => {
  FILTERS.forEach((f) => {
    const { run } = makeEnv();
    [
      `onEditFilter(${ev({ id: f.id })})`,
      `onDuplicateFilter(${ev({ id: f.id })})`,
      `onConfirmDelete(${ev({ id: f.id })})`,
      `onDeleteFilter(${ev({ id: f.id })})`,
    ].forEach((code) => {
      let r;
      assert.doesNotThrow(() => { r = run(code); }, `${code} (filter ${f.id})`);
      assert.ok(isActionResponse(r), `${code} (filter ${f.id}) returned ${r && r.__kind}`);
      assert.ok(!titles(r).includes('Something went wrong'), `${code} (filter ${f.id}) fell into the error card`);
    });
  });
});

test('navigation and list handlers return a built ActionResponse', () => {
  const { run } = makeEnv();
  [
    `onShowList(${ev({})})`, `onManageFilters(${ev({})})`, `onClearSearch(${ev({})})`,
    `onCancel(${ev({})})`, `onNewFilter(${ev({})})`,
    `onSearch({ formInput: { q: 'work' } })`,
    `onNewFromMessage(${ev({ from: 'a@b.com', subject: 's' })})`,
    `onEditFilter(${ev({ id: 'missing' })})`,
  ].forEach((code) => {
    const r = run(code);
    assert.ok(isActionResponse(r), `${code} returned ${r && r.__kind}`);
  });
});

test('save handler returns a built ActionResponse on every outcome', () => {
  const { run } = makeEnv();
  const save = (formInput, p) => `onSaveFilter(${JSON.stringify({
    parameters: Object.assign({ mode: 'create', q: '', page: '0', extras: '{}' }, p),
    formInput,
    formInputs: { actions: formInput.actions || [], options: formInput.options || [] },
  })})`;
  [
    save({ from: '' }),                                              // invalid
    save({ from: 'new@x.com', labelId: 'Label_1', actions: ['star'] }), // ok
    save({ from: 'new@x.com', forwardTo: 'nope@x.com' }),            // invalid forward
    save({ from: 'boss@x.com', labelId: 'Label_1' }, { mode: 'edit', oldId: 'f1' }), // no_change or ok
    save({ from: 'x@x.com' }, { mode: 'edit', oldId: 'missing' }),   // not_found
    `onRetryDeleteOld(${ev({ oldId: 'f1' })})`,
    `onUndoDelete(${ev({ copy: JSON.stringify(FILTERS[0]) })})`,
    `onUndoDelete(${ev({ copy: 'not json' })})`,
  ].forEach((code) => {
    const r = run(code);
    assert.ok(isActionResponse(r), `${code.slice(0, 60)} returned ${r && r.__kind}`);
  });
});

test('API failures render an error card inside an ActionResponse, never a bare object', () => {
  const { run } = makeEnv();
  const bad = makeEnv();
  bad.run('Gmail.Users.Settings.Filters.list = () => { throw new Error("boom 403"); }');
  assert.ok(run('buildHomepage({})'));
  assert.ok(isCard(bad.run('buildHomepage({})')));
  [`onEditFilter(${ev({ id: 'f1' })})`, `onDuplicateFilter(${ev({ id: 'f1' })})`, `onConfirmDelete(${ev({ id: 'f1' })})`]
    .forEach((code) => assert.ok(isActionResponse(bad.run(code)), code));
});

test('every button action names a handler that exists, with string-only parameters', () => {
  const { run } = makeEnv();
  const cards = [
    run('buildHomepage({})'),
    run(`onNewFilter(${ev({})})`),
    run(`onEditFilter(${ev({ id: 'f5' })})`),
    run(`onConfirmDelete(${ev({ id: 'f1' })})`),
    run(`onDeleteFilter(${ev({ id: 'f1' })})`),
  ];
  const names = new Set();
  cards.forEach((c) => collectActions(c).forEach((a) => names.add(a.fn)));
  assert.ok(names.size > 5, 'expected many actions');
  names.forEach((fn) => assert.strictEqual(run(`typeof ${fn}`), 'function', `handler ${fn} is not defined`));
});

test('F6: saving an identical filter shows the friendly "already exists" message (real Gmail wording)', () => {
  const { run } = makeEnv();
  run(`Gmail.Users.Settings.Filters.create = () => { throw new Error('API call to gmail.users.settings.filters.create failed with error: Filter already exists'); }`);
  const r = run(`onSaveFilter(${JSON.stringify({
    parameters: { mode: 'create', q: '', page: '0', extras: '{}' },
    formInput: { from: 'dup@x.com' }, formInputs: { actions: ['star'], options: [] },
  })})`);
  assert.ok(isActionResponse(r));
  const json = r.printJson();
  assert.match(json, /already exists/i);
  assert.doesNotMatch(json, /could not complete that request/i);
});
