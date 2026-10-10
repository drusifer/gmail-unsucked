# ARCH: Gmail UnSucked, Milestone 1 (Filter Editor)

**Owner:** Morpheus · **Status:** v0.1 for Smith Gate 2 · **Inputs:** docs/PRD.md v0.3

## 1. Layering (keeps the web-app door open)

```
 Gmail add-on trigger ──> cards.js  (CardService only: build/handle cards, parse form input)
                              │  plain objects in / out
                              v
                         filters.js (use cases: list, create, edit, delete, undo, prefill)
                              │            │
                              v            v
                         format.js     gmail_api.js (thin wrapper over Advanced Gmail service)
                      (pure: render,    Filters / Labels / ForwardingAddresses
                       sort, search,
                       validate)
```

- **format.js**: pure functions, no Apps Script globals. Rendering text (F1), sort, search (F2), validation (F3), diffing for "No changes" (F4). Unit-testable in Node via a guarded `module.exports`.
- **gmail_api.js**: only file that touches `Gmail.*`. Normalizes errors into `{code, message}`.
- **filters.js**: orchestrates use cases, returns plain data. No CardService. A future `doGet` web app calls this layer unchanged.
- **cards.js**: only file that touches `CardService`. Replaces the card code in `Code.js`.
- Flat files at repo root (clasp `rootDir` is `""`); Apps Script shares one global scope, so no imports; file load order is irrelevant because everything is `const` functions invoked at runtime.

## 2. Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Edit = `create` then `remove` old, never reverse | API has no update; failure after create leaves a duplicate (recoverable) instead of lost filter |
| D2 | Partial failure returns a typed result `{status:'partial', oldId}`; card offers "Delete old one" | PRD F4 AC |
| D3 | If new filter deep-equals old (after normalization) skip API, return `no_change` | Gmail rejects exact duplicates; avoids raw error |
| D4 | Delete returns the full deleted filter; Undo card carries its JSON in an action parameter and re-creates it (new ID) | PRD F5; no server-side state needed (personal use, small payload) |
| D5 | Labels/forwarding addresses fetched per card render, cached in `CacheService.getUserCache()` for 60 s; invalidated on create. **Implemented 2026-10-10 in `gmail_api.js`** (filters never cached; cache errors fall back to the API) | Dropdown data must be fresh enough, avoid slow repeated calls |
| D6 | Filter list fetched in full, sorted/searched/paged client-side in script (page size 10, `page` and `q` action parameters) | API has no server-side query or paging |
| D7 | Forwarding dropdown lists only addresses with `verificationStatus == 'accepted'` | PRD F3 AC, error prevention |
| D8 | Contextual trigger on an open message reads sender/subject via `GmailApp` with the current-message token | PRD F8 |
| D9 | Navigation: every form card has Cancel/Back via `popCard`/`updateCard`; success returns to refreshed list | Smith notes 2, 5 |
| D10 | Standard error card shape: plain-language message + "Try again" + "Back to list"; raw API text only in a collapsed "Details" line | Smith #9 |

## 3. Manifest Changes (appsscript.json)

Current manifest is missing pieces the existing code already needs:
- `dependencies.enabledAdvancedServices`: add Gmail (`Gmail`, `v1`). Existing `Code.js` calls `Gmail.Users...` and will not run without it.
- `addOns.gmail.homepageTrigger` (`runFunction: buildHomepage`) for the list; keep `contextualTriggers` -> `buildContextualCard` for F8 (new function, reads `e.gmail.messageId`).
- OAuth scopes to add: `gmail.labels` (label dropdown), `gmail.addons.current.message.metadata` (F8). Keep `gmail.settings.basic`, `gmail.addons.execute`.
- **Spike RESOLVED (live, 2026-10-10):** creating a filter that forwards to a verified address works with `gmail.settings.basic` alone; `gmail.settings.sharing` is NOT needed and is not in the manifest.
- **Spike (Neo, first task, original wording):** confirm which scope the Filters create-with-forward and `ForwardingAddresses.list` calls require. If `gmail.settings.sharing` is needed, add it (restricted scope, acceptable because personal use only, per PRD decision 4).

## 4. Data Shapes

