/**
 * Gmail add-on UI. The only file that touches CardService.
 * All state travels in action parameters (strings); list context (search `q`
 * and `page`) is carried through every navigation so the user keeps their place.
 */

// ---- shared helpers -------------------------------------------------------

const PAGE_SIZE = 10;

const svc_ = () => FilterService.create(GmailApi, Format);

const esc_ = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const params_ = (e) => (e && (e.parameters || (e.commonEventObject && e.commonEventObject.parameters))) || {};

const ctx_ = (e) => {
  const p = params_(e);
  return { q: p.q || '', page: Number(p.page) || 0 };
};

/** Builds an Action whose parameters always carry the list context. */
const action_ = (fn, ctx, extra) => {
  const p = { q: String((ctx && ctx.q) || ''), page: String((ctx && ctx.page) || 0) };
  Object.keys(extra || {}).forEach((k) => { p[k] = String(extra[k]); });
  return CardService.newAction()
    .setFunctionName(fn)
    .setParameters(p)
    .setLoadIndicator(CardService.LoadIndicator.SPINNER);
};

const button_ = (text, fn, ctx, extra, filled) => {
  const b = CardService.newTextButton().setText(text).setOnClickAction(action_(fn, ctx, extra));
  if (filled) b.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
  return b;
};

const card_ = (title, sections) => {
  const b = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle(title));
  sections.forEach((s) => b.addSection(s));
  return b.build();
};

const para_ = (html) => CardService.newTextParagraph().setText(html);

const friendlyError_ = (err) => {
  const msg = (err && err.message) || 'Unknown error';
  if (/already exists/i.test(msg)) {
    return 'A filter with exactly these conditions and actions already exists. Change something and try again.';
  }
  if (err && err.code === 403) {
    return 'Gmail refused this request. The add-on may need additional permission. Reinstall or re-authorize it and try again.';
  }
  return 'Gmail could not complete that request.';
};

const errorCard_ = (err, ctx, headline) =>
  card_('Something went wrong', [
    CardService.newCardSection()
      .addWidget(para_(`<b>${esc_(headline || 'That did not work.')}</b><br>${esc_(friendlyError_(err))}`))
      .addWidget(para_(`<font color="#5f6368">Details: ${esc_((err && err.message) || '')}</font>`))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Back to filters', 'onShowList', ctx, {}, true))),
  ]);

const nav_ = () => CardService.newNavigation();

const toList_ = (ctx, notificationText) => {
  const rb = CardService.newActionResponseBuilder()
    .setNavigation(nav_().popToRoot().updateCard(listCard_(ctx)));
  if (notificationText) rb.setNotification(CardService.newNotification().setText(notificationText));
  return rb.build();
};

// ---- list -----------------------------------------------------------------

