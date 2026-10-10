// The add-on files are plain Apps Script (one shared global scope). `module` exists only for
// the Node test harness guard `if (typeof module !== 'undefined') module.exports = ...`.
declare var module: { exports: any } | undefined;

// Cross-file globals. The files are CommonJS-shaped to TypeScript (because of the guard above),
// so their top-level consts do not merge. Declared loosely: this check targets calls into the
// Apps Script API (CardService, Gmail, Logger), not our own inter-file types.
declare const Format: any;
declare const GmailApi: any;
declare const FilterService: any;
