import { LANDMARKS } from './page-state.ts';

interface ChatRow {
  querySelector(selectors: string): { readonly textContent: string | null } | null;
  dispatchEvent(event: unknown): boolean;
}

/** An element that may scroll, as far as finding and moving the chat list goes. */
interface Scroller {
  scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly parentElement: Scroller | null;
}

interface ChatListDocument {
  querySelector(selectors: string): unknown;
  querySelectorAll(selectors: string): ArrayLike<unknown>;
}

interface OpenPlaces {
  readonly chatList: string;
  readonly chatRow: string;
  readonly chatTitle: string;
}

/**
 * What one step of looking for a chat did: opened it, loaded more of the
 * list to look again, or reached the list's end without it.
 */
type OpenStep = 'opened' | 'scrolled' | 'end';

/**
 * The element that scrolls the chat list: the nearest one around a chat
 * row whose content overflows and that the page lets scroll. Which box
 * scrolls is a layout detail WhatsApp is free to change, unlike the rows,
 * so the list is found from a row rather than named; without rows,
 * `#pane-side` itself. It runs inside the page as source text, so it must
 * stay self-contained.
 */
export function chatScroller(
  doc: Pick<ChatListDocument, 'querySelector'>,
  places: Pick<OpenPlaces, 'chatList' | 'chatRow'>,
  scrolls: (element: unknown) => boolean,
): Scroller | null {
  let node = doc.querySelector(places.chatRow) as Scroller | null;
  while (node !== null) {
    if (node.scrollHeight > node.clientHeight && scrolls(node)) {
      return node;
    }
    node = node.parentElement;
  }
  return doc.querySelector(places.chatList) as Scroller | null;
}

/**
 * One step of opening the chat named exactly `name`, for an AI agent whose
 * token lists that chat (ADR 0019). The chat list is virtualized: only rows
 * near what is on screen exist. So when the chat's row is not there, this
 * scrolls `list` down by most of a screen, which makes WhatsApp load the
 * next rows, and the caller looks again once they are in. It runs inside
 * the page as source text, so it must stay self-contained, and reports
 * only what it did.
 */
export function openChatStep(
  doc: Pick<ChatListDocument, 'querySelectorAll'>,
  places: Pick<OpenPlaces, 'chatRow' | 'chatTitle'>,
  name: string,
  makeEvent: (type: string) => unknown,
  list: Pick<Scroller, 'scrollTop' | 'clientHeight'> | null,
): OpenStep {
  const rows = Array.from(doc.querySelectorAll(places.chatRow)) as ChatRow[];
  const row = rows.find(
    (candidate) => candidate.querySelector(places.chatTitle)?.textContent?.trim() === name,
  );
  if (row !== undefined) {
    // WhatsApp opens a chat on the press, older pages on the click; both come.
    for (const type of ['mousedown', 'mouseup', 'click']) {
      row.dispatchEvent(makeEvent(type));
    }
    return 'opened';
  }
  if (list === null) {
    return 'end';
  }
  // Less than a screen, so a row cut at the edge is whole in the next look.
  // Declared here, not at module level, because the step runs as source text.
  const scrollShare = 0.8;
  const before = list.scrollTop;
  list.scrollTop = before + Math.max(1, Math.floor(list.clientHeight * scrollShare));
  return list.scrollTop > before ? 'scrolled' : 'end';
}

/** Puts the chat list back at its top, as people expect to find it. */
export function chatListToTop(list: Pick<Scroller, 'scrollTop'> | null): boolean {
  if (list === null) {
    return false;
  }
  list.scrollTop = 0;
  return true;
}

const PLACES: OpenPlaces = {
  chatList: LANDMARKS.chatList,
  chatRow: LANDMARKS.chatRow,
  chatTitle: LANDMARKS.chatTitle,
};

/** Whether the page lets an element scroll up and down, from its computed style. */
const SCROLLS = '(element) => /(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY)';

/** The chat list's scrolling element, found in the page. */
const SCROLLER = `(${chatScroller.toString()})(document, ${JSON.stringify(PLACES)}, ${SCROLLS})`;

/** One step of the opener as code for `executeJavaScriptInIsolatedWorld`. */
export function chatOpenerStep(name: string): string {
  const makeEvent =
    '(type) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })';
  return `(${openChatStep.toString()})(document, ${JSON.stringify(PLACES)}, ${JSON.stringify(name)}, ${makeEvent}, ${SCROLLER})`;
}

/** Scrolling the chat list to its top, as code for `executeJavaScriptInIsolatedWorld`. */
export const CHAT_LIST_TO_TOP = `(${chatListToTop.toString()})(${SCROLLER})`;

/** The step's answer, or 'end' for anything else the page made of it. */
export function parseOpenStep(value: unknown): OpenStep {
  return value === 'opened' || value === 'scrolled' ? value : 'end';
}