const listCard_ = (ctx) => {
  const section = CardService.newCardSection();
  let view;
  try {
    view = svc_().listView({ q: ctx.q, page: ctx.page, pageSize: PAGE_SIZE });
  } catch (err) {
    return errorCard_(err, { q: '', page: 0 }, 'Could not load your filters.');
  }
  const here = { q: ctx.q, page: view.page };

  section.addWidget(CardService.newButtonSet()
    .addButton(button_('New filter', 'onNewFilter', here, {}, true)));
  section.addWidget(CardService.newTextInput().setFieldName('q').setTitle('Search filters').setValue(ctx.q || ''));
  const searchSet = CardService.newButtonSet()
    .addButton(button_('Search', 'onSearch', { q: ctx.q, page: 0 }, {}));
  if (ctx.q) searchSet.addButton(button_('Clear search', 'onClearSearch', { q: '', page: 0 }, {}));
  section.addWidget(searchSet);

  if (view.totalFilters === 0) {
    section.addWidget(para_('You have no filters yet. Choose <b>New filter</b> to create your first one.'));
  } else if (view.matched === 0) {
    section.addWidget(para_(`No filters match "${esc_(ctx.q)}".`));
  } else {
    const summary = ctx.q
      ? `${view.matched} of ${view.totalFilters} filters match "${esc_(ctx.q)}" (showing ${view.start}-${view.end})`
      : `Showing ${view.start}-${view.end} of ${view.totalFilters} filters`;
    section.addWidget(para_(`<font color="#5f6368">${summary}</font>`));
    view.items.forEach((item) => {
      section.addWidget(CardService.newDecoratedText().setText(esc_(item.text)).setWrapText(true));
      section.addWidget(CardService.newButtonSet()
        .addButton(button_('Edit', 'onEditFilter', here, { id: item.id }))
        .addButton(button_('Duplicate', 'onDuplicateFilter', here, { id: item.id }))
        .addButton(button_('Delete', 'onConfirmDelete', here, { id: item.id })));
    });
    const pager = CardService.newButtonSet();
    if (view.page > 0) pager.addButton(button_('Previous', 'onShowList', { q: ctx.q, page: view.page - 1 }, {}));
    if (view.page < view.pages - 1) {
      const nextStart = (view.page + 1) * PAGE_SIZE + 1;
      const nextEnd = Math.min(view.matched, (view.page + 2) * PAGE_SIZE);
      pager.addButton(button_(`Show more (${nextStart}-${nextEnd})`, 'onShowList', { q: ctx.q, page: view.page + 1 }, {}));
    }
    if (view.pages > 1) section.addWidget(pager);
  }
  return card_('Filter Manager', [section]);
};

/** Homepage trigger (no message open). */
const buildHomepage = (e) => listCard_({ q: '', page: 0 });

