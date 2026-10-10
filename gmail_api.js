/**
 * Thin wrapper over the Advanced Gmail service. The only file that touches `Gmail.*`.
 * Failures are rethrown as { code, message } objects (see normalizeError).
 *
 * D5: labels and forwarding addresses change rarely, so they are cached per user for
 * CACHE_TTL_SECONDS in CacheService. Filters are cached too (chunked, see KEY_FILTERS); every write
 * we make (create, delete) invalidates the lists, so only edits made outside this add-on can be stale. Cache problems never break a read: on any cache error we
 * fall back to calling the API.
 */
const GmailApi = (function () {
  const CACHE_TTL_SECONDS = 60;
  const KEY_LABELS = 'gu:v1:labels';
  const KEY_FORWARDING = 'gu:v1:forwarding';
  // Filters are cached too (docs/SPRINT3_UX.md E9) so search and re-render do not refetch. A single cache
  // value is limited to 100 KB, so the JSON is split into chunks; the count is written last and removed
  // first, so a partial write or a partial invalidation always reads as a miss.
  const KEY_FILTERS = 'gu:v1:filters';
  const CHUNK_CHARS = 30000;

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

    const cachedChunked = (key, fetch) => {
      const c = cache();
      if (c) {
        try {
          const n = Number(c.get(`${key}:n`));
          if (n > 0) {
            const parts = [];
            for (let i = 0; i < n; i += 1) {
              const part = c.get(`${key}:${i}`);
              if (part === null || part === undefined) { parts.length = 0; break; }
              parts.push(part);
            }
            if (parts.length === n) return JSON.parse(parts.join(''));
          }
        } catch (err) { /* fall through to the API */ }
      }
      const fresh = fetch();
      if (c) {
        try {
          const json = JSON.stringify(fresh);
          const count = Math.max(1, Math.ceil(json.length / CHUNK_CHARS));
          for (let i = 0; i < count; i += 1) c.put(`${key}:${i}`, json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS), CACHE_TTL_SECONDS);
          c.put(`${key}:n`, String(count), CACHE_TTL_SECONDS);
        } catch (err) { /* unavailable: skip */ }
      }
      return fresh;
    };

    const invalidate = (keys) => {
      const c = cache();
      if (!c) return;
      keys.forEach((k) => { try { c.remove(k); } catch (err) { /* ignore */ } });
    };

    const FILTER_KEYS = [`${KEY_FILTERS}:n`];
    const ALL_KEYS = [KEY_LABELS, KEY_FORWARDING].concat(FILTER_KEYS);

    const gmail = () => getGmail();

    return {
      normalizeError,
      listFilters: () => cachedChunked(KEY_FILTERS, () => call(() => gmail().Users.Settings.Filters.list('me').filter || [])),
      createFilter: (resource) => {
        const created = call(() => gmail().Users.Settings.Filters.create(resource, 'me'));
        invalidate(ALL_KEYS);
        return created;
      },
      deleteFilter: (id) => {
        call(() => gmail().Users.Settings.Filters.remove('me', id));
        invalidate(FILTER_KEYS); // labels and addresses are unaffected by deleting a filter
      },
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
