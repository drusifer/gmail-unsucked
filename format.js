/**
 * Pure helpers for Gmail filters: rendering, sorting, search, paging,
 * validation and mapping between the Gmail API shape and the form model.
 * No Apps Script globals are used so this file is unit-testable in Node.
 */
const Format = (function () {
  const KB = 1024;
  const MB = 1024 * 1024;

  const SYSTEM_NAMES = {
    INBOX: 'Inbox',
    UNREAD: 'Unread',
    SPAM: 'Spam',
    STARRED: 'Starred',
    IMPORTANT: 'Important',
    TRASH: 'Trash',
    SENT: 'Sent',
    DRAFT: 'Drafts',
    CATEGORY_PERSONAL: 'Primary',
    CATEGORY_SOCIAL: 'Social',
    CATEGORY_PROMOTIONS: 'Promotions',
    CATEGORY_UPDATES: 'Updates',
    CATEGORY_FORUMS: 'Forums',
  };

  const KNOWN_CRITERIA = ['from', 'to', 'subject', 'query', 'negatedQuery', 'hasAttachment', 'size', 'sizeComparison'];
  const KNOWN_ACTION = ['addLabelIds', 'removeLabelIds', 'forward'];
  // Label ids the form models directly; any other label id is preserved in extras.
  const FORM_ADD = ['STARRED', 'IMPORTANT', 'TRASH'];
  const FORM_REMOVE = ['INBOX', 'UNREAD', 'SPAM'];

  const labelName = (id, labelsById) => (labelsById && labelsById[id]) || SYSTEM_NAMES[id] || id;
  const isSystemId = (id) => Object.prototype.hasOwnProperty.call(SYSTEM_NAMES, id) || /^CATEGORY_/.test(id);

  const sizeToUnit = (bytes) => {
    const n = Number(bytes);
    if (n > 0 && n % MB === 0) return { value: n / MB, unit: 'MB' };
    if (n > 0 && n % KB === 0) return { value: n / KB, unit: 'KB' };
    return { value: n, unit: 'B' };
  };

  const unitToBytes = (value, unit) => {
    const mult = unit === 'MB' ? MB : unit === 'KB' ? KB : 1;
    return Math.round(Number(value) * mult);
  };

  const unitLabel = (unit) => (unit === 'B' ? 'bytes' : unit);

  /** Renders the criteria half of a filter as plain text. */
  const renderCriteria = (c) => {
    c = c || {};
    const parts = [];
    if (c.from) parts.push(`From: ${c.from}`);
    if (c.to) parts.push(`To: ${c.to}`);
    if (c.subject) parts.push(`Subject: ${c.subject}`);
    if (c.query) parts.push(`Has words: ${c.query}`);
    if (c.negatedQuery) parts.push(`Doesn't have: ${c.negatedQuery}`);
    if (c.hasAttachment) parts.push('Has attachment');
    if (c.size) {
      const s = sizeToUnit(c.size);
      const cmp = c.sizeComparison === 'smaller' ? 'smaller' : 'larger';
      parts.push(`Size ${cmp} than ${s.value} ${unitLabel(s.unit)}`);
    }
    return parts.length ? parts.join(', ') : '(no conditions)';
  };

  /** Renders the action half of a filter as plain text. */
  const renderActions = (a, labelsById) => {
    a = a || {};
    const parts = [];
    (a.addLabelIds || []).forEach((id) => {
      if (id === 'STARRED') parts.push('Star it');
      else if (id === 'IMPORTANT') parts.push('Mark important');
      else if (id === 'TRASH') parts.push('Delete it');
      else if (/^CATEGORY_/.test(id)) parts.push(`Categorize as ${labelName(id, labelsById)}`);
      else parts.push(`Label "${labelName(id, labelsById)}"`);
    });
    (a.removeLabelIds || []).forEach((id) => {
      if (id === 'INBOX') parts.push('Skip Inbox');
      else if (id === 'UNREAD') parts.push('Mark as read');
      else if (id === 'SPAM') parts.push('Never send to Spam');
      else if (id === 'IMPORTANT') parts.push('Never mark important');
      else parts.push(`Remove label "${labelName(id, labelsById)}"`);
    });
    if (a.forward) parts.push(`Forward to ${a.forward}`);
    return parts.length ? parts.join(', ') : '(no actions)';
  };

  const renderFilter = (filter, labelsById) =>
    `${renderCriteria(filter.criteria)} -> ${renderActions(filter.action, labelsById)}`;

  const sortKey = (f) => {
    const c = f.criteria || {};
    return String(c.from || c.to || c.subject || c.query || c.negatedQuery || '~').toLowerCase();
  };

  /** Stable sort by first criterion value A-Z, then id. Returns a new array. */
  const sortFilters = (filters) =>
    filters.slice().sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return String(a.id).localeCompare(String(b.id));
    });

  /** Trim and cut to maxLen characters, ending in "..." when cut. */
  const truncate = (value, maxLen) => {
    const s = String(value === undefined || value === null ? '' : value).trim();
    const n = maxLen > 3 ? maxLen : 40;
    return s.length > n ? `${s.slice(0, n - 3)}...` : s;
  };

  // Gmail label colors come from a fixed palette of #rrggbb values; anything else is dropped
  // so a value can never be injected into card HTML.
  const safeColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null);

  // Compact symbols for conditions and actions (label colors stay exact colored dots in cards.js).
  // Always paired with words somewhere (detail card), so a symbol is never the only signal.
  const COND_ICONS = {
    From: '\ud83d\udc64', To: '\ud83d\udc65', Subject: '\ud83d\udcac', 'Has words': '\ud83d\udd0d',
    "Doesn't have": '\ud83d\udeab', 'Has attachment': '\ud83d\udcce', Size: '\ud83d\udccf',
  };
  // Material icon names (hosted PNGs) for the start-icon column of a list line; text-only widgets can't
  // hang wrapped text beside an emoji, an image start icon can.
  const COND_ICON_NAMES = {
    From: 'person', To: 'people', Subject: 'subject', 'Has words': 'search',
    "Doesn't have": 'block', 'Has attachment': 'attach_file', Size: 'straighten',
  };
  const ACTION_ICONS = {
    star: '\u2b50', important: '\u2757', trash: '\ud83d\uddd1\ufe0f', category: '\ud83d\udcc2',
    skipInbox: '\ud83d\udce4', read: '\ud83d\udc41\ufe0f', noSpam: '\ud83d\udee1\ufe0f',
    noImportant: '\ud83d\udd15', removeLabel: '\u2796', forward: '\u27a1\ufe0f',
  };

  const CRITERIA_FIELDS = [['from', 'From'], ['to', 'To'], ['subject', 'Subject'], ['query', 'Has words'], ['negatedQuery', "Doesn't have"]];

  /**
   * Presentation model for one filter, used to draw a list row and a detail card.
   * Pure. labelColors maps label id -> '#rrggbb' for user labels that have one.
   * Returns { id, titleName, title, labels:[{id,name,color}], conditions:[{name,icon,iconName,value,full}], actions:[text], actionIcons:[symbol], forward, listIcons:[symbol, minus forward] }.
   */
  const cardModel = (filter, labelsById, labelColors, opts) => {
    const maxLen = (opts && opts.maxLen) || 40;
    const c = filter.criteria || {};
    const a = filter.action || {};

    const conds = [];
    CRITERIA_FIELDS.forEach(([key, name]) => {
      if (c[key]) conds.push({ name, icon: COND_ICONS[name], iconName: COND_ICON_NAMES[name], value: truncate(c[key], maxLen), full: String(c[key]) });
    });
    if (c.hasAttachment) conds.push({ name: 'Has attachment', icon: COND_ICONS['Has attachment'], iconName: COND_ICON_NAMES['Has attachment'], value: '', full: '' });
    if (c.size !== undefined && c.size !== null && c.size !== '') {
      const u = sizeToUnit(c.size);
      const cmp = c.sizeComparison === 'smaller' ? 'smaller' : 'larger';
      const text = `${cmp} than ${u.value} ${unitLabel(u.unit)}`;
      conds.push({ name: 'Size', icon: COND_ICONS.Size, iconName: COND_ICON_NAMES.Size, value: text, full: text });
    }

    const first = conds.find((x) => x.name !== 'Has attachment' && x.name !== 'Size') || conds[0];
    const title = first ? (first.value || first.name) : '(no conditions)';
    const titleName = first && first.value ? first.name : '';
    const rest = first ? conds.filter((x) => x !== first) : [];

    const labels = [];
    const actions = [];
    const actionIcons = [];
    const act = (kind, text) => { actions.push(text); actionIcons.push(ACTION_ICONS[kind]); };
    (a.addLabelIds || []).forEach((id) => {
      if (id === 'STARRED') act('star', 'Star it');
      else if (id === 'IMPORTANT') act('important', 'Mark important');
      else if (id === 'TRASH') act('trash', 'Delete it');
      else if (/^CATEGORY_/.test(id)) act('category', `Categorize as ${labelName(id, labelsById)}`);
      else labels.push({ id, name: labelName(id, labelsById), color: safeColor(labelColors && labelColors[id]) });
    });
    (a.removeLabelIds || []).forEach((id) => {
      if (id === 'INBOX') act('skipInbox', 'Skip Inbox');
      else if (id === 'UNREAD') act('read', 'Mark as read');
      else if (id === 'SPAM') act('noSpam', 'Never send to Spam');
      else if (id === 'IMPORTANT') act('noImportant', 'Never mark important');
      else act('removeLabel', `Remove label "${labelName(id, labelsById)}"`);
    });
    if (a.forward) act('forward', `Forward to ${a.forward}`);

    return { id: filter.id, titleName, title, labels, conditions: first ? [first].concat(rest) : [], actions, actionIcons, forward: a.forward || '', listIcons: actionIcons.filter((_, i) => !(a.forward && actions[i] === `Forward to ${a.forward}`)) };
  };

  /** Case-insensitive match against the rendered text the user sees. */
  const searchFilters = (filters, query, labelsById) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return filters;
    return filters.filter((f) => renderFilter(f, labelsById).toLowerCase().includes(q));
  };

  const paginate = (items, page, pageSize) => {
    const size = pageSize > 0 ? pageSize : 10;
    const pages = Math.max(1, Math.ceil(items.length / size));
    const p = Math.min(Math.max(0, Number(page) || 0), pages - 1);
    return {
      items: items.slice(p * size, p * size + size),
      page: p,
      pages,
      total: items.length,
      start: items.length ? p * size + 1 : 0,
      end: Math.min(items.length, p * size + size),
    };
  };

  const emptyForm = () => ({
    from: '', to: '', subject: '', query: '', negatedQuery: '',
    hasAttachment: false, sizeOp: 'larger', sizeValue: '', sizeUnit: 'MB',
    labelId: '', skipInbox: false, markRead: false, star: false,
    important: false, neverSpam: false, trash: false, forwardTo: '',
  });

  const emptyExtras = () => ({ criteria: {}, action: {} });

  const trim = (v) => (v === undefined || v === null ? '' : String(v).trim());

  const normalizeForm = (form) => {
    const base = emptyForm();
    const out = {};
    Object.keys(base).forEach((k) => {
      const v = form && form[k] !== undefined ? form[k] : base[k];
      out[k] = typeof base[k] === 'boolean' ? v === true || v === 'true' : trim(v);
    });
    if (out.sizeOp !== 'smaller') out.sizeOp = 'larger';
    if (['B', 'KB', 'MB'].indexOf(out.sizeUnit) < 0) out.sizeUnit = 'MB';
    return out;
  };

  /**
   * Maps an API filter to the form model plus "extras": parts of the filter the
   * form cannot represent, which formToFilter re-emits so edits never drop data.
   */
  const filterToForm = (filter) => {
    const c = (filter && filter.criteria) || {};
    const a = (filter && filter.action) || {};
    const form = emptyForm();
    const extras = emptyExtras();

    ['from', 'to', 'subject', 'query', 'negatedQuery'].forEach((k) => { form[k] = c[k] || ''; });
    form.hasAttachment = !!c.hasAttachment;
    if (c.size) {
      const s = sizeToUnit(c.size);
      form.sizeValue = String(s.value);
      form.sizeUnit = s.unit;
      form.sizeOp = c.sizeComparison === 'smaller' ? 'smaller' : 'larger';
    }
    Object.keys(c).forEach((k) => {
      if (KNOWN_CRITERIA.indexOf(k) < 0) extras.criteria[k] = c[k];
    });

    const leftoverAdd = [];
    (a.addLabelIds || []).forEach((id) => {
      if (id === 'STARRED') form.star = true;
      else if (id === 'IMPORTANT') form.important = true;
      else if (id === 'TRASH') form.trash = true;
      else if (!form.labelId && !isSystemId(id)) form.labelId = id;
      else leftoverAdd.push(id);
    });
    const leftoverRemove = [];
    (a.removeLabelIds || []).forEach((id) => {
      if (id === 'INBOX') form.skipInbox = true;
      else if (id === 'UNREAD') form.markRead = true;
      else if (id === 'SPAM') form.neverSpam = true;
      else leftoverRemove.push(id);
    });
    form.forwardTo = a.forward || '';
    if (leftoverAdd.length) extras.action.addLabelIds = leftoverAdd;
    if (leftoverRemove.length) extras.action.removeLabelIds = leftoverRemove;
    Object.keys(a).forEach((k) => {
      if (KNOWN_ACTION.indexOf(k) < 0) extras.action[k] = a[k];
    });
    return { form, extras };
  };

  /** Builds the API filter resource (no id) from form values and extras. */
  const formToFilter = (rawForm, extras) => {
    const form = normalizeForm(rawForm);
    const ex = extras || emptyExtras();
    const criteria = {};
    ['from', 'to', 'subject', 'query', 'negatedQuery'].forEach((k) => {
      if (form[k]) criteria[k] = form[k];
    });
    if (form.hasAttachment) criteria.hasAttachment = true;
    if (form.sizeValue !== '' && Number(form.sizeValue) > 0) {
      criteria.size = unitToBytes(form.sizeValue, form.sizeUnit);
      criteria.sizeComparison = form.sizeOp;
    }
    Object.keys(ex.criteria || {}).forEach((k) => { criteria[k] = ex.criteria[k]; });

    const add = [];
    if (form.labelId) add.push(form.labelId);
    if (form.star) add.push('STARRED');
    if (form.important) add.push('IMPORTANT');
    if (form.trash) add.push('TRASH');
    (ex.action.addLabelIds || []).forEach((id) => { if (add.indexOf(id) < 0) add.push(id); });
    const remove = [];
    if (form.skipInbox) remove.push('INBOX');
    if (form.markRead) remove.push('UNREAD');
    if (form.neverSpam) remove.push('SPAM');
    (ex.action.removeLabelIds || []).forEach((id) => { if (remove.indexOf(id) < 0) remove.push(id); });

    const action = {};
    if (add.length) action.addLabelIds = add;
    if (remove.length) action.removeLabelIds = remove;
    if (form.forwardTo) action.forward = form.forwardTo;
    Object.keys(ex.action || {}).forEach((k) => {
      if (KNOWN_ACTION.indexOf(k) < 0) action[k] = ex.action[k];
    });
    return { criteria, action };
  };

  const canonical = (filter) => {
    const norm = (o) => {
      if (Array.isArray(o)) return o.map(norm).sort();
      if (o && typeof o === 'object') {
        const out = {};
        Object.keys(o).sort().forEach((k) => {
          const v = norm(o[k]);
          const empty = v === false || v === '' || v === null || v === undefined ||
            (Array.isArray(v) && v.length === 0) ||
            (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
          if (!empty) out[k] = v;
        });
        return out;
      }
      return o;
    };
    return JSON.stringify(norm({ criteria: filter.criteria, action: filter.action }));
  };

  const filtersEqual = (a, b) => canonical(a) === canonical(b);

  const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

  /**
   * Validates form values. opts: { verifiedAddresses: [], keepForward: '', extras }.
   * Returns { ok, errors } where errors maps field (or 'criteria'/'actions') to a message.
   */
  const validateForm = (rawForm, opts) => {
    const o = opts || {};
    const form = normalizeForm(rawForm);
    const extras = o.extras || emptyExtras();
    const errors = {};

    const hasSize = form.sizeValue !== '';
    if (hasSize && !(Number(form.sizeValue) > 0)) {
      errors.sizeValue = 'Size must be a number greater than 0.';
    }
    const hasCriterion = form.from || form.to || form.subject || form.query ||
      form.negatedQuery || form.hasAttachment || (hasSize && !errors.sizeValue) ||
      Object.keys(extras.criteria || {}).length > 0;
    if (!hasCriterion) {
      errors.criteria = 'Add at least one condition (From, To, Subject, Has words, Size, or Has attachment).';
    }

    const extraActions = (extras.action.addLabelIds || []).length +
      (extras.action.removeLabelIds || []).length;
    const hasAction = form.labelId || form.skipInbox || form.markRead || form.star ||
      form.important || form.neverSpam || form.trash || form.forwardTo || extraActions > 0;
    if (!hasAction) {
      errors.actions = 'Pick at least one action (label, skip inbox, forward, ...).';
    }

    if (form.forwardTo) {
      if (!EMAIL_RE.test(form.forwardTo)) {
        errors.forwardTo = 'Enter a valid email address to forward to.';
      } else {
        const verified = (o.verifiedAddresses || []).map((s) => s.toLowerCase());
        const keep = (o.keepForward || '').toLowerCase();
        const addr = form.forwardTo.toLowerCase();
        if (verified.indexOf(addr) < 0 && addr !== keep) {
          errors.forwardTo = 'That forwarding address is not verified. Verify it in Gmail Settings > Forwarding first.';
        }
      }
    }
    return { ok: Object.keys(errors).length === 0, errors };
  };

  /** "Name <a@b.com>" -> "a@b.com" */
  const extractEmail = (s) => {
    const str = trim(s);
    const m = str.match(/<([^>]+)>/);
    return m ? m[1].trim() : str;
  };

  return {
    renderCriteria, renderActions, renderFilter, sortFilters, truncate, cardModel, searchFilters,
    paginate, emptyForm, emptyExtras, normalizeForm, filterToForm, formToFilter,
    filtersEqual, validateForm, extractEmail, sizeToUnit, unitToBytes, labelName,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Format;
