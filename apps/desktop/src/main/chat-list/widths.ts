import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { MAX_CHAT_LIST_WIDTH, MIN_CHAT_LIST_WIDTH } from '../../shared/chat-list-api.ts';
import { readChecked, type TextFile } from '../support/atomic-write.ts';

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const FORMAT_VERSION = 1;
/** As many accounts as `accounts.json` holds. */
const MAX_ACCOUNTS = 32;

const WidthSchema = Type.Integer({ minimum: MIN_CHAT_LIST_WIDTH, maximum: MAX_CHAT_LIST_WIDTH });

const WidthsSchema = Type.Object(
  {
    version: Type.Literal(FORMAT_VERSION),
    // TypeBox ignores a Record key schema's limits; `propertyNames` enforces them.
    widths: Type.Record(Type.String(), WidthSchema, {
      maxProperties: MAX_ACCOUNTS,
      propertyNames: { pattern: UUID },
    }),
  },
  { additionalProperties: false },
);

/** Whether a width is one the main process keeps: whole pixels, within bounds. */
export const isChatListWidth = (value: unknown): value is number => Value.Check(WidthSchema, value);

/** Each account's chat list width, kept in `chat-list.json` (#79). */
export interface ChatListWidths {
  /** The account's width, or undefined for WhatsApp's own. */
  readonly get: (account: string) => number | undefined;
  /** Keeps a width for the account; undefined goes back to WhatsApp's own. */
  readonly set: (account: string, width: number | undefined) => void;
  /** Drops a removed account's width. */
  readonly forget: (account: string) => void;
}

/**
 * The widths, read once and written whenever one changes. They are state,
 * like the window's size in `window-state.json`, not a preference: kept
 * apart from settings, so dragging a divider never rewrites them, and apart
 * from `accounts.json`, which the Accounts window edits. A write that fails
 * keeps the width for this run.
 */
export function chatListWidths(file: TextFile, warn: (message: string) => void): ChatListWidths {
  const widths = new Map(Object.entries(readChecked(file, WidthsSchema)?.widths ?? {}));
  const save = (): void => {
    const text = JSON.stringify({ version: FORMAT_VERSION, widths: Object.fromEntries(widths) });
    try {
      file.write(`${text}\n`);
    } catch {
      warn('Could not save the chat list width.');
    }
  };
  const change = (account: string, width: number | undefined): void => {
    if (widths.get(account) === width) {
      return;
    }
    if (width === undefined) {
      widths.delete(account);
    } else {
      widths.set(account, width);
    }
    save();
  };
  return {
    get: (account) => widths.get(account),
    set: change,
    forget: (account) => {
      change(account, undefined);
    },
  };
}
