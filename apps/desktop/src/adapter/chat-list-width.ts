import {
  CHAT_LIST_BRIDGE,
  MAX_CHAT_LIST_WIDTH,
  MIN_CHAT_LIST_WIDTH,
} from '../shared/chat-list-api.ts';
import { LANDMARKS } from './page-state.ts';

/** YapYap's own words on the divider, in the user's language. */
interface ListLabels {
  readonly label: string;
  readonly hint: string;
}

/** What a render applies, as plain JSON. */
export interface ListContent {
  /** The account's width in CSS pixels, or null for WhatsApp's own. */
  readonly width: number | null;
  readonly labels: ListLabels;
}

/** Where the divider goes and how it behaves, fixed for every render. */
interface ListPlaces {
  /** The chat list, whose parent is the column WhatsApp sizes. */
  readonly side: string;
  /** The adapter world's global that holds the divider between renders. */
  readonly store: string;
  /** The adapter world's global the WhatsApp preload exposes for the divider. */
  readonly bridge: string;
  readonly style: string;
  readonly min: number;
  readonly max: number;
  /** The largest share of WhatsApp's width the list takes, so the open chat keeps room. */
  readonly share: number;
  /** How far one arrow key moves the divider. */
  readonly step: number;
}

/** The inline styles YapYap sets on WhatsApp's column, and on the divider's host. */
interface ListStyle {
  flex: string;
  maxInlineSize: string;
  minInlineSize: string;
  order: string;
  position: string;
  zIndex: string;
}

/** WhatsApp's own inline sizing of its column, which a reset puts back. */
interface ListSizing {
  readonly flex: string;
  readonly maxInlineSize: string;
  readonly minInlineSize: string;
}

/** The few DOM features the divider uses; the main process compiles this without DOM types. */
interface ListNode {
  textContent: string | null;
  readonly parentElement: ListNode | null;
  readonly nextElementSibling: ListNode | null;
  readonly style: ListStyle;
  setAttribute(name: string, value: string): void;
  append(...nodes: ListNode[]): void;
  after(node: ListNode): void;
  remove(): void;
  addEventListener(type: string, listener: (event: ListEvent) => void): void;
  attachShadow(init: { readonly mode: 'closed' }): ListNode;
  getBoundingClientRect(): { readonly width: number };
  setPointerCapture(pointerId: number): void;
  focus(): void;
}

interface ListEvent {
  readonly isTrusted: boolean;
  readonly key?: string;
  readonly button?: number;
  readonly clientX?: number;
  readonly pointerId?: number;
  stopPropagation(): void;
  preventDefault(): void;
}

interface ListDocument {
  querySelector(selectors: string): unknown;
  createElement(tag: string): ListNode;
}

/** The list's width now, and how narrow and wide it may go at this window size. */
interface ListBounds {
  readonly now: number;
  readonly min: number;
  readonly max: number;
}

/** A drag in progress: where it started, and the width it has reached. */
interface ListDrag {
  readonly x: number;
  readonly from: number;
  /** -1 in right-to-left layouts, where the list grows to the left. */
  readonly sign: number;
  width: number;
}

/** The divider between renders, and the column it sizes. */
interface ListStore {
  readonly host: ListNode;
  readonly divider: ListNode;
  column: ListNode;
  /** WhatsApp's own inline values, kept while YapYap overrides them, so a reset restores them. */
  saved: ListSizing | null;
  /** What the user picked here that the main process has not sent back yet, a null width resetting. */
  pending: { readonly width: number | null } | null;
  drag: ListDrag | null;
}

type Scope = Record<string, unknown>;

type Styles = (node: ListNode) => {
  readonly order: string;
  readonly zIndex: string;
  readonly direction: string;
};

