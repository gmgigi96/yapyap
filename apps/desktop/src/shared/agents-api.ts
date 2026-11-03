/**
 * What a token lets an AI agent do through YapYap's MCP server (ADR 0019).
 * The server checks every call against the calling token's scopes.
 */
export const AGENT_SCOPES = [
  'chat:read-unread-summary',
  'chat:read-active',
  'chat:open',
  'composer:read-draft',
  'composer:insert-draft',
  'messages:send',
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

/** Scopes that reach chats by name or number, so their token must list the chats it may reach. */
export const LISTED_CHAT_SCOPES: readonly AgentScope[] = ['chat:open', 'messages:send'];

/** How long a new token lasts, in days; null never expires. */
export const AGENT_TOKEN_EXPIRIES = [1, 7, 30, 90, null] as const;

export type AgentTokenExpiry = (typeof AGENT_TOKEN_EXPIRIES)[number];

/** The longest a token that sends may last, in days. */
export const SENDING_TOKEN_DAYS = 30;

/** The most chats a token may list. */
export const MAX_TOKEN_CHATS = 100;

/** The longest name a token may have. */
export const MAX_TOKEN_NAME = 64;

/** The highest limit a token can name; above it, a limit is Unlimited (null). */
export const MAX_AGENT_LIMIT = 100_000;

/** A token's limits; null is Unlimited. */
export interface AgentLimits {
  readonly callsPerMinute: number | null;
  readonly sendsPerMinute: number | null;
  readonly sendsPerDay: number | null;
}

/** What a new token starts with (ADR 0019); the user can raise, lower or lift each. */
export const DEFAULT_AGENT_LIMITS: { readonly [Limit in keyof AgentLimits]: number } = {
  callsPerMinute: 60,
  sendsPerMinute: 5,
  sendsPerDay: 100,
};

/**
 * A chat on a token's list: its name as WhatsApp shows it, its
 * international number, or both. A number lets the agent open the chat
 * wherever it is, through WhatsApp's own link; a name lets it find it.
 */
export interface AgentChatEntry {
  readonly name: string | null;
  /** As the user typed it; YapYap keeps it as `+` and its digits. */
  readonly phone: string | null;
}

/** What the user chose for a new token, or for a narrower version of one. */
export interface AgentTokenSpec {
  readonly name: string;
  readonly scopes: readonly AgentScope[];
  readonly accounts: readonly string[];
  /** Every chat, or only the chats listed here. */
  readonly chats: 'all' | readonly AgentChatEntry[];
  readonly limits: AgentLimits;
  readonly expiresInDays: AgentTokenExpiry;
  /** Notify each time it sends. */
  readonly notify: boolean;
}

/** A token as Settings shows it; never its secret. */
export interface AgentTokenView {
  readonly id: string;
  readonly name: string;
  readonly scopes: readonly AgentScope[];
  readonly accounts: readonly string[];
  /** A chat whose name YapYap could not keep safely has a null name. */
  /** Each listed chat by its ID; a chat YapYap could not keep the details of has neither. */
  readonly chats: 'all' | readonly (AgentChatEntry & { readonly id: string })[];
  readonly limits: AgentLimits;
  /** Milliseconds since the epoch; null never expires. */
  readonly expires: number | null;
  readonly notify: boolean;
  readonly lastUsed: number | null;
}

/** One call an agent made, without anything it read or wrote. */
export interface AgentActivity {
  readonly time: number;
  readonly token: string;
  readonly tool: string;
  readonly account: string;
  readonly result: string;
}

/** Settings › Agents: where agents connect, the tokens, and what they did. */
export interface AgentsView {
  /** The server's address while it listens, else null. */
  readonly address: string | null;
  /** Why it does not listen while it is on, in the user's words; empty otherwise. */
  readonly problem: string;
  readonly tokens: readonly AgentTokenView[];
  /** Newest first. */
  readonly activity: readonly AgentActivity[];
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
}

/** One step narrower: a scope, an account or a chat (by its ID) less. */
export type AgentNarrowingStep =
  { readonly scope: AgentScope } | { readonly account: string } | { readonly chat: string };

/** A new token, shown once; or why it was refused. */
export type AgentTokenCreated =
  { readonly token: string; readonly address: string | null } | { readonly problem: string };
