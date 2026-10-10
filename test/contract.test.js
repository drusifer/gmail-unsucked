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

// ---- Sprint 3 layout (docs/SPRINT3_UX.md E4, E10-E12, U5) ----
const sectionsOf = (card) => card.props.sections;
const widgetKinds = (section) => section.props.widgets.map((w) => w.__kind);
const manyFilters = (n) => Array.from({ length: n }, (_, i) => ({
  id: `m${i}`, criteria: { from: `s${String(i).padStart(3, '0')}@x.com` }, action: { addLabelIds: ['Label_1'] },
}));

test('list is one Card with one section; each filter is exactly one DecoratedText row', () => {
  const env = makeEnv();
  const card = env.run('buildHomepage({})');
  assert.strictEqual(sectionsOf(card).length, 1);
  const rows = sectionsOf(card)[0].props.widgets.filter((w) => w.__kind === 'DecoratedText');
  assert.strictEqual(rows.length, FILTERS.length);
  rows.forEach((r) => {
    assert.ok(r.props.onClick && r.props.onClick.props.functionName === 'onOpenFilter', 'row opens the detail card');
    assert.strictEqual(r.props.button.__kind, 'ImageButton', 'single end button is an icon button');
    assert.ok(r.props.button.props.altText);
  });
});

test('label color dots use the label color; labels without one get a neutral dot; names always present', () => {
  const env = makeEnv();
  env.run(`Gmail.Users.Labels.list = () => ({ labels: [
    { id: 'Label_1', name: 'Work', type: 'user', color: { backgroundColor: '#16a766', textColor: '#ffffff' } },
    { id: 'Label_2', name: 'Home', type: 'user' } ] })`);
  const card = env.run('buildHomepage({})');
  const text = JSON.stringify(sectionsOf(card)[0].props.widgets.map((w) => w.props.text || ''));
  assert.match(text, /#16a766[^>]*>●<\/font> Work/);
  assert.match(text, /#757575[^>]*>●<\/font> Home/);
});

test('growing list: batch of 10, each Show more adds 10, capped at 90 with no further button', () => {
  const env = makeEnv();
  env.state.filters = manyFilters(120);
  const rowsAt = (page) => sectionsOf(env.run(`listCard_({ q: '', page: ${page} })`))[0].props.widgets;
  const count = (ws) => ws.filter((w) => w.__kind === 'DecoratedText').length;
  assert.strictEqual(count(rowsAt(0)), 10);
  assert.strictEqual(count(rowsAt(1)), 20);
  const more = rowsAt(0).find((w) => w.__kind === 'ButtonSet' && JSON.stringify(w).includes('onShowList'));
  assert.ok(more, 'Show more present');
  const capped = rowsAt(50);
  assert.strictEqual(count(capped), 90);
  assert.ok(!capped.some((w) => w.__kind === 'ButtonSet' && JSON.stringify(w).includes('onShowList')));
  assert.ok(capped.length <= 100, 'stays under the 100-widget limit');
});

test('detail card carries every action with list context (C2) and full values', () => {
  const env = makeEnv();
  const r = env.run(`onOpenFilter(${ev({ id: 'f2', q: 'inv', page: '2' })})`);
  assert.ok(isActionResponse(r));
  const acts = collectActions(r);
  ['onEditFilter', 'onDuplicateFilter', 'onConfirmDelete'].forEach((fn) => {
    const a = acts.find((x) => x.fn === fn);
    assert.ok(a, fn);
    assert.strictEqual(a.parameters.q, 'inv');
    assert.strictEqual(a.parameters.page, '2');
    assert.strictEqual(a.parameters.id, 'f2');
  });
});

test('editor: More conditions folds away when unused and stays open when used', () => {
  const env = makeEnv();
  const moreOf = (r) => r.props.navigation.props.cards[0].props.sections.find((s) => s.props.header === 'More conditions');
  const closed = moreOf(env.run(`onNewFilter(${ev({})})`));
  assert.strictEqual(closed.props.collapsible, true);
  assert.strictEqual(closed.props.numUncollapsible, 0);
  const used = moreOf(env.run(`onEditFilter(${ev({ id: 'f3' })})`)); // has words + doesn't have
  assert.ok(!used.props.collapsible, 'open when a "more" field is set');
});

test('edit form shows what is being edited', () => {
  const env = makeEnv();
  const r = env.run(`onEditFilter(${ev({ id: 'f1' })})`);
  const when = r.props.navigation.props.cards[0].props.sections.find((s) => s.props.header === 'When a message matches');
  assert.ok(when.props.widgets.some((w) => /Editing: .*boss@x\.com/.test(w.props.text || '')));
});
