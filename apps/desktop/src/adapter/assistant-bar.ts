import { ASSISTANT_BAR_BRIDGE } from '../shared/assistant-bar-api.ts';
import { LANDMARKS } from './page-state.ts';

/** YapYap's own words on the bar, in the user's language. */
export interface BarLabels {
  readonly label: string;
  readonly name: string;
  readonly suggest: string;
  readonly summarize: string;
  readonly rewrite: string;
  readonly rewriteLabel: string;
  readonly catchUp: string;
  readonly catchUpLabel: string;
  readonly settings: string;
  readonly model: string;
  readonly use: string;
  readonly sendLabel: string;
  readonly write: string;
  readonly writePlaceholder: string;
}

interface BarOption {
  readonly value: string;
  readonly label: string;
}

/** Everything the bar shows, as plain JSON: YapYap's labels and the assistant's text. */
export interface BarContent {
  readonly visible: boolean;
  readonly labels: BarLabels;
  readonly status: string;
  readonly working: boolean;
  readonly suggestions: readonly string[];
  /** A longer text, such as a summary or exactly what is sent; null for none. */
  readonly result: string | null;
  readonly buttons: readonly {
    readonly id: string;
    readonly label: string;
    readonly primary: boolean;
  }[];
  /** The model in use and the others to switch to, or null before the assistant is set up. */
  readonly choice: {
    readonly current: string;
    readonly options: readonly BarOption[];
  } | null;
  readonly rewrites: readonly BarOption[];
}

/** Where the bar goes and what it keeps, fixed for every render. */
interface BarPlaces {
  /** The open chat's message box row, which the bar sits right above. */
  readonly footer: string;
  /** The adapter world's global that holds the bar between renders. */
  readonly store: string;
  /** The adapter world's global the WhatsApp preload exposes for the bar's actions. */
  readonly bridge: string;
  readonly style: string;
  readonly maxPrompt: number;
}

/** The few DOM features the bar uses; the main process compiles this without DOM types. */
interface BarNode {
  textContent: string | null;
  hidden: boolean;
  disabled: boolean;
  value: string;
  readonly previousElementSibling: unknown;
  readonly style: { order: string; position: string; zIndex: string };
  readonly dataset: Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  append(...nodes: BarNode[]): void;
  replaceChildren(...nodes: BarNode[]): void;
  addEventListener(type: string, listener: (event: BarEvent) => void): void;
  closest(selectors: string): BarNode | null;
  before(node: BarNode): void;
  remove(): void;
  attachShadow(init: { readonly mode: 'closed' }): BarNode;
}

interface BarEvent {
  readonly isTrusted: boolean;
  readonly isComposing?: boolean;
  readonly key?: string;
  readonly target: unknown;
  stopPropagation(): void;
  preventDefault(): void;
}

interface BarDocument {
  querySelector(selectors: string): unknown;
  createElement(tag: string): BarNode;
  createElementNS(namespace: string, tag: string): BarNode;
}

/** The parts of the bar that change with its content. */
interface BarParts {
  readonly bar: BarNode;
  readonly name: BarNode;
  readonly choice: BarNode;
  readonly suggest: BarNode;
  readonly summarize: BarNode;
  readonly rewrite: BarNode;
  /** The ways to rewrite the draft, shown once the rewrite button is pressed. */
  readonly rewrites: BarNode;
  readonly catchUp: BarNode;
  readonly settings: BarNode;
  readonly status: BarNode;
  readonly buttons: BarNode;
  readonly result: BarNode;
  readonly list: BarNode;
  readonly input: BarNode;
}

/** The bar between renders: its host in WhatsApp's page, and what it last showed. */
interface BarStore {
  readonly host: BarNode;
  readonly parts: BarParts;
  key: string | null;
}

type Scope = Record<string, unknown>;

/** The bar's helpers, passed in because each runs as its own source text. */
export interface BarKit {
  readonly align: (scope: Scope, host: BarNode, footer: BarNode) => void;
  readonly build: (doc: BarDocument, scope: Scope, places: BarPlaces, kit: BarKit) => BarStore;
  readonly wire: (
    shadow: BarNode,
    parts: BarParts,
    scope: Scope,
    places: BarPlaces,
    kit: BarKit,
  ) => void;
  readonly fields: (parts: BarParts, scope: Scope, places: BarPlaces) => void;
  readonly label: (parts: BarParts, labels: BarLabels) => void;
  readonly buttons: (
    doc: BarDocument,
    holder: BarNode,
    buttons: BarContent['buttons'],
    action: string,
  ) => void;
  readonly update: (doc: BarDocument, parts: BarParts, content: BarContent, kit: BarKit) => void;
  readonly options: (
    doc: BarDocument,
    select: BarNode,
    options: readonly BarOption[],
    current: string,
  ) => void;
  readonly suggestion: (
    doc: BarDocument,
    text: string,
    index: number,
    labels: BarLabels,
  ) => BarNode;
}

