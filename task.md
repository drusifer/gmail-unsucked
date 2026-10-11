# task.md: Sprint 1, Filter Editor (M1)

Sources: docs/PRD.md v0.3, docs/ARCH.md v0.1, Smith Gate 2 conditions (agents/smith.docs/ArchReview_M1_2026-10-09T12:30.md)
Owner: Mouse · Tier 2 sprint (fast-track). Gates: Gate 1 approved, Gate 2 approved with conditions C1-C3.

Status key: [ ] todo · [~] in progress · [x] done

## Phase 1: Foundation
- [x] **T1 (Neo)** Spike: enable Advanced Gmail service in appsscript.json, add homepageTrigger, scopes `gmail.labels` and `gmail.addons.current.message.metadata`; determine whether forwarding needs `gmail.settings.sharing`; `clasp push` and confirm current list card loads. Record findings in agents/neo.docs.
- [x] **T2 (Neo)** Makefile targets `test` (node --test), `push` (clasp push), `lint`; document in README. Run via `bobp make`.

## Phase 2: Core logic (testable in Node)
- [x] **T3 (Neo)** format.js: render (PRD F1 examples), sort, search (F2), validate (F3), formToFilter/filterToForm mapping. Unit tests.
- [x] **T4 (Neo)** **C1:** mapping preserves fields the form cannot represent (multiple addLabelIds, extra removeLabelIds, excludeChats, unknown); test that an edit keeps them.
- [x] **T5 (Neo)** gmail_api.js wrapper (errors -> `{code,message}`) and filters.js use cases: list, create, edit (D1 create-then-delete, D2 partial result, D3 no_change), delete returning deleted filter, undo. Tests with fake API covering the failure matrix.
- [x] **T6 (Trin)** Review T3-T5 tests for coverage of AC and C1; add missing cases.

## Phase 3: Cards (manual verify in Gmail)
- [x] **T7 (Neo)** cards.js list: render, search box, paging (10/page), empty/loading/error states (F1, F2). **C2:** carry `q` and `page` through every navigation.
- [x] **T8 (Neo)** delete with confirmation and success card with Undo (F5). **C3:** Undo only on that success card.
- [x] **T9 (Neo)** create/edit form: criteria + actions sections, label dropdown, verified-forwarding dropdown with hint, inline validation, Cancel/Back (F3, F4), duplicate (F6). "Delete it" wording for trash.
- [x] **T10 (Neo)** Contextual trigger `buildContextualCard`: "Create filter from this message" with sender/subject prefill (F8).
- [x] **T11 (Neo)** Remove old card code from Code.js; ensure no CardService outside cards.js and no `Gmail.*` outside gmail_api.js.

## Phase 4: Verification and close
- [x] **T12 (Morpheus)** Architecture review: layering rules (T11), D1-D10 honored.
- [x] **T13 (Trin)** QA: run unit suite via `bobp make test`, manual checklist against PRD AC on a live deployment.
- [x] **T14 (Smith)** `*user test` on live add-on against AC and C1-C3.
- [x] **T15 (Cypher)** Acceptance sign-off; Oracle records decisions and lessons.

## Ordering and handoffs
T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9 -> T10 -> T11 -> T12 -> T13 -> T14 -> T15
Anti-loop: more than 2 fix cycles on any task pauses and asks the user.

## Status notes (Mouse, end of build)
- T1 [~]: manifest/scopes/Advanced Gmail service done in code; live scope check (forwarding) NOT verified, needs user's `clasp login` + push.
- T13 [~]: 41 automated tests pass (`bobp make test`); manual live checklist is docs/QA_CHECKLIST.md.
- T14, T15 blocked on live deployment by the user. Nothing has been pushed to the Apps Script project.
- Known deviation: D5 (CacheService caching of labels/addresses) not implemented; extra API calls per render. Backlog.

## Sprint close (2026-10-10)
- Live-verified by user: add-on deployed, Advanced Gmail service enabled, `gmail.labels` scope consented, filter list and labels load.
- NOT individually live-verified (closed on user direction, carried to backlog as verification debt): forwarding scope (`gmail.settings.sharing` may be needed), C2 search/page persistence, C3 Undo only on success card, F3-F6 and F8 flows. Checklist: docs/QA_CHECKLIST.md.
- Deployment lessons: new scopes require re-consent (remove access + reinstall test deployment); `clasp push` does not delete remote Code.js; answer yes to manifest overwrite.
- Sprint 1 CLOSED.

