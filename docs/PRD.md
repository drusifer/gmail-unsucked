# PRD: Gmail UnSucked

**Owner:** Cypher (PM) · **Status:** v0.3, Smith Gate 1 notes folded in · **Date:** 2026-10-09

## Vision
Gmail is powerful but frustrating in places. Gmail UnSucked is a Google Apps Script
Gmail add-on (synced via clasp) that fixes those pain points one feature at a time.

## Current State
Gmail add-on with one card, "Filter Manager" (`Code.js`): lists filters as raw
criteria/action text and offers Delete. Scope: `gmail.settings.basic`.
Filters read via the Advanced Gmail service `Gmail.Users.Settings.Filters`.

## Platform Constraints (shape requirements)
- UI is CardService cards in the Gmail side panel: no free-form HTML, limited widgets, narrow width.
- The Gmail filters API supports list/get/create/delete only. **No update.**
  "Edit" = create new + delete old, which must be safe (create first, delete only on success).
- Filter actions reference label IDs, not names; criteria are limited to the fields the API exposes.
- A Filter resource is only `id`, `criteria`, `action` (verified against Google's docs 2026-10-10). It has **no name, no created/modified timestamp, and no position/order field**, and `list` has no sort or paging parameters. The docs say nothing about the order filters are returned or applied. Ids are server-assigned and change on every edit (create-then-delete). Any name, date or custom ordering must be our own metadata (see ARCH section 8).

## Milestone 1: A Halfway Decent Filter Editor
**Problem:** Gmail's built-in filter UI is buried in Settings, hard to scan, can't be searched,
and is awkward to edit (re-creating from scratch).

### User Stories
| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| F1 | As a user I can see my filters in a readable list | Each filter renders as plain text, e.g. `From: boss@x.com -> Label "Work", Skip Inbox, Forward to a@b.com`; label names, never IDs; no raw JSON. Stable sort (by first criterion value, A-Z). Paged with "Show more" for long lists |
| F2 | As a user I can search the list | Case-insensitive match against the rendered text; "No filters match 'x'" state with a Clear action |
| F3 | As a user I can create a filter via a form | Criteria: from, to, subject, has words, doesn't have, has attachment, size (larger/smaller + unit). Actions: apply label (dropdown of existing labels), skip inbox, mark read, star, mark important, never spam, delete, forward (dropdown of verified addresses only, with hint why others are absent). Save requires at least one criterion and one action; inline validation errors; Cancel and Back on every form card |
| F4 | As a user I can edit an existing filter | Form pre-populated. Save creates new filter first, then deletes old. If delete fails, user is told a duplicate exists and offered "Delete old one" retry. If nothing changed: "No changes to save" |
| F5 | As a user I can delete a filter | Confirmation step; success card offers Undo (re-creates the filter from a captured copy); list refreshes |
| F6 | As a user I can duplicate a filter | Opens create form pre-filled from the source |
| F8 | As a user reading an email I can create a filter from it | Add-on shows "Create filter from this message" on an open message; create form pre-filled with sender and subject |

**Cross-cutting AC (all stories):** loading, empty and error states defined per card; a success confirmation after create/edit/delete that returns to the list; no state conveyed by color alone.

### Priorities
P0: F1, F3 (incl. forwarding), F4, F5 · P1: F2, F6, F8 · Backlog (out of M1): F7

### Non-Goals (M1)
Retroactively applying filters to existing mail; managing labels; bulk cleanup, import/export; non-filter Gmail features.

## Future Milestones (unprioritized)
Ideas to be added by the user as Gmail annoyances are identified.

Backlog candidates (see task.md BACKLOG for detail):
- **List sort modes** (A-Z, by label, risky actions first).
- **Filter names and added/changed dates** via our own metadata (Gmail has none; ARCH section 8).
- Bulk cleanup / duplicate detection, export/import (F7), label creation, caching.

## Decisions (resolved 2026-10-09)
1. **Surface:** Gmail side-panel add-on for M1. Keep business logic separate from CardService rendering so a web-app front end (`doGet`) can be added later.
2. **Forwarding:** In scope for M1 (table stakes). Editor must handle verified/unverified forwarding addresses and show a clear error for unverified ones.
3. **Bulk work:** Out of M1. F7 (export/import) and duplicate cleanup move to the backlog.
4. **Distribution:** Personal use only. No OAuth verification work needed.
