# Agent State

## Context
- Sprint 2 (test automation) CLOSED 2026-10-10; archived as SPRINT_2 in agents/chat_archive. Sprint 1 closed earlier.
- 52 tests + tsc green (`bobp make check`). Layers: unit, smoke, strict-fake contract, selfTest (real runtime), types, manual.
- Live-verified 2026-10-10: B2 fix, selfTest real-filter sweep. C2, F8, forwarding scope live-verified. D5 + real-filter sweep live-verified (selfTest 51/51).
- Backlog BL-1..BL-7 in task.md (sort modes, names/dates metadata, caching, label create, bulk cleanup, clasp run/CI). User asked to document, not implement, ordering.

- Trin test notes: strict fake rules live in test/strict_cardservice.js (empty-section rule is an assumption; add rules only when proven). Seed fakes with REAL captured error strings (B2 lesson). selfTest asserts via printJson() shape; its own logic is tested in test/selftest.test.js. Test strategy detail: docs/ARCH.md section 5.

## Current Task
None. Awaiting next sprint planning.

## Next Steps
1. User: `bobp make push`, run selfTest, retry duplicate-save; report failures.
2. Next sprint: Cypher *pm plan sprint, starting from BL-1/BL-2 if the user wants.

## Sprint 3 (UX enhancements) CLOSED 2026-10-10
- Archived as SPRINT_3. 75 tests + tsc green. Built U1-U7; NOT pushed or committed.
- User to do: push, run selfTest (read INFO lines), walk docs/QA_CHECKLIST.md "Sprint 3: UX". Flag: SEARCH_ON_COMMIT in cards.js.
- Backlog: BL-1 sort, BL-2 names/dates, BL-5 label create, BL-6 bulk cleanup/F7, BL-7 clasp run + CI.
