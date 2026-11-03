import type {
  AgentNarrowingStep,
  AgentsView,
  AgentTokenCreated,
} from '../../shared/api/agents-api.ts';
import { AGENT_SCOPES } from '../../shared/api/agents-api.ts';
import { CHROME_CHANNELS } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { isChatId } from '../assistant/chats.ts';
import { argumentsOf, isString, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import type { AgentServer } from './server.ts';
import { ACCOUNT_ID_LENGTH, checkSpec } from './token-spec.ts';
import { MAX_TOKENS, type AgentTokens } from './tokens.ts';
import type { AgentAccounts } from './tool-steps.ts';

export interface AgentsSettingsDependencies {
  readonly server: AgentServer;
  readonly tokens: AgentTokens;
  readonly accounts: () => AgentAccounts | undefined;
  readonly writeClipboard: (text: string) => unknown;
}

/** The longest text Settings copies: a command with a token in it. */
const MAX_COPY = 1024;

const isTokenId = (value: unknown): boolean =>
  typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);

const isAccountId = (value: unknown): boolean =>
  isString(value) && value.length <= ACCOUNT_ID_LENGTH;

/** One step narrower, as Settings asks for it: a scope, an account or a chat less. */
function isNarrowing(value: unknown): value is AgentNarrowingStep {
  if (typeof value !== 'object' || value === null || Object.keys(value).length !== 1) {
    return false;
  }
  const step = value as { scope?: unknown; account?: unknown; chat?: unknown };
  return (
    (AGENT_SCOPES as readonly unknown[]).includes(step.scope) ||
    isAccountId(step.account) ||
    isChatId(step.chat)
  );
}

/** Settings › Agents, with calls named by their token and account. */
async function viewOf(deps: AgentsSettingsDependencies): Promise<AgentsView> {
  const accounts = deps.accounts()?.list() ?? [];
  const tokens = await deps.tokens.list();
  const tokenNames = new Map(tokens.map((token) => [token.id, token.name]));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  return {
    address: deps.server.address(),
    problem: deps.server.problem(),
    activity: deps.server.activity().map((entry) => ({
      ...entry,
      token: tokenNames.get(entry.token) ?? en.agents.revokedToken,
      account: accountNames.get(entry.account) ?? entry.account,
    })),
    tokens,
    accounts,
  };
}

async function create(deps: AgentsSettingsDependencies, spec: unknown): Promise<AgentTokenCreated> {
  const known = new Set((deps.accounts()?.list() ?? []).map((account) => account.id));
  const checked = deps.tokens.count() >= MAX_TOKENS ? 'tooMany' : checkSpec(spec, known);
  if (typeof checked === 'string') {
    return { problem: en.agents.problems[checked] };
  }
  return { token: await deps.tokens.create(checked), address: deps.server.address() };
}

/** The open chat's name in `account`, for a token's list; null when none is open. */
async function openChatName(deps: AgentsSettingsDependencies, account: string) {
  const chat = await deps
    .accounts()
    ?.page(account)
    ?.readOpenChat(1)
    .catch(() => null);
  return chat?.name ?? null;
}

/**
 * Settings › Agents' operations (ADR 0019). A new token's choices are
 * checked whole; a token is named only by its ID, and narrowed one step
 * at a time, never widened.
 */
export function agentsHandlers(deps: AgentsSettingsDependencies): ChromeHandler[] {
  return [
    { channel: CHROME_CHANNELS.agentsView, accepts: noArguments, handle: () => viewOf(deps) },
    {
      channel: CHROME_CHANNELS.agentsCreate,
      accepts: argumentsOf((spec) => typeof spec === 'object' && spec !== null),
      handle: (_call, spec) => create(deps, spec),
    },
    {
      channel: CHROME_CHANNELS.agentsRevoke,
      accepts: argumentsOf(isTokenId),
      handle: (_call, id) => {
        deps.tokens.revoke(id as string);
      },
    },
    {
      channel: CHROME_CHANNELS.agentsNarrow,
      accepts: argumentsOf(isTokenId, isNarrowing),
      handle: (_call, id, step) => deps.tokens.narrow(id as string, step as AgentNarrowingStep),
    },
    { channel: CHROME_CHANNELS.agentsNewPort, accepts: noArguments, handle: deps.server.newPort },
    {
      channel: CHROME_CHANNELS.agentsOpenChat,
      accepts: argumentsOf(isAccountId),
      handle: (_call, account) => openChatName(deps, account as string),
    },
    {
      channel: CHROME_CHANNELS.agentsCopy,
      accepts: argumentsOf((text) => isString(text) && text.length <= MAX_COPY),
      handle: (_call, text) => {
        deps.writeClipboard(text as string);
      },
    },
  ];
}
