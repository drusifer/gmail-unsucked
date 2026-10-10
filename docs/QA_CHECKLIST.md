# Manual QA Checklist: Sprint 1 (live Gmail)

Prereqs: `clasp login`, `bobp make push` (pushes to the live script), then Gmail > Add-ons panel > "Gmail Unsucked", authorize scopes. Use a test account or be ready to Undo.

## Scope / platform spike (T1, unverified)
- [ ] Add-on authorizes with the 4 scopes in appsscript.json and the list card loads.
- [ ] Create a filter with Forward to a verified address. If Gmail returns 403, add `https://www.googleapis.com/auth/gmail.settings.sharing` to appsscript.json, push, re-authorize.
- [ ] Unverified address is not selectable in the dropdown.

## Stories
- [ ] F1: filters render like `From: x -> Label "Work", Skip Inbox`; no IDs or JSON; sorted A-Z; 10 per page with "Show more (11-20)" and "Previous".
- [ ] F2: search "work" matches by label name; "Clear search" works; no-match message shown.
- [ ] F3: create with each criterion and action; empty form shows both errors inline; bad size shows size error; Cancel returns to the list unchanged.
- [ ] F4: edit changes a criterion; old filter gone, new present. Save with no change shows "No changes to save." Edit a filter that has a Category action or multiple labels: after save those parts are still present (check Settings > Filters).
- [ ] F5: Delete asks for confirmation; success card has Undo; Undo restores; leaving the card removes Undo.
- [ ] F6: Duplicate opens a pre-filled form; saving unchanged shows the "already exists" message, not a raw error.
- [x] F8 (live-verified 2026-10-10): open a message; card shows From/Subject and "Create filter from this message"; form is pre-filled with sender and subject.

## Cross-cutting
- [x] C2 (live-verified 2026-10-10): search "x", go to page 2, edit then save: list returns to the same search and page.
- [ ] Empty account (no filters) shows the empty state; no labels shows the "create a label in Gmail" hint.
- [ ] Nothing relies on color alone (errors begin with the word "Error:").

## Sprint 3: UX (all live checks verified 2026-10-10)
- [x] U1/U2: each filter is one row; label dots show Gmail's color (compare with Gmail), gray dot for uncolored; label name always present.
- [x] U3: a filter with a very long subject shows it cut with "..." on the row and in full on the detail card.
- [x] U4: tapping a row opens the detail card with Edit / Duplicate / Delete; Back returns to the same search and place (C2).
- [x] U5: New filter shows "More conditions" collapsed; Edit on a filter with Has words/size shows it open; chosen label shows its dot; Edit says what is being edited.
- [x] U6: with more than 10 filters, "Show more" adds 10 below and keeps earlier rows; Enter in the search box runs the search; the search icon works; the ✕ clears it.
- [x] U7: row Edit icon and search icons are legible (light AND dark mode) and have a usable tap target.
- [x] Run `selfTest`; read the INFO lines (label colors count, newImageButton, newOverflowMenu) and tell Cypher.

