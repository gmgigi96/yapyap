import { createHash, timingSafeEqual } from 'node:crypto';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import type {
  AgentChatEntry,
  AgentNarrowingStep,
  AgentTokenSpec,
  AgentTokenView,
} from '../../shared/agents-api.ts';
import type { TextFile } from '../atomic-write.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import { parseInternationalNumber } from '../../shared/phone-number.ts';
import { chatId } from '../assistant/chats.ts';
import { DAY_MS } from './limits.ts';
import { ACCOUNT_ID_LENGTH, LimitsSchema, ScopeSchema } from './token-spec.ts';

const FORMAT_VERSION = 1;
/** The most tokens YapYap keeps; each is a way in, so there are few. */
export const MAX_TOKENS = 20;

const Hex = (length: number) => Type.String({ pattern: `^[0-9a-f]{${String(length)}}$` });

const TokenSchema = Type.Object(
  {
    id: Hex(16),
    // The SHA-256 of the secret: the secret itself is shown once and never kept.
    hash: Hex(64),
    name: Type.String({ minLength: 1, maxLength: 64 }),
    scopes: Type.Array(ScopeSchema, { minItems: 1, uniqueItems: true }),
    accounts: Type.Array(Type.String({ maxLength: ACCOUNT_ID_LENGTH }), {
      minItems: 1,
      uniqueItems: true,
    }),
    // Chats by fingerprint (C42 in ADR 0008): the entry's, its name's and its
    // number's. The names and numbers are kept encrypted in the secrets.
    chats: Type.Union([
      Type.Literal('all'),
      Type.Array(
        Type.Object(
          {
            id: Hex(64),
            name: Type.Union([Hex(64), Type.Null()]),
            phone: Type.Union([Hex(64), Type.Null()]),
          },
          { additionalProperties: false },
        ),
        { minItems: 1, maxItems: 100 },
      ),
    ]),
    limits: LimitsSchema,
    created: Type.Integer({ minimum: 0 }),
    expires: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    notify: Type.Boolean(),
    lastUsed: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

const FileSchema = Type.Object(
  {
    version: Type.Literal(FORMAT_VERSION),
    tokens: Type.Array(TokenSchema, { maxItems: MAX_TOKENS }),
  },
  { additionalProperties: false },
);

/** A token as the server checks calls against it. */
export type AgentToken = Omit<Static<typeof TokenSchema>, 'hash'>;

export interface AgentTokens {
  /** Keeps a new token, returning it in full; the only time its secret exists. */
  readonly create: (spec: AgentTokenSpec) => Promise<string>;
  /** The token `presented` names, while it is valid; undefined for anything else. */
  readonly verify: (presented: string) => AgentToken | undefined;
  readonly list: () => Promise<readonly AgentTokenView[]>;
  readonly count: () => number;
  readonly revoke: (id: string) => void;
  /** False when the token is gone, or the step would leave it unusable. */
  readonly narrow: (id: string, step: AgentNarrowingStep) => boolean;
  /** The chats a token lists, as the user entered them, for the agent to see what it may reach. */
  readonly listed: (id: string) => Promise<ListedChats>;
}

export interface TokenSources {
  readonly file: TextFile;
  readonly names: Pick<SecretStore, 'get' | 'set' | 'forgetAll'>;
  readonly randomHex: (bytes: number) => string;
  readonly now: () => number;
  readonly warn: (message: string) => void;
}

/** A listed chat as the agent sees it: its name, and its number as `+` and digits. */
export interface ListedChat {
  readonly name: string | null;
  readonly phone: string | null;
}

/**
 * The chats a token lists, as far as the system kept them, and how many it
 * could not keep; or every chat.
 */
export type ListedChats =
  'all' | { readonly chats: readonly ListedChat[]; readonly unnamed: number };

/** A number's fingerprint: apart from names, so a chat named like a number is not one. */
const phoneId = (digits: string): string => chatId(`phone:${digits}`);

/** A listed chat, normalized: its name trimmed, its number as `+` and digits. */
function shownOf({ name, phone }: AgentChatEntry): ListedChat {
  const digits = phone === null ? undefined : parseInternationalNumber(phone);
  const trimmed = name?.trim() ?? '';
  return {
    name: trimmed === '' ? null : trimmed,
    phone: digits === undefined ? null : `+${digits}`,
  };
}

/** A listed chat's fingerprints: the entry's own, its name's and its number's. */
function keptChatOf(shown: ListedChat) {
  return {
    id: chatId(`entry:${shown.name ?? ''}\n${shown.phone ?? ''}`),
    name: shown.name === null ? null : chatId(shown.name),
    phone: shown.phone === null ? null : phoneId(shown.phone.slice(1)),
  };
}

/** A chat's details as the secrets kept them; nothing for anything else. */
function parseShown(text: string | undefined): ListedChat {
  try {
    const value = JSON.parse(text ?? 'null') as Partial<ListedChat> | null;
    const field = (raw: unknown) => (typeof raw === 'string' ? raw : null);
    return { name: field(value?.name), phone: field(value?.phone) };
  } catch {
    return { name: null, phone: null };
  }
}

/** A token as the agent presents it: `yapyap_mcp_<id>_<secret>`. */
const PRESENTED = /^yapyap_mcp_([0-9a-f]{16})_([0-9a-f]{64})$/;

const hashOf = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** Where a token's chat names are kept among YapYap's secrets. */
const NAMES = 'agents/chat/';
const nameKey = (token: string, chat: string): string => `${NAMES}${token}/${chat}`;

type Kept = Static<typeof TokenSchema>;

function readTokens(file: TextFile): Kept[] {
  try {
    const value: unknown = JSON.parse(file.read());
    return Value.Check(FileSchema, value) ? value.tokens : [];
  } catch {
    return [];
  }
}

/** Whether the presented secret is the token's, compared in constant time. */
function matches(token: Kept, secret: string): boolean {
  return timingSafeEqual(Buffer.from(token.hash, 'hex'), Buffer.from(hashOf(secret), 'hex'));
}

/** The token without its hash, which nothing outside this file needs. */
function stripped(token: Kept): AgentToken {
  const { id, name, scopes, accounts, chats, limits, created, expires, notify, lastUsed } = token;
  return { id, name, scopes, accounts, chats, limits, created, expires, notify, lastUsed };
}

/** A token's view, with the chat details the secrets kept. */
async function viewOf(token: Kept, names: TokenSources['names']): Promise<AgentTokenView> {
  const { id, name, scopes, accounts, limits, expires, notify, lastUsed } = token;
  const chats =
    token.chats === 'all'
      ? 'all'
      : await Promise.all(
          token.chats.map(async (chat) => ({
            id: chat.id,
            ...parseShown(await names.get(nameKey(id, chat.id)).catch(() => undefined)),
          })),
        );
  return { id, name, scopes, accounts, chats, limits, expires, notify, lastUsed };
}

/** The token one step narrower, or undefined when the step would leave nothing to use. */
function narrowed(token: Kept, step: AgentNarrowingStep): Kept | undefined {
  const without = <T>(list: readonly T[], gone: (entry: T) => boolean): T[] | undefined => {
    const left = list.filter((entry) => !gone(entry));
    return left.length > 0 && left.length < list.length ? left : undefined;
  };
  if ('scope' in step) {
    const scopes = without(token.scopes, (scope) => scope === step.scope);
    return scopes && { ...token, scopes };
  }
  if ('account' in step) {
    const accounts = without(token.accounts, (account) => account === step.account);
    return accounts && { ...token, accounts };
  }
  const chats =
    token.chats === 'all' ? undefined : without(token.chats, (chat) => chat.id === step.chat);
  return chats && { ...token, chats };
}

/** What a new token keeps, from the user's choices. */
function keptOf(spec: AgentTokenSpec, id: string, secret: string, now: number): Kept {
  return {
    id,
    hash: hashOf(secret),
    name: spec.name.trim(),
    scopes: [...spec.scopes],
    accounts: [...spec.accounts],
    chats: spec.chats === 'all' ? 'all' : spec.chats.map((entry) => keptChatOf(shownOf(entry))),
    limits: spec.limits,
    created: now,
    expires: spec.expiresInDays === null ? null : now + spec.expiresInDays * DAY_MS,
    notify: spec.notify,
    lastUsed: null,
  };
}

/** The tokens in memory, and how to save them and forget their chat names. */
interface Store {
  tokens: Kept[];
  readonly save: () => void;
  readonly forget: (gone: readonly Kept[]) => void;
}

function storeOf({ file, names, warn }: TokenSources): Store {
  const store: Store = {
    tokens: readTokens(file),
    save: () => {
      try {
        file.write(`${JSON.stringify({ version: FORMAT_VERSION, tokens: store.tokens })}\n`);
      } catch {
        warn('Could not save the agent tokens.');
      }
    },
    forget: (gone) => {
      for (const token of gone) {
        names.forgetAll(`${NAMES}${token.id}/`);
      }
    },
  };
  return store;
}

async function create(store: Store, sources: TokenSources, spec: AgentTokenSpec): Promise<string> {
  const secret = sources.randomHex(32);
  const kept = keptOf(spec, sources.randomHex(8), secret, sources.now());
  store.tokens = [...store.tokens, kept];
  store.save();
  if (spec.chats !== 'all') {
    // Where the system cannot keep the details safely, Settings shows the chat unnamed.
    await Promise.all(
      spec.chats.map((entry) => {
        const shown = shownOf(entry);
        const key = nameKey(kept.id, keptChatOf(shown).id);
        return sources.names.set(key, JSON.stringify(shown)).catch(() => false);
      }),
    );
  }
  return `yapyap_mcp_${kept.id}_${secret}`;
}

function verify(store: Store, now: () => number, presented: string): AgentToken | undefined {
  const [, id, secret] = PRESENTED.exec(presented) ?? [];
  const token = store.tokens.find((entry) => entry.id === id);
  if (token === undefined || secret === undefined || !matches(token, secret)) {
    return undefined;
  }
  if (token.expires !== null && token.expires <= now()) {
    return undefined;
  }
  token.lastUsed = now();
  return stripped(token);
}

function narrow(store: Store, id: string, step: AgentNarrowingStep): boolean {
  const token = store.tokens.find((entry) => entry.id === id);
  const next = token && narrowed(token, step);
  if (next === undefined) {
    return false;
  }
  store.tokens = store.tokens.map((entry) => (entry.id === id ? next : entry));
  store.save();
  return true;
}

async function listed(
  store: Store,
  names: TokenSources['names'],
  id: string,
): Promise<ListedChats> {
  const token = store.tokens.find((entry) => entry.id === id);
  const view = token === undefined ? undefined : await viewOf(token, names);
  if (view === undefined || view.chats === 'all') {
    return view === undefined ? { chats: [], unnamed: 0 } : 'all';
  }
  const chats = view.chats.flatMap(({ name, phone }) =>
    name === null && phone === null ? [] : [{ name, phone }],
  );
  return { chats, unnamed: view.chats.length - chats.length };
}

/**
 * The agent tokens (ADR 0019), read once from `agent-tokens.json` and
 * written whenever they change. The file holds each token's hash and chat
 * fingerprints, never a secret or a chat's name.
 */
export function agentTokens(sources: TokenSources): AgentTokens {
  const store = storeOf(sources);
  return {
    create: (spec) => create(store, sources, spec),
    verify: (presented) => verify(store, sources.now, presented),
    list: () => Promise.all(store.tokens.map((token) => viewOf(token, sources.names))),
    count: () => store.tokens.length,
    revoke: (id) => {
      store.forget(store.tokens.filter((token) => token.id === id));
      store.tokens = store.tokens.filter((token) => token.id !== id);
      store.save();
    },
    narrow: (id, step) => narrow(store, id, step),
    listed: (id) => listed(store, sources.names, id),
  };
}

/** Whether `token` may reach the chat named `name`. */
export function reaches(token: Pick<AgentToken, 'chats'>, name: string): boolean {
  return token.chats === 'all' || token.chats.some((chat) => chat.name === chatId(name));
}

/** Whether `token` may reach the chat of the number whose digits are `digits`. */
export function reachesPhone(token: Pick<AgentToken, 'chats'>, digits: string): boolean {
  return token.chats === 'all' || token.chats.some((chat) => chat.phone === phoneId(digits));
}
