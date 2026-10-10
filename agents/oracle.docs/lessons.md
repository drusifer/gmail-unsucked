# Project Lessons Learned

This file contains critical lessons and rules derived from past errors, technical discoveries, and architectural decisions. All agents MUST review this file before starting new implementation or architectural tasks.

---

## 2026-10-09 GmailUnSucked Sprint 1
- Apps Script files share one global scope; use `const X = (function(){...})()` namespaces + guarded `module.exports` so files are Node-testable without cross-file requires. Duplicate top-level names break at load time; test/cards.test.js concatenates all files in one vm context to catch that.
- CardService cannot run locally; a Proxy-stub vm harness smoke-tests every handler cheaply.
- Never run `clasp push`/`deploy` without the user: it overwrites the live script.

## 2026-10-10 GmailUnSucked live deployment and test automation
- Adding an OAuth scope to the manifest does not re-prompt an already-installed add-on: remove access (myaccount.google.com/permissions), reinstall the test deployment, re-consent. Symptom: "You do not have permission to call gmail.users.labels.list. Required permissions: ...".
- `clasp push` never deletes remote files, and asks before overwriting the manifest (answer yes). A stale remote `Code.js` kept serving the old UI and the old "Gmail is not defined" error until the new files and manifest were pushed.
- A Proxy stub for CardService accepts anything and hid real problems; the strict fake (test/strict_cardservice.js) rejects bad types, unbuilt builders and wrong widget kinds. Mocks validate assumptions, not reality.
- Fakes must use REAL error strings. Apps Script's wording ("API call to gmail.users.settings.filters.create failed with error: Filter already exists") has no status code; an invented "400: ..." string let a `code === 400` check pass tests and fail live (B2).
- Handlers that swallow exceptions into an error card make "returns a response" assertions pass vacuously; assert the error card was not rendered.
- Real-runtime self-test (`selfTest()`): check `printJson()` shape, use a uniquely named throwaway filter, clean up in `finally`, and sweep real filters read-only.
- Gmail Filters API: no name, timestamps, order or update; see docs/ARCH.md section 8.
- Forwarding filters need only `gmail.settings.basic` (verified live 2026-10-10); the restricted `gmail.settings.sharing` scope is not required.
