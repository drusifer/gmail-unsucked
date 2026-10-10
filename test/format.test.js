const test = require('node:test');
const assert = require('node:assert');
const F = require('../format');

const labels = { Label_1: 'Work', Label_2: 'News' };

test('F1 render: criteria and actions in plain language', () => {
  const f = {
    criteria: { from: 'boss@x.com' },
    action: { addLabelIds: ['Label_1'], removeLabelIds: ['INBOX'], forward: 'a@b.com' },
  };
  assert.strictEqual(
    F.renderFilter(f, labels),
    'From: boss@x.com -> Label "Work", Skip Inbox, Forward to a@b.com');
});

test('F1 render: no raw JSON, ids replaced by names, system actions worded', () => {
  const f = {
    criteria: { subject: 'hi', hasAttachment: true, size: 5242880, sizeComparison: 'larger', negatedQuery: 'spam' },
    action: { addLabelIds: ['STARRED', 'TRASH', 'IMPORTANT'], removeLabelIds: ['UNREAD', 'SPAM'] },
  };
  const t = F.renderFilter(f, labels);
  assert.ok(!/[{}"]{2}|Label_/.test(t));
  assert.strictEqual(t,
    "Subject: hi, Doesn't have: spam, Has attachment, Size larger than 5 MB -> Star it, Delete it, Mark important, Mark as read, Never send to Spam");
});

test('render: empty filter has placeholders', () => {
  assert.strictEqual(F.renderFilter({}, {}), '(no conditions) -> (no actions)');
});

test('F1 sort: first criterion A-Z then id, does not mutate input', () => {
  const list = [
    { id: '3', criteria: { from: 'zed@x.com' } },
    { id: '2', criteria: { from: 'Amy@x.com' } },
    { id: '1', criteria: { from: 'amy@x.com' } },
    { id: '4', criteria: {} },
  ];
  const sorted = F.sortFilters(list);
  assert.deepStrictEqual(sorted.map((f) => f.id), ['1', '2', '3', '4']);
  assert.strictEqual(list[0].id, '3');
});

test('F2 search: case-insensitive against rendered text incl. label names', () => {
  const list = [
    { id: '1', criteria: { from: 'boss@x.com' }, action: { addLabelIds: ['Label_1'] } },
    { id: '2', criteria: { from: 'news@y.com' }, action: { addLabelIds: ['Label_2'] } },
  ];
  assert.deepStrictEqual(F.searchFilters(list, 'WORK', labels).map((f) => f.id), ['1']);
  assert.deepStrictEqual(F.searchFilters(list, 'y.com', labels).map((f) => f.id), ['2']);
  assert.deepStrictEqual(F.searchFilters(list, '  ', labels).length, 2);
  assert.strictEqual(F.searchFilters(list, 'nomatch', labels).length, 0);
});

test('paginate: pages of 10, clamps page', () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  const p0 = F.paginate(items, 0, 10);
  assert.deepStrictEqual([p0.items.length, p0.pages, p0.start, p0.end], [10, 3, 1, 10]);
  const p2 = F.paginate(items, 99, 10);
  assert.deepStrictEqual([p2.page, p2.items.length, p2.start, p2.end], [2, 3, 21, 23]);
  assert.deepStrictEqual([F.paginate([], 0, 10).pages, F.paginate([], 0, 10).total], [1, 0]);
});

test('validate: needs a criterion and an action', () => {
  const r = F.validateForm({});
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.criteria && r.errors.actions);
  assert.strictEqual(F.validateForm({ from: 'a@b.com', star: true }).ok, true);
});

test('validate: size must be positive number', () => {
  const r = F.validateForm({ sizeValue: 'abc', star: true });
  assert.ok(r.errors.sizeValue);
  assert.ok(r.errors.criteria);
  assert.strictEqual(F.validateForm({ sizeValue: '2', star: true }).ok, true);
});

test('validate: forwarding must be verified (unless unchanged from original)', () => {
  const base = { from: 'a@b.com', forwardTo: 'x@y.com' };
  assert.ok(F.validateForm(base, { verifiedAddresses: [] }).errors.forwardTo);
  assert.strictEqual(F.validateForm(base, { verifiedAddresses: ['X@Y.com'] }).ok, true);
  assert.strictEqual(F.validateForm(base, { verifiedAddresses: [], keepForward: 'x@y.com' }).ok, true);
  assert.ok(F.validateForm({ from: 'a@b.com', forwardTo: 'nope' }, { verifiedAddresses: ['nope'] }).errors.forwardTo);
});

test('mapping: round trip is lossless for representable filters', () => {
  const f = {
    criteria: { from: 'a@b.com', subject: 's', hasAttachment: true, size: 2048, sizeComparison: 'smaller' },
    action: { addLabelIds: ['Label_1', 'STARRED'], removeLabelIds: ['INBOX', 'UNREAD'], forward: 'f@x.com' },
  };
  const { form, extras } = F.filterToForm(f);
  assert.strictEqual(form.sizeValue, '2');
  assert.strictEqual(form.sizeUnit, 'KB');
  assert.strictEqual(form.sizeOp, 'smaller');
  assert.ok(F.filtersEqual(f, F.formToFilter(form, extras)));
});

