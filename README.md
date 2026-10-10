# Gmail UnSucked

A Gmail side-panel add-on that makes filters manageable: a readable, searchable list, plus create, edit, duplicate and delete (with undo) in a form instead of buried Settings screens.

Personal-use Google Apps Script project (not published to the Workspace Marketplace). New to using it? Read the [User Guide](docs/USER_GUIDE.md).

## What it does

| | |
|---|---|
| **List and search** | Filters shown as plain text (`From: boss@x.com -> Label "Work", Skip Inbox`), sorted A-Z, 10 per page, case-insensitive search |
| **Create / edit / duplicate** | One form for criteria and actions; verified forwarding addresses only; inline validation |
| **Delete with Undo** | Confirmation first; Undo on the success card re-creates the filter |
| **From a message** | Open an email, choose "Create filter from this message" to prefill sender and subject |

Scope and acceptance criteria: [docs/PRD.md](docs/PRD.md). Design: [docs/ARCH.md](docs/ARCH.md).

## Requirements

- Node 20+ (tests and typecheck only; the add-on itself is plain Apps Script)
- [clasp](https://github.com/google/clasp) logged in to the Google account that owns the script (`clasp login`)
- This repo's `.clasp.json` points at the owner's script. To run your own copy, create an Apps Script project and replace `scriptId`.

## Everyday commands

Always run project tasks through `bobp make` (see [AGENTS.md](AGENTS.md)); `bobp make help` lists every target.

| Command | What it does |
|---|---|
| `bobp make check` | Lint, typecheck, and the Node test suite. The gate for push and deploy |
| `bobp make test` | Unit, smoke, and contract tests only |
| `bobp make status` | Show which files `clasp` would push |
| `bobp make push` | Run `check`, then `clasp push` |
| `bobp make deploy` | Push, then create a new Apps Script deployment version |
| `bobp make live-test` | Push, then `clasp run selfTest` (needs an API-executable deployment and a GCP project; running `selfTest` from the Apps Script editor needs neither) |
| `bobp make pull` | **Overwrites local files** with the remote script. This repo is the source of truth, so you rarely want it |

## Install and update

1. `bobp make push`. Answer **yes** when `clasp` asks to overwrite the manifest, or the new scopes and the Advanced Gmail service will not be enabled.
2. In the Apps Script editor: **Deploy > Test deployments > Gmail add-on > Install**.
3. Reload Gmail and approve the permissions.
4. If a later change adds an OAuth scope, Google does **not** re-prompt an installed add-on: remove the add-on at <https://myaccount.google.com/permissions>, reinstall the test deployment, and approve again. The symptom of skipping this is a "You do not have permission to call ... Required permissions" error card.

`clasp push` never deletes files in the remote project. If you rename or remove a source file, delete it in the editor too, or the old file keeps running.

## Layout

```
cards.js        CardService UI only: builds cards, parses form input
filters.js      Use cases: list, create, edit, delete, undo, prefill (no CardService)
format.js       Pure functions: render, sort, search, validate, form <-> filter mapping
gmail_api.js    The only file that calls Gmail.*; error normalization; 60 s label/address cache
selfTest.js     Real-runtime test, run from the editor or `clasp run`
appsscript.json Manifest: scopes, Advanced Gmail service, triggers
test/           Node tests (see below)
types/, tsconfig.json   Typecheck against @types/google-apps-script
docs/           PRD, ARCH, QA checklist, user guide
```

The files share one global scope in Apps Script (no imports); each ends with a guarded `module.exports` so Node can load them.

## Testing

Mocks only prove what we believed Google would do, so the suite is layered. Detail and rules are in [docs/ARCH.md](docs/ARCH.md) section 5.

1. **Unit** (`format`, `filters`, `gmail_api`): fast, pure logic with fakes.
2. **Smoke** (`cards.test.js`): the real files in one shared scope with a lenient stub.
3. **Contract** (`contract.test.js`): the real files against a strict `CardService` fake that rejects bad types, unbuilt builders and handlers that return the wrong thing.
4. **Real runtime** (`selfTest.js`): run `selfTest` in the Apps Script editor; it exercises every handler against the real `CardService` and Gmail API, sweeps your real filters read-only, and cleans up its own throwaway filter.
5. **Types**: `tsc --checkJs` with Google's typings.
6. **Manual**: [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md) for what automation cannot reach.

When a live failure teaches you something, reproduce it at the lowest layer that can express it, and seed fakes with real captured error strings, not invented ones.

## Known limits

- The Gmail Filters API has no update, no filter names, no timestamps and no defined order. Edit is "create new, then delete old", so a filter's id changes on every edit. See [ARCH section 8](docs/ARCH.md) for the ordering and metadata analysis.
- Labels and forwarding addresses are cached for 60 s; a label you just created in Gmail can take up to a minute to appear in the dropdown.
- No label creation, bulk cleanup, or import/export yet. See the backlog in [task.md](task.md).

## Project process

Work is coordinated by the BOB persona team under [agents/](agents/); current sprint state and backlog are in [task.md](task.md).
