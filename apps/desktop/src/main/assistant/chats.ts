import { createHash } from 'node:crypto';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import type { SecretStore } from '../secrets/secret-store.ts';
import { readChecked, type TextFile } from '../support/atomic-write.ts';

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const FORMAT_VERSION = 1;
/** As many accounts as `accounts.json` holds. */
const MAX_ACCOUNTS = 32;
/** The most chats remembered per account; the oldest are forgotten first. */
export const MAX_ALLOWED = 500;

const ChatId = Type.String({ pattern: '^[0-9a-f]{64}$' });

const ChatsSchema = Type.Object(
  {
    version: Type.Literal(FORMAT_VERSION),
    // TypeBox ignores a Record key schema's limits; `propertyNames` enforces them.
    accounts: Type.Record(Type.String(), Type.Array(ChatId, { maxItems: MAX_ALLOWED }), {
      maxProperties: MAX_ACCOUNTS,
      propertyNames: { pattern: UUID },
    }),
  },
  { additionalProperties: false },
);

/** Whether `value` is a chat's fingerprint, as {@link chatId} makes one. */
export const isChatId = (value: unknown): value is string => Value.Check(ChatId, value);

/**
 * A chat's fingerprint: the SHA-256 of its name, so the file never holds
 * the name itself.
 */
export const chatId = (name: string): string => createHash('sha256').update(name).digest('hex');

/** One account's allowed chats, with their names where the system could keep them safely. */
interface AllowedInAccount {
  readonly account: string;
  readonly chats: readonly { readonly id: string; readonly name: string | undefined }[];
}

/** The chats the user allowed the assistant to read, account by account (#107). */
export interface AllowedChats {
  readonly isAllowed: (account: string, name: string) => boolean;
  /** Allows the chat, keeping its name encrypted, for Settings to list. */
  readonly allow: (account: string, name: string) => Promise<void>;
  readonly forget: (account: string, id: string) => void;
  /** Drops a removed account's chats. */
  readonly forgetAccount: (account: string) => void;
  readonly list: () => Promise<readonly AllowedInAccount[]>;
}

function readChats(file: TextFile): Map<string, string[]> {
  const accounts = readChecked(file, ChatsSchema)?.accounts ?? {};
  return new Map(Object.entries(accounts).map(([account, ids]) => [account, [...ids]]));
}

/** Where a chat's encrypted name is kept among YapYap's secrets. */
const NAMES = 'assistant/chat/';
const nameKey = (account: string, id: string): string => `${NAMES}${account}/${id}`;

type Names = Pick<SecretStore, 'get' | 'set' | 'forgetAll'>;

/** Writes the chats to `file`, keeping them for this run when it cannot. */
const saver =
  (file: TextFile, chats: Map<string, string[]>, warn: (message: string) => void) => (): void => {
    const text = JSON.stringify({ version: FORMAT_VERSION, accounts: Object.fromEntries(chats) });
    try {
      file.write(`${text}\n`);
    } catch {
      warn('Could not save the chats the assistant may read.');
    }
  };

/** Each account's chats, with the names the keychain kept for them. */
const listOf = (chats: Map<string, string[]>, names: Names): Promise<AllowedInAccount[]> =>
  Promise.all(
    [...chats].map(async ([account, ids]) => ({
      account,
      chats: await Promise.all(
        ids.map(async (id) => ({
          id,
          name: await names.get(nameKey(account, id)).catch(() => undefined),
        })),
      ),
    })),
  );

/**
 * The allowed chats, read once from `assistant-chats.json` and written
 * whenever they change. They are state, not a preference, so they stay out
 * of settings, and out of a settings export. Names go only to the system's
 * keychain, through YapYap's secrets (C42 in ADR 0008).
 */
export function allowedChats(
  file: TextFile,
  names: Names,
  warn: (message: string) => void,
): AllowedChats {
  const chats = readChats(file);
  const save = saver(file, chats, warn);
  const without = (account: string, id: string): string[] =>
    (chats.get(account) ?? []).filter((entry) => entry !== id);
  return {
    isAllowed: (account, name) => chats.get(account)?.includes(chatId(name)) === true,
    allow: async (account, name) => {
      const id = chatId(name);
      chats.set(account, [...without(account, id), id].slice(-MAX_ALLOWED));
      save();
      // Where the system cannot keep it safely, the name is not kept at all.
      await names.set(nameKey(account, id), name).catch(() => false);
    },
    forget: (account, id) => {
      chats.set(account, without(account, id));
      save();
      void names.set(nameKey(account, id), undefined);
    },
    forgetAccount: (account) => {
      chats.delete(account);
      save();
      names.forgetAll(`${NAMES}${account}/`);
    },
    list: () => listOf(chats, names),
  };
}
