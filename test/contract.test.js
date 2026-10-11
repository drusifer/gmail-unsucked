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
const allWidgets = (card) => sectionsOf(card).reduce((acc, sec) => acc.concat(sec.props.widgets), []);
const widgetKinds = (section) => section.props.widgets.map((w) => w.__kind);
const manyFilters = (n) => Array.from({ length: n }, (_, i) => ({
  id: `m${i}`, criteria: { from: `s${String(i).padStart(3, '0')}@x.com` }, action: { addLabelIds: ['Label_1'] },
}));

test('list: controls section then row sections; each filter ends in a [View details] [Edit] row, dividers between filters', () => {
  const env = makeEnv();
  const card = env.run('buildHomepage({})');
  assert.strictEqual(sectionsOf(card).length, 2, 'controls + one rows section');
  const bars = allWidgets(card).filter((w) => w.__kind === 'ButtonSet' && w.props.buttons.some((b) => b.props.text === 'View details'));
  assert.strictEqual(bars.length, FILTERS.length, 'one [View details] [Edit] row per filter');
  bars.forEach((bar) => assert.deepStrictEqual(bar.props.buttons.map((b) => [b.props.text, b.props.action.props.functionName]),
    [['View details', 'onOpenFilter'], ['Edit', 'onEditFilter']]));
  assert.strictEqual(allWidgets(card).filter((w) => w.__kind === 'Divider').length, FILTERS.length - 1, 'a divider between each pair of filters');
});

test('labels render as one tag line of names, no color dots', () => {
  const env = makeEnv();
  env.run(`Gmail.Users.Labels.list = () => ({ labels: [
    { id: 'Label_1', name: 'Work', type: 'user', color: { backgroundColor: '#16a766', textColor: '#ffffff' } },
    { id: 'Label_2', name: 'Home', type: 'user' } ] })`);
  const card = env.run('buildHomepage({})');
  const text = JSON.stringify(allWidgets(card).map((w) => w.props.text || ''));
  assert.match(text, /Work/);
  const tag = allWidgets(card).find((w) => w.__kind === 'DecoratedText' && w.props.text === 'Work');
  assert.ok(tag && /label_grey600/.test(tag.props.startIcon.props.iconUrl), 'tag line has the label icon');
  assert.doesNotMatch(text, /●|#16a766/);
});

test('filter item: one DecoratedText per line with a start icon (own column), tag line, action icons last', () => {
  const env = makeEnv();
  env.state.filters = [{ id: 'k1', criteria: { from: 'a@x.com', query: 'boot' }, action: { addLabelIds: ['STARRED', 'Label_1'], removeLabelIds: ['INBOX'], forward: 'fwd@x.com' } }];
  const card = env.run('buildHomepage({})');
  const lines = allWidgets(card).filter((w) => w.__kind === 'DecoratedText');
  assert.strictEqual(lines.length, 5, 'From, Has words, tags, forward address, actions');
  const icons = lines.slice(0, 3).map((l) => l.props.startIcon.props.iconUrl.split('/').pop());
  assert.deepStrictEqual(icons, ['person_grey600_24dp.png', 'search_grey600_24dp.png', 'label_grey600_24dp.png']);
  lines.slice(0, 3).forEach((l) => assert.strictEqual(l.props.wrap, true));
  lines.forEach((l) => assert.strictEqual(l.props.onClick.props.functionName, 'onOpenFilter'));
  assert.strictEqual(lines[3].props.text, 'fwd@x.com', 'forward address is shown as text');
  assert.match(lines[3].props.startIcon.props.iconUrl, /arrow_forward/);
  const last = lines[4];
  assert.match(last.props.text, /\u2B50 \u{1F4E4}/u);
  assert.doesNotMatch(last.props.text, /\u27A1/u, 'forward icon not repeated on the icon line');
  assert.ok(!last.props.button, 'icon line carries no button');
});

test('filter with only a forward action has no filler icon line', () => {
  const env = makeEnv();
  env.state.filters = [{ id: 'o1', criteria: { from: 'a@x.com' }, action: { forward: 'fwd@x.com' } }];
  const lines = allWidgets(env.run('buildHomepage({})')).filter((w) => w.__kind === 'DecoratedText');
  assert.deepStrictEqual(lines.map((l) => l.props.text), ['<b>a@x.com</b>', 'fwd@x.com']);
});

test('growing list: batch of 10, each Show more adds 10, capped at 90 with no further button', () => {
  const env = makeEnv();
  env.state.filters = manyFilters(120);
  const rowsAt = (page) => allWidgets(env.run(`listCard_({ q: '', page: ${page} })`));
  const count = (ws) => ws.filter((w) => w.__kind === 'ButtonSet' && w.props.buttons.some((b) => b.props.text === 'View details')).length;
  assert.strictEqual(count(rowsAt(0)), 10);
  assert.strictEqual(count(rowsAt(1)), 20);
  const more = rowsAt(0).find((w) => w.__kind === 'ButtonSet' && JSON.stringify(w).includes('onShowList'));
  assert.ok(more, 'Show more present');
  const capped = rowsAt(50);
  assert.strictEqual(count(capped), 90);
  assert.ok(!capped.some((w) => w.__kind === 'ButtonSet' && JSON.stringify(w).includes('onShowList')));
  const cappedCard = env.run("listCard_({ q: '', page: 50 })");
  sectionsOf(cappedCard).forEach((sec) => assert.ok(sec.props.widgets.length <= 100, 'each section stays under the 100-widget limit'));
  assert.ok(sectionsOf(cappedCard).length <= 100);
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