```js
// Gmail filter (API shape)       // Internal form model (cards <-> filters.js)
{ id, criteria:{from,to,subject,  { from,to,subject,query,negatedQuery,
  query,negatedQuery,               hasAttachment, sizeOp:'larger'|'smaller', sizeMb,
  hasAttachment,size,sizeComparison}, labelId, skipInbox, markRead, star, important,
  action:{addLabelIds,removeLabelIds, neverSpam, trash, forwardTo }
  forward} }
```
`format.js` owns the two-way mapping (`formToFilter`, `filterToForm`), including `skipInbox` <-> `removeLabelIds:['INBOX']`, `markRead` <-> remove `UNREAD`, `star` <-> add `STARRED`, `important` <-> add `IMPORTANT`, `trash` <-> add `TRASH`, `neverSpam` <-> remove `SPAM`.

## 5. Test Strategy (Trin, updated 2026-10-10)

Principle: mocks validate assumptions, not reality. The live Duplicate failure (B1) passed every mocked test, so each layer below covers what the one above it cannot. This is an Apps Script/CardService add-on, not a Chrome extension; extension tooling does not apply.

| Layer | What | Where | Status |
|---|---|---|---|
| 1 Unit | `format.js`, `filters.js` with fake `gmail_api`: rendering, sort, search, validation, mapping round-trip, D1/D2/D3 failure matrix | `test/format.test.js`, `test/filters.test.js` | done |
| 2 Smoke | Real files loaded into one shared scope (as Apps Script does) with a lenient recording stub; also catches duplicate top-level names | `test/cards.test.js` | done |
| 3 Contract | Real files against a **strict CardService fake**: rejects unknown methods, wrong argument types, unbuilt builders, wrong widget kinds, empty sections, non-string action parameters. Asserts every `on*` handler returns a built ActionResponse, never falls into the error card, and every button names an existing handler. Run over a spread of filter shapes. | `test/strict_cardservice.js`, `test/contract.test.js` | done |
| 4 Real runtime | In-script `selfTest()` calling each handler with synthetic events against the real CardService and Gmail API; checks real `printJson()` shape (ActionResponse vs Card), API scopes, no error-card fallthrough; throwaway filter `zz-unsucked-test-<ts>@example.invalid`, always cleaned up in `finally`; throws on any failure. Run from the editor, or `bobp make live-test` (`clasp run selfTest`; needs an API-executable deployment and standard GCP project). Its own logic is unit-tested in Node | `selfTest.js`, `test/selftest.test.js` | done (not yet run live) |
| 5 Static | `@types/google-apps-script` with `tsc --checkJs` via `bobp make typecheck`, part of `make check`. Cross-file globals are declared `any` in `types/globals.d.ts` (files look like CommonJS to tsc); it checks calls into the Apps Script API, e.g. wrong `addItem` argument types | `tsconfig.json`, `types/` | done |
| 6 Manual | Items automation cannot reach: F8 on a real open message, visual layout | `docs/QA_CHECKLIST.md` | ongoing |

Rules:
- Add a strict-fake rule only when the platform is known (or a live failure proves it) to enforce it. The empty-section rule is currently an assumption.
- Every live failure gets a reproducing test at the lowest layer that can express it, or a layer-4 case if mocks cannot.
- `selfTest()` must never leave data behind and must never touch filters it did not create.
- Pyramid shape: most tests at layers 1-2 (fast, many), fewer contract tests (3), a single real-runtime run (4) per push; manual (6) only for what nothing else reaches.
- Gate: `bobp make check` (lint + typecheck + layers 1-3) must pass before `push` and `deploy`.

Evaluated and not adopted:
- **gas-mock / gas-local**: redundant with the strict fake, and generic mocks are lenient.
- **Playwright against the Gmail UI**: Google login bot detection, add-on iframe, DOM churn. Revisit only for one or two smoke tests; needs saved `storageState`.
- **Chrome-extension harness** (Vitest, jest-chrome, `--load-extension`): not applicable.
- **CI**: Tank may add a workflow (clasp push + `clasp run selfTest`) once a test Google account exists; not before.

