/**
 * Filter use cases. No CardService here; dependencies (api, fmt) are injected so
 * the same service can back a card UI, a web app, or unit tests.
 *
 * Every mutating method returns a plain result object with a `status`:
 *   ok | invalid | no_change | partial | error | not_found
 */
const FilterService = (function () {
  const create = (api, fmt) => {
    const toError = (err) => (err && typeof err.code === 'number' ? err : api.normalizeError(err));

    const loadLabels = () => {
      const labels = api.listLabels();
      const labelsById = {};
      labels.forEach((l) => { labelsById[l.id] = l.name; });
      const userLabels = labels
        .filter((l) => l.type === 'user')
        .sort((a, b) => a.name.localeCompare(b.name));
      return { labelsById, userLabels };
    };

    const verifiedAddresses = () =>
      api.listForwardingAddresses()
        .filter((a) => a.verificationStatus === 'accepted')
        .map((a) => a.forwardingEmail)
        .sort();

    /** Data for a list page: sorted, searched, paged, and rendered. */
    const listView = (opts) => {
      const o = opts || {};
      const { labelsById } = loadLabels();
      const all = api.listFilters();
      const matched = fmt.searchFilters(fmt.sortFilters(all), o.q, labelsById);
      const pg = fmt.paginate(matched, o.page, o.pageSize || 10);
      return {
        totalFilters: all.length,
        matched: matched.length,
        page: pg.page,
        pages: pg.pages,
        start: pg.start,
        end: pg.end,
        items: pg.items.map((f) => ({ id: f.id, text: fmt.renderFilter(f, labelsById), filter: f })),
      };
    };

    /** Everything the form card needs: labels and verified forwarding addresses. */
    const formOptions = () => {
      const { userLabels } = loadLabels();
      return { labels: userLabels, forwardAddresses: verifiedAddresses() };
    };

    const findFilter = (id) => api.listFilters().find((f) => f.id === id) || null;

    /** Loads an existing filter into the form model (for edit and duplicate). */
    const getForm = (id) => {
      const f = findFilter(id);
      return f ? Object.assign({ status: 'ok', filter: f }, fmt.filterToForm(f)) : { status: 'not_found' };
    };

    const validate = (form, extras, keepForward) =>
      fmt.validateForm(form, { verifiedAddresses: verifiedAddresses(), keepForward, extras });

    const createFilter = (form, extras) => {
      try {
        const v = validate(form, extras, '');
        if (!v.ok) return { status: 'invalid', errors: v.errors };
        const created = api.createFilter(fmt.formToFilter(form, extras));
        return { status: 'ok', filter: created };
      } catch (err) {
        return { status: 'error', error: toError(err) };
      }
    };

    /** Edit = create new, then delete old (D1). Old filter is never deleted before create succeeds. */
    const editFilter = (oldId, form, extras) => {
      let old;
      try {
        old = findFilter(oldId);
      } catch (err) {
        return { status: 'error', error: toError(err) };
      }
      if (!old) return { status: 'not_found' };

      const v = (() => {
        try { return validate(form, extras, (old.action && old.action.forward) || ''); } catch (err) { return { err }; }
      })();
      if (v.err) return { status: 'error', error: toError(v.err) };
      if (!v.ok) return { status: 'invalid', errors: v.errors };

      const next = fmt.formToFilter(form, extras);
      if (fmt.filtersEqual(old, next)) return { status: 'no_change' };

      let created;
      try {
        created = api.createFilter(next);
      } catch (err) {
        return { status: 'error', error: toError(err) };
      }
      try {
        api.deleteFilter(oldId);
      } catch (err) {
        return { status: 'partial', filter: created, oldId, error: toError(err) };
      }
      return { status: 'ok', filter: created };
    };

    /** Deletes a filter and returns the removed copy so the caller can offer Undo (D4). */
    const deleteFilter = (id) => {
      try {
        const old = findFilter(id);
        if (!old) return { status: 'not_found' };
        api.deleteFilter(id);
        return { status: 'ok', deleted: { criteria: old.criteria || {}, action: old.action || {} } };
      } catch (err) {
        return { status: 'error', error: toError(err) };
      }
    };

    /** Re-creates a filter from a copy captured by deleteFilter. */
    const undoDelete = (copy) => {
      try {
        const created = api.createFilter({ criteria: copy.criteria || {}, action: copy.action || {} });
        return { status: 'ok', filter: created };
      } catch (err) {
        return { status: 'error', error: toError(err) };
      }
    };

    /** Completes a partial edit by removing the filter that was meant to be replaced. */
    const retryDeleteOld = (oldId) => {
      try {
        api.deleteFilter(oldId);
        return { status: 'ok' };
      } catch (err) {
        return { status: 'error', error: toError(err) };
      }
    };

    /** Form prefill for "create filter from this message" (F8). */
    const prefillFromMessage = (msg) => {
      const form = fmt.emptyForm();
      form.from = fmt.extractEmail(msg && msg.from);
      form.subject = String((msg && msg.subject) || '').trim();
      return form;
    };

    const render = (filter) => fmt.renderFilter(filter, loadLabels().labelsById);

    return {
      listView, formOptions, getForm, createFilter, editFilter, deleteFilter,
      undoDelete, retryDeleteOld, prefillFromMessage, render,
    };
  };

  return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FilterService;
