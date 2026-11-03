import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { en } from '../../shared/messages/en.ts';
import { MAX_PROXY_ADDRESS, PROXY_ADDRESS } from '../../shared/proxy-address.ts';

/** Colors an account can take; the chrome maps each to a shade that suits the theme. */
export const ACCOUNT_COLORS = ['green', 'blue', 'purple', 'orange', 'red', 'teal'] as const;

/** The longest account name, which still fits the menu and the sidebar. */
export const MAX_ACCOUNT_NAME = 40;
/** The most accounts `accounts.json` holds. */
export const MAX_ACCOUNTS = 32;

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const PARTITION_PREFIX = 'account-';
const FORMAT_VERSION = 1;

const AccountSchema = Type.Object(
  {
    id: Type.String({ pattern: UUID }),
    name: Type.String({ minLength: 1, maxLength: MAX_ACCOUNT_NAME }),
    color: Type.Enum(ACCOUNT_COLORS),
    enabled: Type.Boolean(),
    // Absent until the user first mutes or unmutes the account (#61).
    muted: Type.Optional(Type.Boolean()),
    // The account's own proxy; absent or empty uses Settings → Network (#76).
    proxy: Type.Optional(Type.String({ maxLength: MAX_PROXY_ADDRESS, pattern: PROXY_ADDRESS })),
  },
  { additionalProperties: false },
);

const AccountsSchema = Type.Object(
  {
    version: Type.Literal(FORMAT_VERSION),
    accounts: Type.Array(AccountSchema, { minItems: 1, maxItems: MAX_ACCOUNTS }),
    active: Type.String({ pattern: UUID }),
  },
  { additionalProperties: false },
);

export type Account = Static<typeof AccountSchema>;
export type Accounts = Static<typeof AccountsSchema>;

export function isAccountColor(value: unknown): value is Account['color'] {
  return (ACCOUNT_COLORS as readonly unknown[]).includes(value);
}

/**
 * Each account's own persistent session (ADR 0001): cookies, storage,
 * service workers and cache never cross accounts.
 */
export function partitionOf(account: Pick<Account, 'id'>): string {
  return `persist:${PARTITION_PREFIX}${account.id}`;
}

/** The account IDs whose session folders Electron keeps under `Partitions/`. */
export function accountIdsInPartitions(folderNames: readonly string[]): string[] {
  const id = new RegExp(UUID.replace('^', `^${PARTITION_PREFIX}`));
  return folderNames
    .filter((name) => id.test(name))
    .map((name) => name.slice(PARTITION_PREFIX.length))
    .sort((a, b) => a.localeCompare(b));
}

/** Colors go round in order, so neighbouring accounts look different; position 1 is the first. */
export function colorFor(position: number): Account['color'] {
  return ACCOUNT_COLORS[(position - 1) % ACCOUNT_COLORS.length] ?? ACCOUNT_COLORS[0];
}

/** The first account is just WhatsApp; later ones are numbered, so they tell apart. */
function defaultName(position: number): string {
  return position === 1 ? en.accounts.defaultName : en.accounts.numberedName({ position });
}

/** A new account at `position`, with its default name and color. */
export function newAccount(id: string, position: number): Account {
  return { id, name: defaultName(position), color: colorFor(position), enabled: true };
}

/** Every ID appears once, and the active account is one of them. */
function isConsistent(value: Accounts): boolean {
  const ids = value.accounts.map((account) => account.id);
  return new Set(ids).size === ids.length && ids.includes(value.active);
}

/**
 * Reads `accounts.json`. When it is missing or damaged, the accounts are
 * rebuilt from the session folders on disk, so nobody is logged out by a
 * bad file; with none, there is one new account.
 */
export function parseAccounts(
  text: string | undefined,
  partitionIds: readonly string[],
  newId: () => string,
): Accounts {
  try {
    const value: unknown = JSON.parse(text ?? '');
    if (Value.Check(AccountsSchema, value) && isConsistent(value)) {
      return value;
    }
  } catch {
    // Rebuilt below.
  }
  const [first = newId(), ...others] = partitionIds;
  const accounts = [first, ...others].map((id, index) => newAccount(id, index + 1));
  return { accounts, version: FORMAT_VERSION, active: first };
}

/** The file's text, stable so it changes only when the accounts do. */
export function serializeAccounts(accounts: Accounts): string {
  return `${JSON.stringify(accounts, null, 2)}\n`;
}
