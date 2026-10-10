/**
 * Thin wrapper over the Advanced Gmail service. The only file that touches `Gmail.*`.
 * Failures are rethrown as { code, message } objects (see normalizeError).
 *
 * D5: labels and forwarding addresses change rarely, so they are cached per user for
 * CACHE_TTL_SECONDS in CacheService. Filters are never cached. Creating a filter
 * invalidates both lists. Cache problems never break a read: on any cache error we
 * fall back to calling the API.
 */
const GmailApi = (function () {
  const CACHE_TTL_SECONDS = 60;
  const KEY_LABELS = 'gu:v1:labels';
  const KEY_FORWARDING = 'gu:v1:forwarding';

  const normalizeError = (err) => {
    const message = (err && err.message) ? String(err.message) : String(err);
    const m = message.match(/\b(400|401|403|404|409|429|5\d\d)\b/);
    return { code: m ? Number(m[1]) : 0, message };
  };

  const call = (fn) => {
    try {
      return fn();
    } catch (err) {
      throw normalizeError(err);
    }
  };

  /** getGmail/getCache are thunks so the Apps Script globals are resolved at call time. */
  const build = (getGmail, getCache) => {
    const cache = () => { try { return getCache() || null; } catch (err) { return null; } };

    const cached = (key, fetch) => {
      const c = cache();
      if (c) {
        try {
          const hit = c.get(key);
          if (hit !== null && hit !== undefined) return JSON.parse(hit);
        } catch (err) { /* corrupt or unavailable: fall through to the API */ }
      }
      const fresh = fetch();
      if (c) {
        try { c.put(key, JSON.stringify(fresh), CACHE_TTL_SECONDS); } catch (err) { /* too big or unavailable: skip */ }
      }
      return fresh;
    };

    const invalidate = () => {
      const c = cache();
      if (!c) return;
      [KEY_LABELS, KEY_FORWARDING].forEach((k) => { try { c.remove(k); } catch (err) { /* ignore */ } });
    };

    const gmail = () => getGmail();

    return {
      normalizeError,
      listFilters: () => call(() => gmail().Users.Settings.Filters.list('me').filter || []),
      createFilter: (resource) => {
        const created = call(() => gmail().Users.Settings.Filters.create(resource, 'me'));
        invalidate();
        return created;
      },
      deleteFilter: (id) => call(() => gmail().Users.Settings.Filters.remove('me', id)),
      listLabels: () => cached(KEY_LABELS, () => call(() => gmail().Users.Labels.list('me').labels || [])),
      listForwardingAddresses: () => cached(KEY_FORWARDING, () =>
        call(() => gmail().Users.Settings.ForwardingAddresses.list('me').forwardingAddresses || [])),
    };
  };

  const api = build(
    () => Gmail,
    () => (typeof CacheService !== 'undefined' ? CacheService.getUserCache() : null),
  );
  /** Test seam: GmailApi.create(fakeGmail, fakeCacheOrNull). */
  api.create = (gmail, cache) => build(() => gmail, () => cache);
  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GmailApi;
