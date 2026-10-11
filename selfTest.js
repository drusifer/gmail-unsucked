/**
 * Real-runtime self-test (test layer 4, see docs/ARCH.md section 5).
 *
 * Run from the Apps Script editor (select `selfTest`, Run) or `bobp make live-test`.
 * Calls every add-on handler with synthetic events against the REAL CardService and
 * Gmail API, and checks what the add-on platform checks: that each handler returns a
 * built ActionResponse (or Card for triggers), never an error card.
 *
 * Data safety: only touches filters whose criteria.from is the unique marker below;
 * every such filter is removed in `finally`.
 */

const SelfTest_ = (function () {
  const MARKER_PREFIX = 'zz-unsucked-test-';

  const kindOf = (r) => {
    if (!r || typeof r.printJson !== 'function') return 'not-a-card-object';
    const j = r.printJson();
    if (j.indexOf('"renderActions"') >= 0) return 'ActionResponse';
    if (j.indexOf('"sections"') >= 0 || j.indexOf('"header"') >= 0) return 'Card';
    return 'unknown';
  };
  const hitErrorCard = (r) => typeof r.printJson === 'function' && r.printJson().indexOf('Something went wrong') >= 0;

  const ev = (parameters, extra) => Object.assign({ parameters: Object.assign({ q: '', page: '0' }, parameters) }, extra);

  const run = () => {
    const results = [];
    const record = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail || '') });
    // INFO lines report platform facts we could not know offline (docs/SPRINT3_UX.md spikes); never a failure.
    const info = (name, detail) => results.push({ name, ok: true, info: true, detail: String(detail) });
    const check = (name, fn) => {
      try { const d = fn(); record(name, d === undefined || d === true, d); } catch (err) { record(name, false, (err && err.message) || err); }
    };
    const expectResponse = (name, fn, { allowError = false } = {}) => check(name, () => {
      const r = fn();
      const k = kindOf(r);
      if (k !== 'ActionResponse') return `returned ${k}`;
      if (!allowError && hitErrorCard(r)) return 'fell into the error card';
      return true;
    });
    const this_ = { onOpenFilter, onEditFilter, onDuplicateFilter, onConfirmDelete };
    const mine = (marker) => GmailApi.listFilters().filter((f) => f.criteria && f.criteria.from === marker);

    const marker = `${MARKER_PREFIX}${Date.now()}@example.invalid`;
    try {
      // Scopes and services: these fail with "required permissions" if consent is stale.
      check('api: filters.list', () => { GmailApi.listFilters(); });
      check('api: labels.list (gmail.labels scope)', () => { GmailApi.listLabels(); });
      check('api: forwardingAddresses.list', () => { GmailApi.listForwardingAddresses(); });

      check('D5 cache: repeated labels/forwarding reads agree and the cache is usable', () => {
        const a = JSON.stringify(GmailApi.listLabels());
        const b = JSON.stringify(GmailApi.listLabels());
        if (a !== b) return 'labels differ between cached reads';
        if (typeof CacheService !== 'undefined') {
          const c = CacheService.getUserCache();
          c.put('gu:selftest', 'ok', 5);
          if (c.get('gu:selftest') !== 'ok') return 'CacheService round-trip failed';
          c.remove('gu:selftest');
        }
        return true;
      });

      // Spike T19: does labels.list return color for user labels?
      check('probe: label colors', () => {
        const user = GmailApi.listLabels().filter((l) => l.type === 'user');
        const colored = user.filter((l) => l.color && l.color.backgroundColor);
        info('probe: label colors', `${colored.length} of ${user.length} user labels carry a color` +
          (colored[0] ? ` (e.g. ${colored[0].color.backgroundColor})` : ''));
        return true;
      });
      // U7 automated: render the real list card and assert on its JSON (no Gmail UI needed).
      check('render: icons are the legible variant, labels shown as a tag line', () => {
        const json = buildHomepage({}).printJson();
        const view = svc_().listView({ q: '', page: 0, pageSize: 10 });
        if (json.indexOf('_black_') >= 0) return 'black icon variant rendered (invisible in dark mode)';
        if (view.items.length && json.indexOf('_grey600_') < 0) return 'grey600 icons not rendered';
        const missing = [];
        view.items.forEach((it) => it.model.labels.forEach((l) => { if (json.indexOf(l.name) < 0) missing.push(l.name); }));
        return missing.length ? `label names not rendered: ${missing.join(', ')}` : true;
      });
      // Spike T19b: widgets the UX sprint relies on.
      info('probe: CardService.newImageButton', typeof CardService.newImageButton === 'function' ? 'available' : 'MISSING');
      info('probe: CardService.newOverflowMenu (developer preview)', typeof /** @type {any} */ (CardService).newOverflowMenu === 'function'
        ? 'method exists (render still needs a live look)' : 'not available: icon button stays');

      check('trigger: buildHomepage returns a Card', () => (kindOf(buildHomepage({})) === 'Card') || 'not a Card');
      check('trigger: buildContextualCard degrades to a Card', () =>
        (kindOf(buildContextualCard({ gmail: { messageId: 'does-not-exist' } })) === 'Card') || 'not a Card');

      expectResponse('onNewFilter', () => onNewFilter(ev({})));
      expectResponse('onSearch', () => onSearch({ formInput: { q: 'zz' }, parameters: {} }));
      expectResponse('onClearSearch', () => onClearSearch(ev({})));
      expectResponse('onShowList', () => onShowList(ev({})));
      expectResponse('onNewFromMessage', () => onNewFromMessage(ev({ from: 'a@example.invalid', subject: 'hi' })));
      expectResponse('onEditFilter (missing id)', () => onEditFilter(ev({ id: 'does-not-exist' })));

      // Read-only sweep: open every REAL filter in each handler that renders one. Names the
      // exact filter (id + rendered text) that the platform rejects. Nothing is modified.
      const real = GmailApi.listFilters().filter((f) => !(f.criteria && String(f.criteria.from || '').indexOf(MARKER_PREFIX) === 0));
      real.slice(0, 100).forEach((f) => {
        const label = `real filter ${f.id}: ${svc_().render(f).slice(0, 60)}`;
        ['onOpenFilter', 'onEditFilter', 'onDuplicateFilter', 'onConfirmDelete'].forEach((fn) => {
          expectResponse(`${label} -> ${fn}`, () => this_[fn](ev({ id: f.id })));
        });
      });

      // Create a throwaway filter through the real save handler.
      const save = (formInput, p) => onSaveFilter(ev(Object.assign({ mode: 'create', extras: '{}' }, p), {
        formInput, formInputs: { actions: formInput.actions || [], options: formInput.options || [] },
      }));
      expectResponse('onSaveFilter: invalid form re-renders', () => save({ from: '' }, {}));
      expectResponse('onSaveFilter: create', () => save({ from: marker, actions: ['star'] }, {}));

      const created = mine(marker)[0];
      check('created filter is visible via the API', () => !!created || 'throwaway filter not found after create');
      if (created) {
        expectResponse('onEditFilter', () => onEditFilter(ev({ id: created.id })));
        expectResponse('onDuplicateFilter', () => onDuplicateFilter(ev({ id: created.id })));
        expectResponse('onConfirmDelete', () => onConfirmDelete(ev({ id: created.id })));
        check('onSaveFilter: saving an identical filter says it already exists (F6)', () => {
          const r = save({ from: marker, actions: ['star'] }, {});
          if (kindOf(r) !== 'ActionResponse') return `returned ${kindOf(r)}`;
          return /already exists/i.test(r.printJson()) || 'friendly "already exists" message missing';
        });
        expectResponse('onDeleteFilter', () => onDeleteFilter(ev({ id: created.id })));
        check('delete removed it', () => !mine(marker).some((f) => f.id === created.id) || 'filter still present after delete');
        expectResponse('onUndoDelete', () => onUndoDelete(ev({
          copy: JSON.stringify({ criteria: created.criteria, action: created.action }),
        })));
        check('undo restored it', () => mine(marker).length >= 1 || 'no filter present after undo');
      }
    } finally {
      try {
        mine(marker).forEach((f) => GmailApi.deleteFilter(f.id));
        record('cleanup: no throwaway filters left', mine(marker).length === 0, 'cleanup incomplete');
      } catch (err) {
        record('cleanup: no throwaway filters left', false, (err && err.message) || err);
      }
    }
    return results;
  };

  return { run };
})();

/** Entry point. Throws if anything failed so `clasp run` reports a non-zero result. */
const selfTest = () => {
  const results = SelfTest_.run();
  const failed = results.filter((r) => !r.ok);
  const lines = results.map((r) => (r.info ? `INFO  ${r.name}: ${r.detail}` : `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${r.detail}`}`));
  const counted = results.filter((r) => !r.info);
  const summary = `${counted.length - failed.length}/${counted.length} passed`;
  Logger.log(`${lines.join('\n')}\n${summary}`);
  if (failed.length) throw new Error(`selfTest FAILED (${summary})\n${lines.filter((l) => l.startsWith('FAIL')).join('\n')}`);
  return summary;
};