/** Where a render left the bar. */
export type BarPlacement = 'away' | 'kept' | 'placed';

/**
 * Keeps the assistant bar right above the open chat's message box, so the
 * conversation moves up to make room (ADR 0013). Runs in the adapter's
 * isolated world as source text, so it uses only its arguments. WhatsApp
 * drops the bar when it redraws a chat, so every render puts the same bar
 * back; it changes the bar only when its content changed. It reports only
 * where the bar is: away, kept where it was, or placed anew, which a chat
 * WhatsApp drew again, such as another one, makes it.
 */
export function renderAssistantBar(
  doc: BarDocument,
  scope: Scope,
  content: BarContent,
  places: BarPlaces,
  kit: BarKit,
): BarPlacement {
  const footer = doc.querySelector(places.footer) as BarNode | null;
  const kept = scope[places.store] as BarStore | undefined;
  if (!content.visible || footer === null) {
    kept?.host.remove();
    return 'away';
  }
  const store = kept ?? kit.build(doc, scope, places, kit);
  scope[places.store] = store;
  const placed = footer.previousElementSibling !== store.host;
  if (placed) {
    footer.before(store.host);
  }
  kit.align(scope, store.host, footer);
  const key = JSON.stringify(content);
  if (store.key !== key) {
    store.key = key;
    kit.update(doc, store.parts, content, kit);
  }
  return placed ? 'placed' : 'kept';
}

/**
 * Puts the bar where the message box is in WhatsApp's layout. WhatsApp
 * orders the open chat's parts with flexbox `order` and lays a positioned
 * wallpaper over the chat, so the bar takes the message box's order and
 * stacking, read anew on every render in case WhatsApp changes them (#466).
 */
export function alignAssistantBar(scope: Scope, host: BarNode, footer: BarNode): void {
  const computed = scope['getComputedStyle'] as (node: BarNode) => {
    readonly order: string;
    readonly zIndex: string;
  };
  const { order, zIndex } = computed.call(scope, footer);
  host.style.order = order;
  host.style.position = 'relative';
  host.style.zIndex = zIndex;
}

/**
 * Builds the bar in a closed shadow root: WhatsApp's scripts cannot reach
 * into it to read what the assistant wrote, and its styles cannot restyle it.
 */
export function buildAssistantBar(
  doc: BarDocument,
  scope: Scope,
  places: BarPlaces,
  kit: BarKit,
): BarStore {
  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const make = (tag: string, name: string, parent: BarNode, action?: string): BarNode => {
    const node = doc.createElement(tag);
    node.setAttribute('class', name);
    if (action !== undefined) {
      node.dataset['action'] = action;
    }
    parent.append(node);
    return node;
  };
  make('style', 'style', shadow).textContent = places.style;
  const bar = make('section', 'bar', shadow);
  const top = make('div', 'row', bar);
  const line = make('div', 'row line', bar);
  const parts: BarParts = {
    bar,
    name: make('span', 'name', top),
    choice: make('select', 'choice', top),
    suggest: make('button', 'button primary', top, 'suggest'),
    summarize: make('button', 'button', top, 'summarize'),
    rewrite: make('button', 'button', top, 'rewrites'),
    catchUp: make('button', 'button', top, 'catchUp'),
    settings: make('button', 'button gear', top, 'settings'),
    rewrites: make('div', 'row rewrites', bar),
    status: make('output', 'status', line),
    buttons: make('span', 'buttons', line),
    result: make('div', 'result', bar),
    list: make('ul', 'suggestions', bar),
    input: make('input', 'input', bar),
  };
  kit.wire(shadow, parts, scope, places, kit);
  return { host, parts, key: null };
}

/** The bridge's actions, as the adapter world has them once the preload ran. */
type Actions = Record<string, ((value?: unknown) => void) | undefined>;

/**
 * Acts on the user's clicks, never on clicks a page script made up, and
 * keeps typing in the bar from reaching WhatsApp's own keyboard shortcuts.
 * The rewrite button only opens or closes the ways to rewrite, in the bar.
 */
export function wireAssistantBar(
  shadow: BarNode,
  parts: BarParts,
  scope: Scope,
  places: BarPlaces,
  kit: BarKit,
): void {
  const bridge = (): Actions => (scope[places.bridge] ?? {}) as Actions;
  const typing = ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'paste', 'cut', 'copy'];
  for (const type of typing) {
    shadow.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  }
  // A suggestion is named by its index, a button by its ID; the rest take nothing.
  const run = (act: Actions[string], { index, id }: BarNode['dataset']): void => {
    if (index !== undefined) {
      act?.(Number(index));
    } else if (id === undefined) {
      act?.();
    } else {
      act?.(id);
    }
  };
  shadow.addEventListener('click', (event) => {
    const control = event.isTrusted ? (event.target as BarNode).closest('[data-action]') : null;
    if (control === null) {
      return;
    }
    const action = String(control.dataset['action']);
    if (action === 'rewrites') {
      parts.rewrites.hidden = !parts.rewrites.hidden;
      return;
    }
    parts.rewrites.hidden ||= action === 'rewrite';
    run(bridge()[action], control.dataset);
  });
  kit.fields(parts, scope, places);
}