/** The divider's helpers, passed in because each runs as its own source text. */
interface ListKit {
  readonly build: (
    doc: ListDocument,
    scope: Scope,
    column: ListNode,
    places: ListPlaces,
    kit: ListKit,
  ) => ListStore;
  readonly place: (scope: Scope, store: ListStore, column: ListNode) => void;
  readonly apply: (
    store: ListStore,
    width: number | null,
    places: ListPlaces,
    kit: ListKit,
  ) => void;
  readonly drag: (store: ListStore, scope: Scope, places: ListPlaces, kit: ListKit) => void;
  readonly keys: (store: ListStore, scope: Scope, places: ListPlaces, kit: ListKit) => void;
  readonly choose: (
    store: ListStore,
    scope: Scope,
    width: number | null,
    places: ListPlaces,
    kit: ListKit,
  ) => void;
  readonly size: (store: ListStore, width: number | null, places: ListPlaces, kit: ListKit) => void;
  readonly measure: (store: ListStore, places: ListPlaces) => ListBounds;
  readonly clamp: (width: number, bounds: ListBounds) => number;
  readonly key: (
    key: string,
    bounds: ListBounds,
    rtl: boolean,
    step: number,
  ) => number | null | undefined;
}

/**
 * Sizes the chat list to the account's width and keeps YapYap's divider on
 * its edge (#79). Runs in the adapter's isolated world as source text, so it
 * uses only its arguments. WhatsApp can redraw its columns, so every render
 * puts the same divider back and sets the width again; a width the user has
 * just picked here wins until the main process sends it back. It reports
 * only whether the divider is on the page.
 */
export function renderChatListWidth(
  doc: ListDocument,
  scope: Scope,
  content: ListContent,
  places: ListPlaces,
  kit: ListKit,
): boolean {
  const side = doc.querySelector(places.side) as ListNode | null;
  const column = side?.parentElement ?? null;
  const kept = scope[places.store] as ListStore | undefined;
  if (column === null) {
    kept?.host.remove();
    return false;
  }
  const store = kept ?? kit.build(doc, scope, column, places, kit);
  scope[places.store] = store;
  kit.place(scope, store, column);
  store.divider.setAttribute('aria-label', content.labels.label);
  store.divider.setAttribute('title', content.labels.hint);
  kit.apply(store, content.width, places, kit);
  return true;
}

/**
 * Sets the account's width, unless the user is dragging, or picked a width
 * here that the main process has not sent back yet: a render that started
 * before the pick must not undo it.
 */
export function applyChatListWidth(
  store: ListStore,
  width: number | null,
  places: ListPlaces,
  kit: ListKit,
): void {
  if (store.pending?.width === width) {
    store.pending = null;
  }
  if (store.drag === null) {
    kit.size(store, (store.pending ?? { width }).width, places, kit);
  }
}

/**
 * Puts the divider right after the list's column, in WhatsApp's layout. The
 * columns are flex items that WhatsApp may order with `order`, so the
 * divider takes the column's; and it is raised above both columns, so the
 * conversation's wallpaper and layers never take its pointer (#483).
 */
export function placeChatListDivider(scope: Scope, store: ListStore, column: ListNode): void {
  if (store.column !== column) {
    store.column = column;
    store.saved = null;
  }
  if (column.nextElementSibling !== store.host) {
    column.after(store.host);
  }
  const styles = scope['getComputedStyle'] as Styles;
  const layers = [column, store.host.nextElementSibling].map((node) =>
    node === null ? 0 : Number(styles.call(scope, node).zIndex) || 0,
  );
  store.host.style.order = styles.call(scope, column).order;
  store.host.style.position = 'relative';
  store.host.style.zIndex = String(Math.max(...layers) + 1);
}

/**
 * Builds the divider in a closed shadow root, so WhatsApp's scripts cannot
 * reach into it and its styles cannot restyle it.
 */
export function buildChatListDivider(
  doc: ListDocument,
  scope: Scope,
  column: ListNode,
  places: ListPlaces,
  kit: ListKit,
): ListStore {
  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = places.style;
  const divider = doc.createElement('div');
  divider.setAttribute('class', 'divider');
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('tabindex', '0');
  shadow.append(style, divider);
  const store: ListStore = { host, divider, column, saved: null, pending: null, drag: null };
  kit.drag(store, scope, places, kit);
  kit.keys(store, scope, places, kit);
  return store;
}

