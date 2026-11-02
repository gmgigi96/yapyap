import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { LANDMARKS } from './page-state.ts';

/** The most chats the assistant receives, from the top of the list. */
const MAX_CHATS = 20;
/** Longest chat name the assistant receives. */
const MAX_NAME = 256;
/** Longest last-message preview the assistant receives; a longer one is cut. */
const MAX_TEXT = 1024;
/** The highest count a badge can show that the reader accepts, as the page title's count. */
const MAX_UNREAD = 999_999;

interface Part {
  readonly textContent: string | null;
  cloneNode(deep: boolean): Part;
  querySelectorAll(selectors: string): ArrayLike<{ remove(): void }>;
}

interface Row {
  querySelector(selectors: string): unknown;
  getBoundingClientRect(): { readonly y: number };
}

interface SummaryDocument {
  querySelectorAll(selectors: string): ArrayLike<unknown>;
}

interface SummaryPlaces {
  readonly chat: string;
  readonly unreadCount: string;
  readonly chatTitle: string;
  readonly chatPreview: string;
  /** What a name or preview may hold besides its own text: the badge and the time. */
  readonly extras: string;
}

interface SummaryLimits {
  readonly chats: number;
  readonly name: number;
  readonly text: number;
}

/**
 * Reads the chat list as plain data: each unread chat's name, its unread
 * count and its last message's preview, top of the list first. It never
 * opens a chat, since opening one marks it read and tells the people who
 * wrote that it was. So the preview is all it has of a chat's messages. Like
 * the open chat's reader, it returns page text, so it runs only when the
 * assistant asks, and its result is never logged. It runs inside the page as source text, so it must
 * stay self-contained. A row without a badge of digits is not unread.
 */
export function readUnreadSummary(
  doc: SummaryDocument,
  places: SummaryPlaces,
  limits: SummaryLimits,
): unknown {
  const textOf = (part: unknown, length: number): string => {
    if (part === null) {
      return '';
    }
    const copy = (part as Part).cloneNode(true);
    for (const extra of Array.from(copy.querySelectorAll(places.extras))) {
      extra.remove();
    }
    return String(copy.textContent).replace(/\s+/g, ' ').trim().slice(0, length);
  };
  const countOf = (row: Row): number => {
    const badge = row.querySelector(places.unreadCount) as Part | null;
    const digits = String(badge?.textContent).trim();
    return /^\d{1,6}$/.test(digits) ? Number(digits) : 0;
  };
  // The list is virtualized and reuses its rows, so their order in the page
  // is not the order on screen; their position is.
  const unread = (Array.from(doc.querySelectorAll(places.chat)) as Row[])
    .map((row) => ({ row, unread: countOf(row), y: row.getBoundingClientRect().y }))
    .filter((chat) => chat.unread > 0)
    .sort((one, other) => one.y - other.y)
    .slice(0, limits.chats);
  return unread.map(({ row, unread: count }) => {
    const text = textOf(row.querySelector(places.chatPreview), limits.text);
    return {
      name: textOf(row.querySelector(places.chatTitle), limits.name),
      unread: count,
      messages: text === '' ? [] : [{ outgoing: false, text }],
    };
  });
}

/** The reader as code for `executeJavaScriptInIsolatedWorld`. */
export function unreadSummaryReader(): string {
  const places: SummaryPlaces = {
    chat: LANDMARKS.chatRow,
    unreadCount: LANDMARKS.unreadCount,
    chatTitle: LANDMARKS.chatTitle,
    chatPreview: LANDMARKS.chatPreview,
    extras: `${LANDMARKS.unreadCount}, ${LANDMARKS.chatTimestamp}`,
  };
  const limits: SummaryLimits = { chats: MAX_CHATS, name: MAX_NAME, text: MAX_TEXT };
  return `(${readUnreadSummary.toString()})(document, ${JSON.stringify(places)}, ${JSON.stringify(limits)})`;
}

const UnreadSummarySchema = Type.Array(
  Type.Object(
    {
      name: Type.String({ maxLength: MAX_NAME }),
      unread: Type.Integer({ minimum: 1, maximum: MAX_UNREAD }),
      messages: Type.Array(
        Type.Object(
          {
            outgoing: Type.Literal(false),
            text: Type.String({ minLength: 1, maxLength: MAX_TEXT }),
          },
          { additionalProperties: false },
        ),
        { maxItems: 1 },
      ),
    },
    { additionalProperties: false },
  ),
  { maxItems: MAX_CHATS },
);

/** What the assistant receives of a chat with unread messages. */
export interface UnreadSummaryChat {
  readonly name: string;
  readonly unread: number;
  readonly messages: readonly { readonly outgoing: boolean; readonly text: string }[];
}

/** Accepts only the exact shape the reader returns; undefined for anything else the page made of it. */
export function parseUnreadSummary(value: unknown): readonly UnreadSummaryChat[] | undefined {
  return Value.Check(UnreadSummarySchema, value) ? value : undefined;
}