/** Contextual trigger: a message is open (F8). */
const buildContextualCard = (e) => {
  const g = (e && (e.gmail || e.messageMetadata)) || {};
  let from = '';
  let subject = '';
  try {
    if (g.accessToken) GmailApp.setCurrentMessageAccessToken(g.accessToken);
    const msg = GmailApp.getMessageById(g.messageId);
    from = msg.getFrom();
    subject = msg.getSubject();
  } catch (err) {
    return card_('Filter Manager', [CardService.newCardSection()
      .addWidget(para_('Could not read this message.'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Manage all filters', 'onManageFilters', { q: '', page: 0 }, {}, true)))]);
  }
  const email = Format.extractEmail(from);
  const section = CardService.newCardSection()
    .addWidget(CardService.newDecoratedText().setTopLabel('From').setText(esc_(email)).setWrapText(true))
    .addWidget(CardService.newDecoratedText().setTopLabel('Subject').setText(esc_(subject)).setWrapText(true))
    .addWidget(CardService.newButtonSet()
      .addButton(button_('Create filter from this message', 'onNewFromMessage', { q: '', page: 0 },
        { from: email, subject: subject }, true))
      .addButton(button_('Manage all filters', 'onManageFilters', { q: '', page: 0 }, {})));
  return card_('Filter Manager', [section]);
};

// ---- form -----------------------------------------------------------------

/**
 * opts: { mode: 'create'|'edit', oldId, form, extras, errors, ctx, title }
 */
const formCard_ = (opts) => {
  const form = Format.normalizeForm(opts.form);
  const extras = opts.extras || Format.emptyExtras();
  const errors = opts.errors || {};
  const ctx = opts.ctx || { q: '', page: 0 };
  const options = svc_().formOptions();
  const err = (k) => (errors[k] ? para_(`<font color="#d93025"><b>Error:</b> ${esc_(errors[k])}</font>`) : null);

  const top = CardService.newCardSection();
  if (Object.keys(errors).length) top.addWidget(para_('<font color="#d93025"><b>Please fix the problems below.</b></font>'));

  const when = CardService.newCardSection().setHeader('When a message matches');
  if (err('criteria')) when.addWidget(err('criteria'));
  [['from', 'From'], ['to', 'To'], ['subject', 'Subject'], ['query', 'Has the words'], ['negatedQuery', "Doesn't have"]]
    .forEach(([k, title]) => when.addWidget(
      CardService.newTextInput().setFieldName(k).setTitle(title).setValue(form[k])));
  when.addWidget(CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX)
    .setFieldName('options').setTitle('Attachments')
    .addItem('Has attachment', 'hasAttachment', form.hasAttachment));
  when.addWidget(CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('sizeOp').setTitle('Size is')
    .addItem('Larger than', 'larger', form.sizeOp === 'larger')
    .addItem('Smaller than', 'smaller', form.sizeOp === 'smaller'));
  if (err('sizeValue')) when.addWidget(err('sizeValue'));
  when.addWidget(CardService.newTextInput().setFieldName('sizeValue').setTitle('Size (leave empty for any)').setValue(form.sizeValue));
  const unit = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('sizeUnit').setTitle('Size unit');
  [['MB', 'MB'], ['KB', 'KB'], ['B', 'bytes']].forEach(([v, t]) => unit.addItem(t, v, form.sizeUnit === v));
  when.addWidget(unit);

  const then = CardService.newCardSection().setHeader('Do this');
  if (err('actions')) then.addWidget(err('actions'));
  const labelSel = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('labelId').setTitle('Apply label')
    .addItem('(none)', '', !form.labelId);
  let known = false;
  options.labels.forEach((l) => {
    if (l.id === form.labelId) known = true;
    labelSel.addItem(l.name, l.id, l.id === form.labelId);
  });
  if (form.labelId && !known) labelSel.addItem(`Unknown label (${form.labelId})`, form.labelId, true);
  then.addWidget(labelSel);
  if (options.labels.length === 0) {
    then.addWidget(para_('<font color="#5f6368">You have no labels yet. Create one in Gmail (Settings > Labels), then reopen this form.</font>'));
  }
  then.addWidget(CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX)
    .setFieldName('actions').setTitle('Also')
    .addItem('Skip the Inbox (archive)', 'skipInbox', form.skipInbox)
    .addItem('Mark as read', 'markRead', form.markRead)
    .addItem('Star it', 'star', form.star)
    .addItem('Mark as important', 'important', form.important)
    .addItem('Never send to Spam', 'neverSpam', form.neverSpam)
    .addItem('Delete it (moves to Trash)', 'trash', form.trash));
  if (err('forwardTo')) then.addWidget(err('forwardTo'));
  const fwd = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('forwardTo').setTitle('Forward to')
    .addItem('(do not forward)', '', !form.forwardTo);
  let fwdKnown = false;
  options.forwardAddresses.forEach((a) => {
    if (a === form.forwardTo) fwdKnown = true;
    fwd.addItem(a, a, a === form.forwardTo);
  });
  if (form.forwardTo && !fwdKnown) fwd.addItem(`${form.forwardTo} (not verified)`, form.forwardTo, true);
  then.addWidget(fwd);
  then.addWidget(para_('<font color="#5f6368">Only verified forwarding addresses are listed. Add and verify one in Gmail Settings > Forwarding and addresses.</font>'));

  const extraNote = (extras.action.addLabelIds || []).length + (extras.action.removeLabelIds || []).length +
    Object.keys(extras.criteria || {}).length;
  const foot = CardService.newCardSection();
  if (extraNote > 0) {
    foot.addWidget(para_('<font color="#5f6368">This filter has extra settings this form cannot show. They will be kept when you save.</font>'));
  }
  const saveExtra = { mode: opts.mode, oldId: opts.oldId || '', extras: JSON.stringify(extras) };
  foot.addWidget(CardService.newButtonSet()
    .addButton(button_(opts.mode === 'edit' ? 'Save changes' : 'Create filter', 'onSaveFilter', ctx, saveExtra, true))
    .addButton(button_('Cancel', 'onCancel', ctx, {})));
  const sections = Object.keys(errors).length ? [top, when, then, foot] : [when, then, foot];
  return card_(opts.title || (opts.mode === 'edit' ? 'Edit filter' : 'New filter'), sections);
};

const readForm_ = (e) => {
  const fi = (e && e.formInputs) || {};
  const one = (e && e.formInput) || {};
  const first = (n) => (one[n] !== undefined ? one[n] : (fi[n] ? fi[n][0] : ''));
  const many = (n) => (fi[n] || (one[n] !== undefined ? [one[n]] : []));
  const actions = many('actions');
  const options = many('options');
  return {
    from: first('from'), to: first('to'), subject: first('subject'),
    query: first('query'), negatedQuery: first('negatedQuery'),
    hasAttachment: options.indexOf('hasAttachment') >= 0,
    sizeOp: first('sizeOp'), sizeValue: first('sizeValue'), sizeUnit: first('sizeUnit'),
    labelId: first('labelId'),
    skipInbox: actions.indexOf('skipInbox') >= 0, markRead: actions.indexOf('markRead') >= 0,
    star: actions.indexOf('star') >= 0, important: actions.indexOf('important') >= 0,
    neverSpam: actions.indexOf('neverSpam') >= 0, trash: actions.indexOf('trash') >= 0,
    forwardTo: first('forwardTo'),
  };
};

const parseExtras_ = (s) => {
  try {
    const x = JSON.parse(s || '{}');
    return { criteria: x.criteria || {}, action: x.action || {} };
  } catch (err) {
    return Format.emptyExtras();
  }
};

// ---- action handlers (referenced by name from cards) ----------------------

const push_ = (card) => CardService.newActionResponseBuilder()
  .setNavigation(nav_().pushCard(card)).build();

const update_ = (card) => CardService.newActionResponseBuilder()
  .setNavigation(nav_().updateCard(card)).build();

const notify_ = (text) => CardService.newActionResponseBuilder()
  .setNotification(CardService.newNotification().setText(text)).build();

const onShowList = (e) => update_(listCard_(ctx_(e)));

const onManageFilters = (e) => push_(listCard_(ctx_(e)));

const onSearch = (e) => {
  const q = String(((e.formInput || {}).q) || ((e.formInputs || {}).q || [''])[0] || '').trim();
  return update_(listCard_({ q, page: 0 }));
};

const onClearSearch = (e) => update_(listCard_({ q: '', page: 0 }));

const onCancel = (e) => CardService.newActionResponseBuilder().setNavigation(nav_().popCard()).build();

const onNewFilter = (e) => push_(formCard_({ mode: 'create', form: Format.emptyForm(), ctx: ctx_(e) }));

const onNewFromMessage = (e) => {
  const p = params_(e);
  const form = svc_().prefillFromMessage({ from: p.from, subject: p.subject });
  return push_(formCard_({ mode: 'create', form, ctx: ctx_(e), title: 'New filter from message' }));
};

const onEditFilter = (e) => {
  const p = params_(e);
  try {
    const r = svc_().getForm(p.id);
    if (r.status !== 'ok') return notify_('That filter no longer exists.');
    return push_(formCard_({ mode: 'edit', oldId: p.id, form: r.form, extras: r.extras, ctx: ctx_(e) }));
  } catch (err) {
    return push_(errorCard_(err, ctx_(e), 'Could not open that filter.'));
  }
};

const onDuplicateFilter = (e) => {
  const p = params_(e);
  try {
    const r = svc_().getForm(p.id);
    if (r.status !== 'ok') return notify_('That filter no longer exists.');
    return push_(formCard_({
      mode: 'create', form: r.form, extras: r.extras, ctx: ctx_(e), title: 'Duplicate filter',
    }));
  } catch (err) {
    return push_(errorCard_(err, ctx_(e), 'Could not open that filter.'));
  }
};

const onSaveFilter = (e) => {
  const p = params_(e);
  const ctx = ctx_(e);
  const form = readForm_(e);
  const extras = parseExtras_(p.extras);
  const svc = svc_();
  const result = p.mode === 'edit' ? svc.editFilter(p.oldId, form, extras) : svc.createFilter(form, extras);

  switch (result.status) {
    case 'ok':
      return toList_(ctx, p.mode === 'edit' ? 'Filter saved.' : 'Filter created.');
    case 'invalid':
      return update_(formCard_({ mode: p.mode, oldId: p.oldId, form, extras, errors: result.errors, ctx }));
    case 'no_change':
      return notify_('No changes to save.');
    case 'not_found':
      return notify_('The filter you were editing no longer exists.');
    case 'partial':
      return update_(card_('Saved, but the old filter is still there', [CardService.newCardSection()
        .addWidget(para_('<b>Your new filter was created, but the old one could not be removed,</b> so you now have both. Remove the old one to finish.'))
        .addWidget(para_(`<font color="#5f6368">Details: ${esc_(result.error.message)}</font>`))
        .addWidget(CardService.newButtonSet()
          .addButton(button_('Delete old filter', 'onRetryDeleteOld', ctx, { oldId: result.oldId }, true))
          .addButton(button_('Back to filters', 'onShowList', ctx, {})))]));
    default:
      return push_(errorCard_(result.error, ctx, 'Your filter was not saved.'));
  }
};

const onRetryDeleteOld = (e) => {
  const r = svc_().retryDeleteOld(params_(e).oldId);
  if (r.status === 'ok') return toList_(ctx_(e), 'Old filter deleted.');
  return push_(errorCard_(r.error, ctx_(e), 'The old filter was not deleted.'));
};

const onConfirmDelete = (e) => {
  const p = params_(e);
  const ctx = ctx_(e);
  try {
    const r = svc_().getForm(p.id);
    if (r.status !== 'ok') return notify_('That filter no longer exists.');
    return push_(card_('Delete this filter?', [CardService.newCardSection()
      .addWidget(CardService.newDecoratedText().setText(esc_(svc_().render(r.filter))).setWrapText(true))
      .addWidget(para_('Messages already in your mailbox are not changed.'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Delete filter', 'onDeleteFilter', ctx, { id: p.id }, true))
        .addButton(button_('Cancel', 'onCancel', ctx, {})))]));
  } catch (err) {
    return push_(errorCard_(err, ctx, 'Could not load that filter.'));
  }
};

const onDeleteFilter = (e) => {
  const ctx = ctx_(e);
  const r = svc_().deleteFilter(params_(e).id);
  if (r.status === 'not_found') return toList_(ctx, 'That filter was already gone.');
  if (r.status !== 'ok') return push_(errorCard_(r.error, ctx, 'The filter was not deleted.'));
  const text = svc_().render(r.deleted);
  const card = card_('Filter deleted', [CardService.newCardSection()
    .addWidget(CardService.newDecoratedText().setText(esc_(text)).setWrapText(true))
    .addWidget(para_('The filter was deleted. You can undo this now; the option goes away when you leave this card.'))
    .addWidget(CardService.newButtonSet()
      .addButton(button_('Undo', 'onUndoDelete', ctx, { copy: JSON.stringify(r.deleted) }, true))
      .addButton(button_('Back to filters', 'onShowList', ctx, {})))]);
  return CardService.newActionResponseBuilder()
    .setNavigation(nav_().popToRoot().updateCard(card)).build();
};

const onUndoDelete = (e) => {
  const ctx = ctx_(e);
  let copy;
  try { copy = JSON.parse(params_(e).copy); } catch (err) { return notify_('Nothing to restore.'); }
  const r = svc_().undoDelete(copy);
  if (r.status === 'ok') return toList_(ctx, 'Filter restored.');
  return push_(errorCard_(r.error, ctx, 'The filter was not restored.'));
};
