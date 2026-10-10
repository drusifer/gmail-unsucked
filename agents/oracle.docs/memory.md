# Project Memory

This file serves as a consolidated index of project-wide decisions, historical context, and key milestones. It is maintained by the Oracle and reviewed by all agents to ensure consistency.

## Project Context
- **Project Name:** GmailUnSucked (Apps Script Gmail add-on, clasp)
- **Start Date:** 2026-10-09
- **Key Objectives:** Make Gmail suck less; M1 = filter editor (docs/PRD.md)

## Major Decisions
| Date | Decision | Rationale | Consequences |
|------|----------|-----------|--------------|
| 2026-10-09 | Edit filter = create new then delete old (Filters API has no update) | Never lose a filter; failure leaves a recoverable duplicate | Partial-failure result + "Delete old filter" retry |
| 2026-10-09 | Layers: format.js (pure) / gmail_api.js / filters.js (DI) / cards.js | Web-app front end can reuse filters.js; logic testable in Node | CardService only in cards.js, Gmail.* only in gmail_api.js |
| 2026-10-09 | Edits round-trip unrepresentable filter fields via "extras" (Smith C1) | No silent data loss | Tested in format/filters tests |
| 2026-10-09 | M1 scope: side panel, forwarding IN, bulk/import/export OUT, personal use only | User decision | F7 in backlog |

| 2026-10-10 | Filter list ordering: Gmail exposes no name, timestamps or order; custom name/dates only via our own UserProperties metadata; manual ordering skipped | Verified against Google docs; order undocumented so not worth faking | Proposal in docs/ARCH.md section 8; sort modes first, metadata second |

## Repository Structure Memory
- `agents/`: Contains persona-specific documentation and state.
- `docs/`: Global documentation (PRD, Architecture, etc.).
- `task.md`: Single source of truth for the current sprint (maintained by Mouse).