/**
 * Drags the divider with the mouse, acting only on the user's own pointer
 * events. The list follows the pointer, and the width is kept once, when
 * the button goes up.
 */
export function wireChatListDrag(
  store: ListStore,
  scope: Scope,
  places: ListPlaces,
  kit: ListKit,
): void {
  const { divider } = store;
  divider.addEventListener('pointerdown', (event) => {
    if (!event.isTrusted || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const styles = scope['getComputedStyle'] as Styles;
    const from = kit.measure(store, places).now;
    const sign = styles.call(scope, store.column).direction === 'rtl' ? -1 : 1;
    store.drag = { from, sign, x: Number(event.clientX), width: from };
    divider.setPointerCapture(Number(event.pointerId));
    // Holding the pointer back from WhatsApp, so the drag selects no text, also keeps the focus where it was.
    divider.focus();
  });
  divider.addEventListener('pointermove', (event) => {
    const { drag } = store;
    if (event.isTrusted && drag !== null) {
      const moved = drag.sign * (Number(event.clientX) - drag.x);
      drag.width = kit.clamp(drag.from + moved, kit.measure(store, places));
      kit.size(store, drag.width, places, kit);
    }
  });
  const drop = (event: ListEvent): void => {
    const { drag } = store;
    store.drag = event.isTrusted ? null : drag;
    if (event.isTrusted && drag !== null && drag.width !== drag.from) {
      kit.choose(store, scope, drag.width, places, kit);
    }
  };
  divider.addEventListener('pointerup', drop);
  divider.addEventListener('pointercancel', drop);
}

/**
 * Resizes with the keyboard, as a separator does: arrows move the divider,
 * Home and End go to the narrowest and widest, and Enter, like a
 * double-click, goes back to WhatsApp's own width. Keys stop at the shadow
 * root, so WhatsApp's own shortcuts never take them.
 */
export function wireChatListKeys(
  store: ListStore,
  scope: Scope,
  places: ListPlaces,
  kit: ListKit,
): void {
  for (const type of ['keypress', 'keyup']) {
    store.divider.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  }
  store.divider.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const styles = scope['getComputedStyle'] as Styles;
    const rtl = styles.call(scope, store.column).direction === 'rtl';
    const width = event.isTrusted
      ? kit.key(String(event.key), kit.measure(store, places), rtl, places.step)
      : undefined;
    if (width !== undefined) {
      event.preventDefault();
      kit.choose(store, scope, width, places, kit);
    }
  });
  store.divider.addEventListener('dblclick', (event) => {
    if (event.isTrusted) {
      kit.choose(store, scope, null, places, kit);
    }
  });
}

/** Shows the user's pick at once, and has the main process keep it for this account. */
export function chooseChatListWidth(
  store: ListStore,
  scope: Scope,
  width: number | null,
  places: ListPlaces,
  kit: ListKit,
): void {
  type Actions = Record<string, ((width?: number) => void) | undefined>;
  const bridge = (scope[places.bridge] ?? {}) as Actions;
  store.pending = { width };
  kit.size(store, width, places, kit);
  if (width === null) {
    bridge['reset']?.();
  } else {
    bridge['resize']?.(width);
  }
}

/**
 * Sets the column's width, or gives WhatsApp back its own. The minimum and
 * maximum keep the list within its bounds as the window changes size
 * between renders, so the open chat always has room; the minimum wins in a
 * window too narrow for both.
 */
export function sizeChatList(
  store: ListStore,
  width: number | null,
  places: ListPlaces,
  kit: ListKit,
): void {
  const { column, saved } = store;
  const { style } = column;
  if (width === null) {
    if (saved !== null) {
      style.flex = saved.flex;
      style.maxInlineSize = saved.maxInlineSize;
      style.minInlineSize = saved.minInlineSize;
      store.saved = null;
    }
  } else {
    const { flex, maxInlineSize, minInlineSize } = style;
    store.saved = saved ?? { flex, maxInlineSize, minInlineSize };
    style.flex = `0 0 ${String(width)}px`;
    style.maxInlineSize = `${String(places.share * 100)}%`;
    style.minInlineSize = `${String(places.min)}px`;
  }
  const bounds = kit.measure(store, places);
  store.divider.setAttribute('aria-valuenow', String(bounds.now));
  store.divider.setAttribute('aria-valuemin', String(bounds.min));
  store.divider.setAttribute('aria-valuemax', String(bounds.max));
}