test('C1: fields the form cannot represent survive an edit', () => {
  const f = {
    criteria: { from: 'a@b.com', excludeChats: true, futureField: 'x' },
    action: {
      addLabelIds: ['Label_1', 'Label_2', 'CATEGORY_UPDATES'],
      removeLabelIds: ['INBOX', 'IMPORTANT'],
      someNewAction: 1,
    },
  };
  const { form, extras } = F.filterToForm(f);
  assert.strictEqual(form.labelId, 'Label_1');
  form.subject = 'changed';
  const out = F.formToFilter(form, extras);
  assert.strictEqual(out.criteria.excludeChats, true);
  assert.strictEqual(out.criteria.futureField, 'x');
  assert.strictEqual(out.criteria.subject, 'changed');
  assert.deepStrictEqual(out.action.addLabelIds.slice().sort(), ['CATEGORY_UPDATES', 'Label_1', 'Label_2']);
  assert.deepStrictEqual(out.action.removeLabelIds.slice().sort(), ['IMPORTANT', 'INBOX']);
  assert.strictEqual(out.action.someNewAction, 1);
});

test('C1: filter with only unrepresentable actions still validates as having an action', () => {
  const f = { criteria: { from: 'a@b.com' }, action: { addLabelIds: ['CATEGORY_SOCIAL'] } };
  const { form, extras } = F.filterToForm(f);
  assert.strictEqual(F.validateForm(form, { extras }).ok, true);
});

test('size units: bytes round trip exactly', () => {
  assert.deepStrictEqual(F.sizeToUnit(1048576 * 3), { value: 3, unit: 'MB' });
  assert.deepStrictEqual(F.sizeToUnit(1500), { value: 1500, unit: 'B' });
  assert.strictEqual(F.unitToBytes('1500', 'B'), 1500);
});

test('filtersEqual ignores id, ordering, and empty values', () => {
  const a = { id: '1', criteria: { from: 'a' }, action: { addLabelIds: ['x', 'y'], removeLabelIds: [] } };
  const b = { criteria: { from: 'a', hasAttachment: false }, action: { addLabelIds: ['y', 'x'] } };
  assert.ok(F.filtersEqual(a, b));
  assert.ok(!F.filtersEqual(a, { criteria: { from: 'b' }, action: a.action }));
});

test('extractEmail', () => {
  assert.strictEqual(F.extractEmail('Boss Man <boss@x.com>'), 'boss@x.com');
  assert.strictEqual(F.extractEmail(' plain@x.com '), 'plain@x.com');
});

// ---- Sprint 3: card model (U1-U4) ----
test('truncate: boundaries at maxLen', () => {
  const s39 = 'a'.repeat(39); const s40 = 'a'.repeat(40); const s41 = 'a'.repeat(41);
  assert.strictEqual(F.truncate(s39, 40), s39);
  assert.strictEqual(F.truncate(s40, 40), s40);
  assert.strictEqual(F.truncate(s41, 40), `${'a'.repeat(37)}...`); // total length 40
  assert.strictEqual(F.truncate(undefined, 40), '');
  assert.strictEqual(F.truncate('  padded  ', 40), 'padded');
});

test('cardModel: title is first set criterion, others become conditions, labels carry color', () => {
  const names = { Label_1: 'Work', Label_2: 'Receipts' };
  const colors = { Label_1: '#16a766' };
  const m = F.cardModel({
    id: 'x',
    criteria: { from: 'boss@x.com', subject: 'Quarterly numbers for the whole department please read carefully', hasAttachment: true, size: 5242880, sizeComparison: 'larger' },
    action: { addLabelIds: ['Label_1', 'Label_2', 'STARRED'], removeLabelIds: ['INBOX'], forward: 'a@b.com' },
  }, names, colors, { maxLen: 40 });
  assert.strictEqual(m.titleName, 'From');
  assert.strictEqual(m.title, 'boss@x.com');
  assert.deepStrictEqual(m.labels, [
    { id: 'Label_1', name: 'Work', color: '#16a766' },
    { id: 'Label_2', name: 'Receipts', color: null },
  ]);
  const subj = m.conditions.find((c) => c.name === 'Subject');
  assert.strictEqual(subj.value.length, 40);
  assert.ok(subj.value.endsWith('...'));
  assert.ok(subj.full.startsWith('Quarterly numbers'));
  assert.ok(m.conditions.some((c) => c.name === 'Has attachment'));
  assert.ok(m.conditions.some((c) => c.name === 'Size' && /larger than 5 MB/.test(c.value)));
  assert.deepStrictEqual(m.actions, ['Star it', 'Skip Inbox', 'Forward to a@b.com']);
});

test('cardModel: edge cases (no criteria, unknown label id, system label, extras)', () => {
  const m0 = F.cardModel({ id: 'a', criteria: {}, action: {} }, {}, {}, {});
  assert.strictEqual(m0.title, '(no conditions)');
  assert.deepStrictEqual(m0.labels, []);
  assert.deepStrictEqual(m0.actions, []);
  const m1 = F.cardModel({ id: 'b', criteria: { to: 'me@x.com' }, action: { addLabelIds: ['Label_9', 'CATEGORY_UPDATES'] } }, {}, {}, {});
  assert.strictEqual(m1.titleName, 'To');
  assert.deepStrictEqual(m1.labels, [{ id: 'Label_9', name: 'Label_9', color: null }]);
  assert.deepStrictEqual(m1.actions, ['Categorize as Updates']);
});

test('cardModel: bad color values are dropped (never injected into HTML)', () => {
  const m = F.cardModel({ id: 'c', criteria: { from: 'a@x.com' }, action: { addLabelIds: ['L'] } }, { L: 'N' }, { L: '"><script>' }, {});
  assert.strictEqual(m.labels[0].color, null);
});