## Sprint 2 (Tier 2, test automation) - CLOSED 2026-10-10
- [x] **T16 (Neo)** Strict CardService fake (test/strict_cardservice.js) + handler contract tests (test/contract.test.js). Found and fixed: empty top section on form cards (cards.js).
- [x] **T17 (Neo)** In-script `selfTest()` using the real runtime (throwaway filter, always cleaned up); optional `clasp run` target.
- [x] **T18 (Neo)** `@types/google-apps-script` + `tsc --noEmit --checkJs` in lint.
- [x] **B1 (Neo)** Duplicate fails live with "value returned has a type that cannot be used by the add-ons platform". NOT reproduced by contract tests; needs Executions stack trace + which step (tap Duplicate vs save).
- Live-verified since close: Undo (F5/C3).
- T17/T18 done: selfTest.js + test/selftest.test.js, typecheck target, Makefile live-test. 50 tests green. NEXT (user): push, run `selfTest` in the editor (Run), paste Logger output; it should reproduce or clear B1.
- **B2 (fixed)** Saving an unchanged duplicate showed the generic error. Cause: friendlyError_ required code 400, but Apps Script's real message ("API call to ... failed with error: Filter already exists") has no status code. Fix: match /already exists/. Regression: test/contract.test.js F6 test (verified to fail on the old condition); selfTest now asserts the friendly message live.
- Lesson: fakes must use REAL captured error strings, not invented ones. B1 (Duplicate open) worked on retry after the empty-section fix; treat as resolved pending the selfTest real-filter sweep.

## Backlog (features, unprioritized)
- **BL-1 List sort modes** (ARCH section 8, option 1): A-Z (current), by label, risky first (forward > delete > skip inbox). No storage; pure `format.js` sort plus a sort control in `cards.js` that carries through navigation like `q`/`page` (C2).
- **BL-2 Filter names + added/changed date** (ARCH section 8, option 2): per-user metadata in UserProperties keyed by filter id, re-keyed on edit (D1), orphans pruned on list load; "unnamed" for filters made outside the add-on. Depends on nothing; larger than BL-1.
- **BL-3 Manual ordering**: decided against (Gmail does not define filter order); revisit only as a "group" tag inside BL-2 metadata.
- **BL-4 (done 2026-10-10)** D5 caching of labels/forwarding addresses: 60 s per-user CacheService at gmail_api.js, invalidated on create, failures fall back to API. Needs live re-run of selfTest.
- **BL-5** Label creation from the form.
- **BL-6** Bulk cleanup / duplicate filter detection; F7 export/import.
- **BL-7** `clasp run` automation of selfTest + CI via Tank. **Attempted 2026-10-10:** `clasp run selfTest` fails `NOT_FOUND` (no API-executable deployment); `make live-test` already wired. Prep when picked up:
  1. User: link a standard GCP project to the script (Project Settings > Change project); enable the Apps Script API there and at script.google.com/home/usersettings.
  2. User: create an OAuth client (Desktop app), download `creds.json` (gitignore it), `clasp login --creds creds.json` with the manifest scopes.
  3. Neo: add `"executionApi": {"access": "MYSELF"}` to appsscript.json, `clasp deploy`, then `bobp make live-test` should print PASS/FAIL/INFO.
  4. Tank: CI workflow (needs a test Google account; see ARCH section 5). Note: adds an owner-only remote-execution path; opt in consciously.
  Until then: run `selfTest` from the Apps Script editor (last run 62/62 passed, 2026-10-10 after Sprint 3 push; 3 of 26 user labels carry a color).

## Sprint 2 close (2026-10-10)
- Delivered: strict CardService fake + contract tests (T16), selfTest.js real-runtime test (T17), typecheck lint (T18), make live-test, ARCH s5/s8 docs, B2 fix. 52 tests + tsc green.
- Live-verified: selfTest 23/23, Duplicate opens, Undo. NOT yet re-verified live: B2 fix (friendly "already exists" on duplicate save) and the real-filter sweep.
- Carried debt: C2 search/page persistence, F8 on real message, forwarding scope, D5 caching, lenient Proxy stub in cards.test.js.
- **Live re-verify (2026-10-10, user):** selfTest passed after re-push, including the real-filter sweep and the F6 "already exists" check; duplicate-save now shows the friendly message. B2 live-verified, B1 closed. Remaining carried debt: C2, F8 on a real message, forwarding scope, D5 caching.
- **F8 live-verified (2026-10-10, user).** Remaining carried debt: C2, forwarding scope, D5 caching.
- **Forwarding scope live-verified (2026-10-10, user):** forward-to-verified-address works with `gmail.settings.basic`; `gmail.settings.sharing` not needed. T1 spike closed. Remaining carried debt: C2, D5 caching.
- **C2 live-verified (2026-10-10, user):** search and page persist through edit/duplicate/delete/undo/cancel. All M1 acceptance items now live-verified except D5 cache live run (selfTest re-run pending).
- **D5 + sweep live-verified (2026-10-10, user):** selfTest 51/51 PASS against 9 real filters (Edit/Duplicate/ConfirmDelete each), D5 cache check, F6 message, create/delete/undo, cleanup. M1 fully live-verified; no carried test debt.

