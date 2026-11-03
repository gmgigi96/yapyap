import { LANDMARKS } from './page-state.ts';

interface ChatRow {
  querySelector(selectors: string): { readonly textContent: string | null } | null;
  dispatchEvent(event: unknown): boolean;
}

interface ChatList {
  scrollTop: number;
  readonly clientHeight: number;
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
export type OpenStep = 'opened' | 'scrolled' | 'end';

/**
 * One step of opening the chat named exactly `name`, for an AI agent whose
 * token lists that chat (ADR 0019). The chat list is virtualized: only rows
 * near what is on screen exist. So when the chat's row is not there, this
 * scrolls the list down by most of a screen, which makes WhatsApp load the
 * next rows, and the caller looks again once they are in. It runs inside
 * the page as source text, so it must stay self-contained, and reports
 * only what it did.
 */
export function openChatStep(
  doc: ChatListDocument,
  places: OpenPlaces,
  name: string,
  makeEvent: (type: string) => unknown,
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
  const list = doc.querySelector(places.chatList) as ChatList | null;
  if (list === null) {
    return 'end';
  }
  const before = list.scrollTop;
  // A little overlap, so a row cut at the edge is whole in the next look.
  list.scrollTop = before + Math.max(1, Math.floor(list.clientHeight * 0.8));
  return list.scrollTop > before ? 'scrolled' : 'end';
}

/** Puts the chat list back at its top, as people expect to find it. */
export function chatListToTop(
  doc: Pick<ChatListDocument, 'querySelector'>,
  selector: string,
): boolean {
  const list = doc.querySelector(selector) as ChatList | null;
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

/** One step of the opener as code for `executeJavaScriptInIsolatedWorld`. */
export function chatOpenerStep(name: string): string {
  const makeEvent =
    '(type) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })';
  return `(${openChatStep.toString()})(document, ${JSON.stringify(PLACES)}, ${JSON.stringify(name)}, ${makeEvent})`;
}

/** Scrolling the chat list to its top, as code for `executeJavaScriptInIsolatedWorld`. */
export const CHAT_LIST_TO_TOP = `(${chatListToTop.toString()})(document, ${JSON.stringify(LANDMARKS.chatList)})`;

/** The step's answer, or 'end' for anything else the page made of it. */
export function parseOpenStep(value: unknown): OpenStep {
  return value === 'opened' || value === 'scrolled' ? value : 'end';
}
