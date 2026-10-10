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
