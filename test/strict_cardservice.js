// Strict stand-in for Apps Script CardService, used by the handler contract tests.
// Unlike the recording Proxy in cards.test.js it rejects what the real platform rejects:
//   - unknown methods (typos) and wrong argument types
//   - widgets/sections/cards that were never build()-ed or are the wrong kind
//   - action parameters that are not strings
// It is only as accurate as this file; when a live failure teaches us a new rule, add it here.

const fail = (msg) => { throw new Error(`CardService: ${msg}`); };
const isStr = (v) => typeof v === 'string';

const ENUMS = {
  LoadIndicator: { SPINNER: 'SPINNER', NONE: 'NONE' },
  TextButtonStyle: { TEXT: 'TEXT', FILLED: 'FILLED', FILLED_TONAL: 'FILLED_TONAL', BORDERLESS: 'BORDERLESS' },
  SelectionInputType: { CHECK_BOX: 'CHECK_BOX', RADIO_BUTTON: 'RADIO_BUTTON', DROPDOWN: 'DROPDOWN', SWITCH: 'SWITCH' },
};
const oneOf = (name, v) => { if (!Object.values(ENUMS[name]).includes(v)) fail(`${name} value invalid: ${String(v)}`); };

/** Builds a class from a spec: method -> argument validator (throws on bad args). */
const make = (kind, spec, { built = false, init } = {}) => {
  const self = { __kind: kind, __built: built, props: {} };
  if (init) init(self);
  Object.keys(spec).forEach((name) => {
    self[name] = (...args) => {
      if (self.__built) fail(`${kind}.${name} called on an already built object`);
      spec[name](self, ...args);
      return self;
    };
  });
  return self;
};

const setProp = (k, check) => (self, v) => { check(v, k); self.props[k] = v; };
const str = (label) => (v) => { if (!isStr(v)) fail(`${label} expects a string, got ${typeof v}: ${String(v)}`); };
const bool = (label) => (v) => { if (typeof v !== 'boolean') fail(`${label} expects a boolean, got ${typeof v}: ${String(v)}`); };

const WIDGET_KINDS = ['TextParagraph', 'TextInput', 'SelectionInput', 'DecoratedText', 'ButtonSet', 'TextButton', 'Image', 'Divider'];