## Sprint 3: UX polish, filter cards + editor (Tier 2) - PLANNED, user answered all section 6 questions (2026-10-10); ready for Phase 1
Source: docs/SPRINT3_UX.md. Stories U1-U5. Phases are 1-3 tasks each.

### Phase 1: Spike and test groundwork
- [x] **T19 (Neo)** Spike: `selfTest` read-only probe prints whether user labels from `labels.list` carry `color` (textColor/backgroundColor) and which fields; user runs it live. Decides E6.
- [x] **T19b (Neo)** Spike: build one card with `OverflowMenu`/`OverflowMenuItem` (Edit/Duplicate/Delete) behind a throwaway handler; user checks live whether it renders and works in a normal install. Result decides E1: menu, or icon-only ImageButtons (setIconUrl + altText) instead of word buttons. In the same spike render the three icon buttons and check live that the gstatic PNGs show and are legible in dark mode.
- [x] **T19c (Neo)** Spike: search `TextInput.setOnChangeAction` on a throwaway card; user checks live when it fires (keystroke / blur / Enter) and how responsive it feels. Decides E8. Contingency (only if it fires per keystroke AND feels laggy): server-side debounce via a CacheService request counter + short sleep; no client timer exists in Card Service. Do not build speculatively.
- [x] **T19d (Neo)** Filter-list cache design: chunked `CacheService` store of the full filter list (< 100 KB per key), TTL, invalidate on every write; unit tests for chunking/invalidation/corrupt chunk fallback. Amends D5.
- [x] **T20 (Neo)** Extend strict CardService fake: `setCollapsible`, `setNumUncollapsibleWidgets`, `setTopLabel`, `setStartIcon`; contract test that every section is non-empty and `numUncollapsibleWidgets <= widgets`.

### Phase 2: Filter cards (U1-U4)
- [x] **T21 (Neo)** `format.js` `cardModel` (truncate 40, label dots data, conditions, actions) + unit tests (boundaries, no color, system labels, unknown id, extras). Tests first.
- [x] **T22 (Neo)** `filters.js` listView exposes `model` per item with label colors from cached labels; `cards.js` `listCard_` renders ONE section with one DecoratedText per filter (E10), tap opens a detail card (E11) with Edit/Duplicate/Delete, end button = Edit icon or \u22ee menu (E12); growing list, cap 90 (E4). Keep C2 context on every button.
- [x] **T23 (Trin)** UAT: contract + unit coverage vs U1-U4; C2 regression test on new buttons.

### Phase 3: Editor polish (U5)
- [x] **T24 (Neo)** `formCard_`: collapsible "More conditions" (open when any of those fields set), selected-label color dot preview, header names what is edited. No behavior change to validation/save.
- [x] **T25 (Trin)** UAT for U5 + extend selfTest to assert collapsible sections on real filters; update docs/QA_CHECKLIST.md with UX checks.

### Phase 4: Verify and close
- [~] **T26 (Smith)** `*user test` live: contrast, density, dark mode, expander, C2 regression (needs user push + selfTest + walk).
- [x] **T27 (Oracle/Cypher)** Update README/USER_GUIDE screenshots/wording, record decisions E1-E7, retro, launch.

## Sprint 3 final close (2026-10-11)
- List item redesigned live with the user: start-icon DecoratedText lines (own icon column), tag line, forward line, action emoji line, [View details] [Edit] buttons. Columns/Grid/chips tried and rejected (see docs/SPRINT3_UX.md section 8).
- Contrast measured on real PNGs; icons moved to grey600. 78 tests + typecheck green; selfTest 62/62 live; all UX checks verified by the user. Committed and pushed.

## Sprint 3 close (2026-10-10)
- Built and automated-verified: U1-U7 (one-widget rows, label dots, truncation, detail card, editor polish, growing list cap 90, Enter/small-icon search), chunked filter cache (E9), strict-fake support, selfTest probes + `onOpenFilter` sweep. 75 tests + tsc green.
- T19/T19b/T19c were written as selfTest INFO probes and checklist items rather than as live runs: nothing was pushed (standing rule: never push without the user).
- **For the user, when back:** (1) `bobp make push` (yes to manifest), (2) run `selfTest` and read INFO lines: label colors present? newOverflowMenu exists?, (3) walk "Sprint 3: UX" in docs/QA_CHECKLIST.md, esp. dark-mode icon legibility and Enter-to-search. If Enter fires per keystroke and feels laggy, set `SEARCH_ON_COMMIT = false` in cards.js (button only).
- Not built: overflow menu (preview-only); label-color fallback is a gray dot if `labels.list` returns no color.
- Uncommitted in the working tree; nothing pushed to Apps Script or GitHub.
