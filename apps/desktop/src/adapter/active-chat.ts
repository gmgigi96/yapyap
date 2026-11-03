import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { LANDMARKS } from './page-state.ts';

/** Longest message text the assistant receives; a longer message is cut. */
const MAX_TEXT = 4096;
/** Longest chat name the assistant receives. */
const MAX_NAME = 256;

interface ReadElement {
  readonly textContent: string | null;
  readonly innerText?: string;
  readonly dataset?: { readonly id?: string };
  querySelector(selectors: string): unknown;
  closest(selectors: string): unknown;
}

interface ReadDocument {
  querySelector(selectors: string): unknown;
  querySelectorAll(selectors: string): Iterable<unknown> & ArrayLike<unknown>;
}

interface ChatPlaces {
  readonly conversation: string;
  readonly chatName: string;
  readonly message: string;
  readonly messageText: string;
  readonly messageBody: string;
  readonly outgoing: string;
  readonly author: string;
  readonly quoted: string;
}

interface Limits {
  readonly messages: number;
  readonly text: number;
  readonly name: number;
}

/**
 * Reads the open chat as plain data: its name, whether it is a group, and
 * the text of its last `limits.messages` messages, oldest first. Unlike the
 * probes, it returns page text, so it runs only when the assistant asks,
 * and its result is never logged.
 * It runs inside the page as source text, so it must stay self-contained.
 * Messages without text, such as photos, are left out.
 */
export function readActiveChat(doc: ReadDocument, places: ChatPlaces, limits: Limits): unknown {
  if (doc.querySelector(places.conversation) === null) {
    return null;
  }
  const textOf = (element: unknown): string => {
    const found = element as ReadElement | null;
    return (found?.innerText ?? found?.textContent ?? '').trim();
  };
  const idOf = (row: ReadElement): string => row.dataset?.id ?? '';
  // WhatsApp once marked the account's own messages by their ID, and now
  // only by the tail and delivery status they alone have (#410).
  const outgoing = (row: ReadElement): boolean =>
    idOf(row).startsWith('true_') || row.querySelector(places.outgoing) !== null;
  const rows = Array.from(doc.querySelectorAll(places.message)) as ReadElement[];
  const messages = rows.flatMap((row) => {
    const body = row.querySelector(places.messageBody) ?? row.querySelector(places.messageText);
    const text = textOf(body).slice(0, limits.text);
    return text === '' ? [] : [{ outgoing: outgoing(row), text }];
  });
  return {
    name: textOf(doc.querySelector(places.chatName)).slice(0, limits.name),
    // IDs named a group's chat until WhatsApp made them bare; now only groups
    // show a sender's name outside a quoted message (#410).
    group:
      rows.some((row) => idOf(row).includes('@g.us')) ||
      (
        Array.from(doc.querySelectorAll(`${places.message} ${places.author}`)) as ReadElement[]
      ).some((name) => name.closest(places.quoted) === null),
    messages: messages.slice(-limits.messages),
  };
}

const PLACES: ChatPlaces = {
  conversation: LANDMARKS.conversation,
  chatName: LANDMARKS.chatName,
  message: LANDMARKS.message,
  messageText: LANDMARKS.messageText,
  messageBody: LANDMARKS.messageBody,
  outgoing: LANDMARKS.outgoing,
  author: LANDMARKS.author,
  quoted: LANDMARKS.quoted,
};

/** The reader as code for `executeJavaScriptInIsolatedWorld`, for the last `messages` messages. */
export function activeChatReader(messages: number): string {
  const limits: Limits = { messages, text: MAX_TEXT, name: MAX_NAME };
  return `(${readActiveChat.toString()})(document, ${JSON.stringify(PLACES)}, ${JSON.stringify(limits)})`;
}

const ActiveChatSchema = Type.Object(
  {
    name: Type.String({ maxLength: MAX_NAME }),
    group: Type.Boolean(),
    messages: Type.Array(
      Type.Object(
        { outgoing: Type.Boolean(), text: Type.String({ minLength: 1, maxLength: MAX_TEXT }) },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

/** What the assistant receives of the open chat. */
export interface ReadChat {
  readonly name: string;
  readonly group: boolean;
  readonly messages: readonly { readonly outgoing: boolean; readonly text: string }[];
}

/**
 * Accepts only the exact shape the reader returns, with no more than
 * `messages` messages: null when no chat is open, undefined for anything
 * else the page made of it.
 */
export function parseActiveChat(value: unknown, messages: number): ReadChat | null | undefined {
  if (value === null) {
    return null;
  }
  return Value.Check(ActiveChatSchema, value) && value.messages.length <= messages
    ? value
    : undefined;
}
