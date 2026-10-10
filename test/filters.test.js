const test = require('node:test');
const assert = require('node:assert');
const Format = require('../format');
const FilterService = require('../filters');

const makeApi = (over) => {
  const state = {
    filters: [
      { id: 'f1', criteria: { from: 'boss@x.com' }, action: { addLabelIds: ['Label_1'] } },
      { id: 'f2', criteria: { from: 'a@y.com' }, action: { forward: 'old@z.com' } },
    ],
    created: [],
    deleted: [],
    nextId: 100,
  };
  const api = {
    normalizeError: (e) => ({ code: 0, message: String((e && e.message) || e) }),
    listFilters: () => state.filters.slice(),
    createFilter: (r) => {
      const f = Object.assign({ id: `n${state.nextId++}` }, r);
      state.created.push(f);
      state.filters.push(f);
      return f;
    },
    deleteFilter: (id) => {
      state.deleted.push(id);
      state.filters = state.filters.filter((f) => f.id !== id);
    },
    listLabels: () => [
      { id: 'Label_1', name: 'Work', type: 'user' },
      { id: 'Label_2', name: 'Alpha', type: 'user' },
      { id: 'INBOX', name: 'INBOX', type: 'system' },
    ],
    listForwardingAddresses: () => [
      { forwardingEmail: 'ok@z.com', verificationStatus: 'accepted' },
      { forwardingEmail: 'pending@z.com', verificationStatus: 'pending' },
    ],
  };
  Object.assign(api, over);
  return { api, state, svc: FilterService.create(api, Format) };
};

test('listView: sorted, rendered with label names, paged', () => {
  const { svc } = makeApi();
  const v = svc.listView({ q: '', page: 0 });
  assert.deepStrictEqual(v.items.map((i) => i.id), ['f2', 'f1']);
  assert.strictEqual(v.items[1].text, 'From: boss@x.com -> Label "Work"');
  assert.strictEqual(v.totalFilters, 2);
  assert.strictEqual(svc.listView({ q: 'work' }).matched, 1);
});

test('formOptions: user labels sorted by name; only verified forwarding addresses', () => {
  const { svc } = makeApi();
  const o = svc.formOptions();
  assert.deepStrictEqual(o.labels.map((l) => l.name), ['Alpha', 'Work']);
  assert.deepStrictEqual(o.forwardAddresses, ['ok@z.com']);
});

test('createFilter: invalid form is rejected without calling API', () => {
  const { svc, state } = makeApi();
  const r = svc.createFilter({}, Format.emptyExtras());
  assert.strictEqual(r.status, 'invalid');
  assert.strictEqual(state.created.length, 0);
});

test('createFilter: unverified forward rejected; verified accepted', () => {
  const { svc, state } = makeApi();
  const bad = svc.createFilter({ from: 'a@b.com', forwardTo: 'pending@z.com' }, Format.emptyExtras());
  assert.strictEqual(bad.status, 'invalid');
  const ok = svc.createFilter({ from: 'a@b.com', forwardTo: 'ok@z.com' }, Format.emptyExtras());
  assert.strictEqual(ok.status, 'ok');
  assert.strictEqual(state.created[0].action.forward, 'ok@z.com');
});

test('createFilter: API error surfaces as status error', () => {
  const { svc } = makeApi({ createFilter: () => { throw { code: 400, message: 'Filter already exists' }; } });
  const r = svc.createFilter({ from: 'a@b.com', star: true }, Format.emptyExtras());
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(r.error.code, 400);
});

test('D1: edit creates new first, then deletes old', () => {
  const { svc } = makeApi();
  const g = svc.getForm('f1');
  g.form.subject = 'new';
  const r = svc.editFilter('f1', g.form, g.extras);
  assert.strictEqual(r.status, 'ok');
  const v = svc.listView({});
  assert.strictEqual(v.totalFilters, 2);
  assert.ok(v.items.some((i) => /Subject: new/.test(i.text)));
  assert.ok(!v.items.some((i) => i.id === 'f1'));
});

test('D1: if create fails the old filter is untouched', () => {
  const { svc, state } = makeApi({ createFilter: () => { throw { code: 500, message: 'boom' }; } });
  const g = svc.getForm('f1');
  g.form.subject = 'x';
  const r = svc.editFilter('f1', g.form, g.extras);
  assert.strictEqual(r.status, 'error');
  assert.deepStrictEqual(state.deleted, []);
  assert.ok(state.filters.some((f) => f.id === 'f1'));
});

test('D2: create ok but delete fails returns partial with old id', () => {
  const { svc } = makeApi({ deleteFilter: () => { throw { code: 500, message: 'nope' }; } });
  const g = svc.getForm('f1');
  g.form.subject = 'x';
  const r = svc.editFilter('f1', g.form, g.extras);
  assert.strictEqual(r.status, 'partial');
  assert.strictEqual(r.oldId, 'f1');
  assert.ok(r.filter.id);
});