## 6. Risks
- Scope requirements for forwarding (spike above).
- Card form size on narrow panel: group criteria and actions into two sections; collapsible "More options".
- Label picker: no label creation in M1 (PRD non-goal); empty-labels state must say how to create one in Gmail.

## 7. Task Breakdown (for Mouse)
1. Spike: scopes + enable Advanced Gmail service; verify list works live.
2. `format.js` + unit tests (render, sort, search, validate, mapping).
3. `gmail_api.js` + `filters.js` (list, create, edit w/ D1-D3, delete/undo) + tests with fake API.
4. `cards.js`: list (F1/F2 paging+search), delete+undo (F5).
5. `cards.js`: create/edit form (F3/F4), duplicate (F6).
6. Contextual trigger prefill (F8).
7. Makefile targets, README for clasp workflow.

## 8. Filter List Ordering and Metadata (Morpheus/Cypher, 2026-10-10, proposal; not built)

### Facts (Google docs, checked 2026-10-10)
- Sources: Gmail API `users.settings.filters` resource and `list` method; Apps Script PropertiesService and quotas pages.
- Filter = `id` + `criteria` (from, to, subject, query, negatedQuery, hasAttachment, excludeChats, size, sizeComparison) + `action` (addLabelIds, removeLabelIds, forward).
- No name, timestamps, position or order field. Methods: create, delete, get, list. No update/patch.
- `list` has no sort or paging parameters; the docs do not specify return order or application order or conflict handling. Order is *undocumented*, not proven irrelevant.
- `PropertiesService.getUserProperties()` is per-user within the script. Limits: 9 KB per value, 500 KB per store.

### Consequences
- Name, created/modified date and any custom order cannot come from Gmail. They must be metadata we keep.
- A filter's id changes on every edit (D1), so metadata must be re-keyed to the new id as part of the edit.
- Filters created or edited outside the add-on have no metadata, and an external edit changes the id so the old entry becomes an orphan.

### Options
| # | Option | Storage | Cost | Verdict |
|---|---|---|---|---|
| 1 | Sort modes: A-Z (current), by label, risky actions first (forward/trash/skip inbox) | none | small, pure `format.js` + sort control in `cards.js` | **do first** |
| 2 | User-given name + "added/changed via this add-on" date | UserProperties map `filterId -> {name, createdAt, modifiedAt}` (~100 B/entry, thousands fit) | medium: re-key on edit (D1), prune orphans on list, name field on form, "unnamed/unknown" display | **do next** |
| 3 | Manual order (move up/down) | same map, `rank` | high; clumsy in CardService; Google does not define order so it would be purely organizational | **skip**; a "group" tag in the option-2 map is more useful |

### Design notes for option 2 (when picked up)
- New pure module `meta.js` (reconcile, rekey, prune) behind an injected store, so it is Node-testable; the Properties access lives in a thin wrapper like `gmail_api.js`.
- Reconcile on every list load: drop entries whose id is gone; for ids with no entry show "unnamed". Optionally re-match an orphan to a new id when criteria and action are identical.
- D1 edit order becomes: create new, move metadata new<-old (set modifiedAt), delete old. Failure after create must not lose metadata (same recoverability rule as D1/D2).
- Never store anything sensitive in metadata beyond the user's chosen name.
- Spike (optional, ~10 lines): have `selfTest` dump raw filter JSON keys to confirm no undocumented fields.

## 9. Sprint 3 amendments (2026-10-10)
- **D5 extended (E9):** the filter list is now cached too, chunked across `CacheService` keys (value limit 100 KB; count written last, removed first), 60 s TTL, invalidated by every create and delete made through the add-on. Only edits made outside the add-on can be stale, for up to 60 s.
- **List layout (E4, E10-E12):** one Card, one section, one `DecoratedText` per filter (tap opens the detail card; single end button is an Edit icon). Growing list: batch 10, cap 90 filters (platform limit 100 widgets per section). See docs/SPRINT3_UX.md.
- **Search:** Enter or a small icon button; on-change action behind `SEARCH_ON_COMMIT`. No timer or per-keystroke filtering (decided).
- **Not built:** the overflow menu (developer preview for add-ons; `selfTest` reports whether the method exists).