/** The list's width, and its bounds within WhatsApp's width right now. */
export function measureChatList(store: ListStore, places: ListPlaces): ListBounds {
  const whole = store.column.parentElement?.getBoundingClientRect().width ?? 0;
  const max = Math.min(places.max, Math.floor(whole * places.share));
  return {
    now: Math.round(store.column.getBoundingClientRect().width),
    min: places.min,
    max: Math.max(places.min, max),
  };
}

/** A width within the bounds, in whole pixels. */
export function clampChatListWidth(width: number, bounds: ListBounds): number {
  return Math.min(Math.max(Math.round(width), bounds.min), bounds.max);
}

/**
 * The width a key asks for: a number, null to go back to WhatsApp's own, or
 * undefined for a key the divider leaves alone. In right-to-left layouts
 * the list sits on the right, so the left arrow widens it.
 */
export function chatListKey(
  key: string,
  bounds: ListBounds,
  rtl: boolean,
  step: number,
): number | null | undefined {
  const wider = rtl ? 'ArrowLeft' : 'ArrowRight';
  const narrower = rtl ? 'ArrowRight' : 'ArrowLeft';
  const widths: Record<string, number | null> = {
    [wider]: bounds.now + step,
    [narrower]: bounds.now - step,
    Home: bounds.min,
    End: bounds.max,
    Enter: null,
  };
  if (!Object.hasOwn(widths, key)) {
    return undefined;
  }
  const width = widths[key] ?? null;
  return width === null ? null : Math.min(Math.max(width, bounds.min), bounds.max);
}

/**
 * The divider's own styles, inside its shadow root. The host takes no room
 * in WhatsApp's layout; the divider straddles the edge between the columns,
 * shows only while pointed at or focused, and uses logical properties only,
 * so it sits on the left of the list in right-to-left languages (ADR 0012).
 */
const LIST_STYLE = `
:host { display: block; flex: none; align-self: stretch; inline-size: 0; color-scheme: light dark; }
.divider {
  position: absolute; inset-block: 0; inset-inline-start: -3px; inline-size: 6px;
  cursor: col-resize; touch-action: none; background: transparent;
}
.divider:hover { background: light-dark(rgb(0 128 105 / 30%), rgb(0 168 132 / 40%)); }
.divider:focus-visible {
  background: light-dark(rgb(0 128 105 / 30%), rgb(0 168 132 / 40%));
  outline: 2px solid light-dark(#008069, #00a884); outline-offset: -2px;
}
`;

const PLACES: ListPlaces = {
  side: LANDMARKS.chatColumn,
  store: 'yapyapChatListView',
  bridge: CHAT_LIST_BRIDGE,
  style: LIST_STYLE,
  min: MIN_CHAT_LIST_WIDTH,
  max: MAX_CHAT_LIST_WIDTH,
  share: 0.6,
  step: 16,
};

/** The render as code for `executeJavaScriptInIsolatedWorld`, with the content as JSON. */
export function chatListWidthRender(content: ListContent): string {
  const kit = [
    `build: ${buildChatListDivider.toString()}`,
    `place: ${placeChatListDivider.toString()}`,
    `apply: ${applyChatListWidth.toString()}`,
    `drag: ${wireChatListDrag.toString()}`,
    `keys: ${wireChatListKeys.toString()}`,
    `choose: ${chooseChatListWidth.toString()}`,
    `size: ${sizeChatList.toString()}`,
    `measure: ${measureChatList.toString()}`,
    `clamp: ${clampChatListWidth.toString()}`,
    `key: ${chatListKey.toString()}`,
  ].join(', ');
  return `(${renderChatListWidth.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