test('D3: unchanged edit returns no_change and makes no API writes', () => {
  const { svc, state } = makeApi();
  const g = svc.getForm('f1');
  const r = svc.editFilter('f1', g.form, g.extras);
  assert.strictEqual(r.status, 'no_change');
  assert.strictEqual(state.created.length, 0);
  assert.strictEqual(state.deleted.length, 0);
});

test('edit keeps an unverified forward that was already on the filter', () => {
  const { svc } = makeApi();
  const g = svc.getForm('f2');
  g.form.subject = 'tweak';
  assert.strictEqual(svc.editFilter('f2', g.form, g.extras).status, 'ok');
});

test('C1 through service: edit preserves unrepresentable fields', () => {
  const { svc, state } = makeApi();
  state.filters.push({
    id: 'f3',
    criteria: { from: 'c@d.com', excludeChats: true },
    action: { addLabelIds: ['Label_1', 'CATEGORY_SOCIAL'] },
  });
  const g = svc.getForm('f3');
  g.form.subject = 'x';
  svc.editFilter('f3', g.form, g.extras);
  const created = state.created[0];
  assert.strictEqual(created.criteria.excludeChats, true);
  assert.ok(created.action.addLabelIds.includes('CATEGORY_SOCIAL'));
});

test('editFilter: missing id is not_found', () => {
  const { svc } = makeApi();
  assert.strictEqual(svc.editFilter('zzz', { from: 'a', star: true }, Format.emptyExtras()).status, 'not_found');
});

test('D4: delete returns copy; undo re-creates it', () => {
  const { svc, state } = makeApi();
  const d = svc.deleteFilter('f1');
  assert.strictEqual(d.status, 'ok');
  assert.deepStrictEqual(d.deleted, { criteria: { from: 'boss@x.com' }, action: { addLabelIds: ['Label_1'] } });
  assert.ok(!state.filters.some((f) => f.id === 'f1'));
  const u = svc.undoDelete(d.deleted);
  assert.strictEqual(u.status, 'ok');
  assert.ok(state.filters.some((f) => f.criteria.from === 'boss@x.com'));
});

test('deleteFilter: missing id is not_found and delete error is reported', () => {
  assert.strictEqual(makeApi().svc.deleteFilter('nope').status, 'not_found');
  const { svc } = makeApi({ deleteFilter: () => { throw { code: 403, message: 'denied' }; } });
  assert.strictEqual(svc.deleteFilter('f1').status, 'error');
});

test('retryDeleteOld', () => {
  const { svc, state } = makeApi();
  assert.strictEqual(svc.retryDeleteOld('f1').status, 'ok');
  assert.deepStrictEqual(state.deleted, ['f1']);
});

test('F8 prefillFromMessage extracts address and subject', () => {
  const { svc } = makeApi();
  const f = svc.prefillFromMessage({ from: 'Boss <boss@x.com>', subject: ' Weekly report ' });
  assert.strictEqual(f.from, 'boss@x.com');
  assert.strictEqual(f.subject, 'Weekly report');
});

test('listView: no filters and unknown id edge cases', () => {
  const { svc, state } = makeApi();
  state.filters = [];
  const v = svc.listView({ q: 'x', page: 5 });
  assert.deepStrictEqual([v.totalFilters, v.matched, v.pages, v.items.length], [0, 0, 1, 0]);
  assert.strictEqual(svc.getForm('missing').status, 'not_found');
});

test('listView: paging 25 filters gives 3 pages and clamps page', () => {
  const { svc, state } = makeApi();
  state.filters = Array.from({ length: 25 }, (_, i) => ({
    id: `x${i}`, criteria: { from: `u${String(i).padStart(2, '0')}@a.com` }, action: { addLabelIds: ['STARRED'] },
  }));
  const v = svc.listView({ page: 2 });
  assert.deepStrictEqual([v.pages, v.items.length, v.start, v.end], [3, 5, 21, 25]);
  assert.strictEqual(svc.listView({ page: 99 }).page, 2);
});

test('listView items carry a card model with label colors; missing color is null', () => {
  const { svc } = makeApi({
    listLabels: () => [
      { id: 'Label_1', name: 'Work', type: 'user', color: { textColor: '#ffffff', backgroundColor: '#16a766' } },
      { id: 'Label_2', name: 'Alpha', type: 'user' },
    ],
  });
  const v = svc.listView({ q: '' });
  const withLabel = v.items.find((i) => i.id === 'f1');
  assert.deepStrictEqual(withLabel.model.labels, [{ id: 'Label_1', name: 'Work', color: '#16a766' }]);
  assert.strictEqual(withLabel.model.title, 'boss@x.com');
  assert.strictEqual(v.items.find((i) => i.id === 'f2').model.actions[0], 'Forward to old@z.com');
});

test('getForm result exposes the card model for the detail view', () => {
  const { svc } = makeApi();
  const r = svc.getModel('f1');
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.model.titleName, 'From');
  assert.strictEqual(svc.getModel('missing').status, 'not_found');
});