const newCardService = () => {
  const newAction = () => make('Action', {
    setFunctionName: setProp('functionName', str('Action.setFunctionName')),
    setParameters: (self, p) => {
      if (!p || typeof p !== 'object') fail('Action.setParameters expects an object');
      Object.keys(p).forEach((k) => { if (!isStr(p[k])) fail(`Action parameter "${k}" must be a string, got ${typeof p[k]}`); });
      self.props.parameters = p;
    },
    setLoadIndicator: (self, v) => { oneOf('LoadIndicator', v); self.props.loadIndicator = v; },
  });

  const newTextButton = () => make('TextButton', {
    setText: setProp('text', str('TextButton.setText')),
    setOnClickAction: (self, a) => { if (!a || a.__kind !== 'Action') fail('TextButton.setOnClickAction expects an Action'); self.props.action = a; },
    setTextButtonStyle: (self, v) => { oneOf('TextButtonStyle', v); },
    setDisabled: setProp('disabled', bool('TextButton.setDisabled')),
  });

  const newButtonSet = () => make('ButtonSet', {
    addButton: (self, b) => {
      if (!b || b.__kind !== 'TextButton') fail('ButtonSet.addButton expects a TextButton');
      (self.props.buttons = self.props.buttons || []).push(b);
    },
  });

  const newTextParagraph = () => make('TextParagraph', { setText: setProp('text', str('TextParagraph.setText')) });

  const newTextInput = () => make('TextInput', {
    setFieldName: setProp('fieldName', str('TextInput.setFieldName')),
    setTitle: setProp('title', str('TextInput.setTitle')),
    setValue: setProp('value', str('TextInput.setValue')),
    setHint: setProp('hint', str('TextInput.setHint')),
  });

  const newSelectionInput = () => make('SelectionInput', {
    setType: (self, v) => { oneOf('SelectionInputType', v); self.props.type = v; },
    setFieldName: setProp('fieldName', str('SelectionInput.setFieldName')),
    setTitle: setProp('title', str('SelectionInput.setTitle')),
    addItem: (self, text, value, selected) => {
      str('SelectionInput.addItem text')(text);
      str('SelectionInput.addItem value')(value);
      bool('SelectionInput.addItem selected')(selected);
      (self.props.items = self.props.items || []).push({ text, value, selected });
    },
  });

  const newDecoratedText = () => make('DecoratedText', {
    setText: setProp('text', str('DecoratedText.setText')),
    setWrapText: setProp('wrap', bool('DecoratedText.setWrapText')),
    setTopLabel: setProp('topLabel', str('DecoratedText.setTopLabel')),
    setBottomLabel: setProp('bottomLabel', str('DecoratedText.setBottomLabel')),
  });

  const newCardSection = () => make('CardSection', {
    setHeader: setProp('header', str('CardSection.setHeader')),
    addWidget: (self, w) => {
      if (!w || !WIDGET_KINDS.includes(w.__kind)) fail(`CardSection.addWidget expects a widget, got ${w && w.__kind}`);
      (self.props.widgets = self.props.widgets || []).push(w);
    },
  });

  const newCardHeader = () => make('CardHeader', { setTitle: setProp('title', str('CardHeader.setTitle')) });

  const newCardBuilder = () => {
    const b = make('CardBuilder', {
      setHeader: (self, h) => { if (!h || h.__kind !== 'CardHeader') fail('CardBuilder.setHeader expects a CardHeader'); self.props.header = h; },
      addSection: (self, s) => {
        if (!s || s.__kind !== 'CardSection') fail(`CardBuilder.addSection expects a CardSection, got ${s && s.__kind}`);
        // Platform rule we believe holds: a section must carry at least one widget.
        if (!s.props.widgets || s.props.widgets.length === 0) fail('CardBuilder.addSection: section has no widgets');
        (self.props.sections = self.props.sections || []).push(s);
      },
    });
    b.build = () => {
      if (!b.props.sections || b.props.sections.length === 0) fail('Card must have at least one section');
      b.__built = true;
      return { __kind: 'Card', __built: true, props: b.props, printJson: () => JSON.stringify({ header: {}, sections: [], kind: 'card', title: (b.props.header && b.props.header.props.title) || '' }) };
    };
    return b;
  };

  const newNotification = () => make('Notification', { setText: setProp('text', str('Notification.setText')) });

  const newNavigation = () => make('Navigation', {
    pushCard: (self, c) => { if (!c || c.__kind !== 'Card') fail('Navigation.pushCard expects a built Card'); (self.props.ops = self.props.ops || []).push('push'); (self.props.cards = self.props.cards || []).push(c); },
    updateCard: (self, c) => { if (!c || c.__kind !== 'Card') fail('Navigation.updateCard expects a built Card'); (self.props.ops = self.props.ops || []).push('update'); (self.props.cards = self.props.cards || []).push(c); },
    popCard: (self) => { (self.props.ops = self.props.ops || []).push('pop'); },
    popToRoot: (self) => { (self.props.ops = self.props.ops || []).push('popToRoot'); },
  });

  const newActionResponseBuilder = () => {
    const b = make('ActionResponseBuilder', {
      setNavigation: (self, n) => { if (!n || n.__kind !== 'Navigation') fail('ActionResponseBuilder.setNavigation expects a Navigation'); self.props.navigation = n; },
      setNotification: (self, n) => { if (!n || n.__kind !== 'Notification') fail('ActionResponseBuilder.setNotification expects a Notification'); self.props.notification = n; },
    });
    b.build = () => {
      b.__built = true;
      const titles = [];
      ((b.props.navigation && b.props.navigation.props.cards) || []).forEach((c) => titles.push(c.props.header.props.title));
      const texts = [];
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (n.props && typeof n.props.text === 'string') texts.push(n.props.text);
        Object.values(n.props || {}).forEach((v) => (Array.isArray(v) ? v.forEach(walk) : walk(v)));
      };
      walk(b.props.navigation);
      return { __kind: 'ActionResponse', __built: true, props: b.props, printJson: () => JSON.stringify({ renderActions: {}, titles, texts }) };
    };
    return b;
  };

  return Object.assign({
    newAction, newTextButton, newButtonSet, newTextParagraph, newTextInput, newSelectionInput,
    newDecoratedText, newCardSection, newCardHeader, newCardBuilder, newNotification, newNavigation,
    newActionResponseBuilder,
  }, ENUMS);
};

/** Walks a built Card/ActionResponse; returns every Action's function name and parameters. */
const collectActions = (root) => {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.__kind === 'Action') out.push({ fn: n.props.functionName, parameters: n.props.parameters || {} });
    Object.values(n.props || {}).forEach((v) => (Array.isArray(v) ? v.forEach(walk) : walk(v)));
  };
  walk(root);
  return out;
};

module.exports = { newCardService, collectActions };
