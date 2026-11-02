import { LANDMARKS } from './page-state.ts';

interface ChatRow {
  querySelector(selectors: string): { readonly textContent: string | null } | null;
  dispatchEvent(event: unknown): boolean;
}

interface ChatListDocument {
  querySelectorAll(selectors: string): ArrayLike<unknown>;
}

interface OpenPlaces {
  readonly chatRow: string;
  readonly chatTitle: string;
}

/**
 * Opens the chat named exactly `name` from the chat list, as a click on its
 * row would, for an AI agent whose token lists that chat (ADR 0019). The
 * list is virtualized, so only chats near the top can be found. It runs
 * inside the page as source text, so it must stay self-contained, and
 * reports only whether it found the chat.
 */
export function openChat(
  doc: ChatListDocument,
  places: OpenPlaces,
  name: string,
  makeEvent: (type: string) => unknown,
): boolean {
  const rows = Array.from(doc.querySelectorAll(places.chatRow)) as ChatRow[];
  const row = rows.find(
    (candidate) => candidate.querySelector(places.chatTitle)?.textContent?.trim() === name,
  );
  if (row === undefined) {
    return false;
  }
  // WhatsApp opens a chat on the press, older pages on the click; both come.
  for (const type of ['mousedown', 'mouseup', 'click']) {
    row.dispatchEvent(makeEvent(type));
  }
  return true;
}

/** The opener as code for `executeJavaScriptInIsolatedWorld`, for the chat named `name`. */
export function chatOpener(name: string): string {
  const places: OpenPlaces = { chatRow: LANDMARKS.chatRow, chatTitle: LANDMARKS.chatTitle };
  const makeEvent =
    '(type) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })';
  return `(${openChat.toString()})(document, ${JSON.stringify(places)}, ${JSON.stringify(name)}, ${makeEvent})`;
}
