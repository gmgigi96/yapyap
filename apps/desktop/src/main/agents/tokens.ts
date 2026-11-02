import { createHash, timingSafeEqual } from 'node:crypto';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import type {
  AgentNarrowingStep,
  AgentTokenSpec,
  AgentTokenView,
} from '../../shared/agents-api.ts';
import type { TextFile } from '../atomic-write.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import { chatId } from '../assistant/chats.ts';
import { LimitsSchema, ScopeSchema } from './token-spec.ts';

const FORMAT_VERSION = 1;
/** The most tokens YapYap keeps; each is a way in, so there are few. */
export const MAX_TOKENS = 20;
const DAY_MS = 86_400_000;

const Hex = (length: number) => Type.String({ pattern: `^[0-9a-f]{${String(length)}}$` });

const TokenSchema = Type.Object(
  {
    id: Hex(16),
    // The SHA-256 of the secret: the secret itself is shown once and never kept.
    hash: Hex(64),
    name: Type.String({ minLength: 1, maxLength: 64 }),
    scopes: Type.Array(ScopeSchema, { minItems: 1, uniqueItems: true }),
    accounts: Type.Array(Type.String({ maxLength: 36 }), { minItems: 1, uniqueItems: true }),
    // Chats by fingerprint (C42 in ADR 0008); their names are kept encrypted in the secrets.
    chats: Type.Union([Type.Literal('all'), Type.Array(Hex(64), { minItems: 1, maxItems: 100 })]),
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
}

export interface TokenSources {
  readonly file: TextFile;
  readonly names: Pick<SecretStore, 'get' | 'set' | 'forgetAll'>;
  readonly randomHex: (bytes: number) => string;
  readonly now: () => number;
  readonly warn: (message: string) => void;
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

/** A token's view, with the chat names the secrets kept. */
async function viewOf(token: Kept, names: TokenSources['names']): Promise<AgentTokenView> {
  const { id, name, scopes, accounts, limits, expires, notify, lastUsed } = token;
  const chats =
    token.chats === 'all'
      ? 'all'
      : await Promise.all(
          token.chats.map(async (chat) => ({
            id: chat,
            name: (await names.get(nameKey(id, chat)).catch(() => undefined)) ?? null,
          })),
        );
  return { id, name, scopes, accounts, chats, limits, expires, notify, lastUsed };
}

/** The token one step narrower, or undefined when the step would leave nothing to use. */
function narrowed(token: Kept, step: AgentNarrowingStep): Kept | undefined {
  const without = <T>(list: readonly T[], item: T): T[] | undefined => {
    const left = list.filter((entry) => entry !== item);
    return left.length > 0 && left.length < list.length ? left : undefined;
  };
  if ('scope' in step) {
    const scopes = without(token.scopes, step.scope);
    return scopes && { ...token, scopes };
  }
  if ('account' in step) {
    const accounts = without(token.accounts, step.account);
    return accounts && { ...token, accounts };
  }
  const chats = token.chats === 'all' ? undefined : without(token.chats, step.chat);
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
    chats: spec.chats === 'all' ? 'all' : spec.chats.map(chatId),
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
    // Where the system cannot keep a name safely, Settings shows it unnamed.
    await Promise.all(
      spec.chats.map((name) =>
        sources.names.set(nameKey(kept.id, chatId(name)), name).catch(() => false),
      ),
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
  };
}

/** Whether `token` may reach the chat named `name`. */
export function reaches(token: Pick<AgentToken, 'chats'>, name: string): boolean {
  return token.chats === 'all' || token.chats.includes(chatId(name));
}