/** Acts on the user's picks in the lists and on Enter in the field, never on made-up events. */
export function wireAssistantFields(parts: BarParts, scope: Scope, places: BarPlaces): void {
  const { input, choice } = parts;
  const bridge = (): Actions => (scope[places.bridge] ?? {}) as Actions;
  const picked = (select: BarNode, action: string) => (event: BarEvent) => {
    if (event.isTrusted && select.value !== '') {
      bridge()[action]?.(select.value);
    }
  };
  choice.addEventListener('change', picked(choice, 'choose'));
  parts.rewrites.hidden = true;
  input.setAttribute('type', 'text');
  input.setAttribute('maxlength', String(places.maxPrompt));
  input.addEventListener('keydown', (event) => {
    const text = input.value;
    if (!event.isTrusted || event.isComposing === true || event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (text.trim() !== '') {
      input.value = '';
      bridge()['prompt']?.(text);
    }
  });
}

/** Shows new content, writing the assistant's text only as text, never as markup. */
export function updateAssistantBar(
  doc: BarDocument,
  parts: BarParts,
  content: BarContent,
  kit: BarKit,
): void {
  const { labels, working } = content;
  kit.label(parts, labels);
  parts.status.textContent = content.status;
  parts.result.textContent = content.result ?? '';
  parts.result.hidden = content.result === null;
  for (const control of [
    parts.suggest,
    parts.summarize,
    parts.catchUp,
    parts.rewrite,
    parts.input,
  ]) {
    control.disabled = working;
  }
  kit.buttons(doc, parts.buttons, content.buttons, 'button');
  const rewrites = content.rewrites.map(({ value, label }) => ({
    label,
    id: value,
    primary: false,
  }));
  kit.buttons(doc, parts.rewrites, rewrites, 'rewrite');
  parts.list.replaceChildren(
    ...content.suggestions.map((text, index) => kit.suggestion(doc, text, index, labels)),
  );
  parts.choice.hidden = content.choice === null;
  parts.choice.disabled = working;
  kit.options(doc, parts.choice, content.choice?.options ?? [], content.choice?.current ?? '');
}

/** YapYap's own words on the bar's controls, in the user's language. */
export function labelAssistantBar(parts: BarParts, labels: BarLabels): void {
  const name = 'aria-label';
  parts.bar.setAttribute(name, labels.label);
  parts.name.textContent = labels.name;
  parts.suggest.textContent = labels.suggest;
  parts.summarize.textContent = labels.summarize;
  parts.catchUp.textContent = labels.catchUp;
  parts.catchUp.setAttribute('title', labels.catchUpLabel);
  parts.settings.setAttribute(name, labels.settings);
  parts.settings.setAttribute('title', labels.settings);
  parts.settings.textContent = '⚙';
  parts.result.setAttribute('tabindex', '0');
  parts.input.setAttribute(name, labels.write);
  parts.input.setAttribute('placeholder', labels.writePlaceholder);
  parts.rewrite.textContent = labels.rewrite;
  parts.rewrite.setAttribute(name, labels.rewriteLabel);
  parts.choice.setAttribute(name, labels.model);
}

/** The buttons under the status line, each naming its action by its ID. */
export function fillAssistantButtons(
  doc: BarDocument,
  holder: BarNode,
  buttons: BarContent['buttons'],
  action: string,
): void {
  holder.replaceChildren(
    ...buttons.map(({ id, label, primary }) => {
      const node = doc.createElement('button');
      node.setAttribute('class', primary ? 'button primary' : 'button');
      node.dataset['action'] = action;
      node.dataset['id'] = id;
      node.textContent = label;
      return node;
    }),
  );
}

/** Fills a list with `options`, as text, and selects `current`. */
export function fillAssistantOptions(
  doc: BarDocument,
  select: BarNode,
  options: readonly BarOption[],
  current: string,
): void {
  select.replaceChildren(
    ...options.map((option) => {
      const node = doc.createElement('option');
      node.setAttribute('value', option.value);
      node.textContent = option.label;
      return node;
    }),
  );
  select.value = current;
}

/** One suggestion: its text puts it in the message box; the arrow sends it, on this click only. */
export function assistantSuggestion(
  doc: BarDocument,
  text: string,
  index: number,
  labels: BarLabels,
): BarNode {
  const item = doc.createElement('li');
  const use = doc.createElement('button');
  const send = doc.createElement('button');
  for (const [button, action] of [
    [use, 'use'],
    [send, 'send'],
  ] as const) {
    button.setAttribute('class', `button ${action}`);
    button.dataset['action'] = action;
    button.dataset['index'] = String(index);
  }
  use.textContent = text;
  use.setAttribute('title', labels.use);
  send.setAttribute('aria-label', labels.sendLabel);
  send.setAttribute('title', labels.sendLabel);
  // A paper plane, drawn rather than written, so it reads in every language.
  const svg = 'http://www.w3.org/2000/svg';
  const icon = doc.createElementNS(svg, 'svg');
  const path = doc.createElementNS(svg, 'path');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', 'M2 8l12-6-4 12-2-5z');
  icon.append(path);
  send.append(icon);
  item.append(use, send);
  return item;
}

/**
 * The bar's own styles, inside its shadow root. They follow the system's
 * light or dark scheme, as WhatsApp does by default, and use logical
 * properties only, so it mirrors for right-to-left languages (ADR 0012).
 */
const BAR_STYLE = `
:host { display: block; color-scheme: light dark; }
[hidden] { display: none !important; }
.bar {
  --text: light-dark(#111b21, #e9edef); --muted: light-dark(#667781, #8696a0);
  --accent: light-dark(#008069, #00a884); --border: light-dark(#d1d7db, #374248);
  --surface: light-dark(#f0f2f5, #202c33);
  display: flex; flex-direction: column; gap: 6px; box-sizing: border-box;
  padding: 8px 12px; border-block-start: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-family: inherit; font-size: 0.9rem;
}
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-inline-size: 0; }
.line { flex-wrap: nowrap; min-block-size: 26px; }
.name { font-weight: 600; }
.status { flex: 1; margin: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; }
.buttons { display: flex; flex: none; gap: 6px; }
.button {
  padding: 3px 12px; border: 1px solid var(--border); border-radius: 999px; background: transparent;
  color: var(--text); font: inherit; cursor: pointer;
}
.button.primary { border-color: var(--accent); background: var(--accent); color: var(--surface); }
.gear { margin-inline-start: auto; padding-inline: 8px; }
.button:disabled, .input:disabled, .choice:disabled { opacity: 0.6; cursor: default; }
.button:focus-visible, .input:focus-visible, .choice:focus-visible, .result:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
.result {
  max-block-size: 160px; overflow-y: auto; padding: 6px 10px; border: 1px solid var(--border);
  border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere;
}
.suggestions {
  display: flex; gap: 8px; margin: 0; padding: 0; overflow-x: auto; list-style: none;
}
.suggestions:empty { display: none; }
li { display: flex; flex: none; max-inline-size: 60%; }
.use {
  overflow: hidden; border-start-end-radius: 0; border-end-end-radius: 0; text-overflow: ellipsis;
  white-space: nowrap;
}
.send {
  display: grid; place-items: center; padding: 3px 10px; border-inline-start: 0;
  border-start-start-radius: 0; border-end-start-radius: 0; color: var(--accent);
}
svg { inline-size: 14px; block-size: 14px; fill: currentColor; }
.choice {
  max-inline-size: 40%; padding: 2px 8px; border: 1px solid var(--border); border-radius: 999px;
  background: transparent; color: var(--text); font: inherit;
}
.input {
  box-sizing: border-box; inline-size: 100%; padding: 5px 12px; border: 1px solid var(--border);
  border-radius: 999px; background: transparent; color: var(--text); font: inherit;
}
`;

/** Longest request a user can type in the bar; the main process checks it again. */
export const MAX_PROMPT = 2000;

const PLACES: BarPlaces = {
  footer: LANDMARKS.composerFooter,
  store: 'yapyapAssistantBarView',
  bridge: ASSISTANT_BAR_BRIDGE,
  style: BAR_STYLE,
  maxPrompt: MAX_PROMPT,
};

/** The render as code for `executeJavaScriptInIsolatedWorld`, with the content as JSON. */
export function assistantBarRender(content: BarContent): string {
  const kit = [
    `align: ${alignAssistantBar.toString()}`,
    `build: ${buildAssistantBar.toString()}`,
    `wire: ${wireAssistantBar.toString()}`,
    `fields: ${wireAssistantFields.toString()}`,
    `label: ${labelAssistantBar.toString()}`,
    `buttons: ${fillAssistantButtons.toString()}`,
    `update: ${updateAssistantBar.toString()}`,
    `options: ${fillAssistantOptions.toString()}`,
    `suggestion: ${assistantSuggestion.toString()}`,
  ].join(', ');
  return `(${renderAssistantBar.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
