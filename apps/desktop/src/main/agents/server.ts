import type { AgentActivity } from '../../shared/agents-api.ts';
import { en } from '../../shared/messages/en.ts';
import type { SettingsService } from '../settings/service.ts';
import { answerAgent, type AgentAnswer, type AgentRequest } from './handler.ts';
import { failureLock, slidingCounter } from './limits.ts';
import type { AgentListener } from './listener.ts';
import type { AgentToken, AgentTokens } from './tokens.ts';
import { accountQueue, type AgentAccounts } from './tool-steps.ts';

/** How many calls Settings lists; older ones are forgotten. */
export const MAX_ACTIVITY = 500;

/** The ports YapYap picks from: the dynamic range, which no service claims. */
const FIRST_PORT = 49_152;
const LAST_PORT = 65_535;

type Answer = (request: AgentRequest) => Promise<AgentAnswer>;

/** What the server is made of, which `index.ts` puts together. */
export interface AgentSources {
  readonly tokens: AgentTokens;
  readonly serve: (port: number, answer: Answer) => Promise<AgentListener>;
  /** A number in [0, 1), as `Math.random` gives. */
  readonly random: () => number;
  readonly now: () => number;
  readonly version: string;
}

export interface AgentServerDependencies extends AgentSources {
  readonly settings: SettingsService;
  /** The accounts once they are open. */
  readonly accounts: () => AgentAccounts | undefined;
  readonly notify: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface AgentServer {
  /** The address agents connect to while the server listens, else null. */
  readonly address: () => string | null;
  /** Why it does not listen while it is on; empty otherwise. */
  readonly problem: () => string;
  readonly activity: () => readonly AgentActivity[];
  /** Moves the server to another port, which agents' configs must then name. */
  readonly newPort: () => void;
}

const noAccounts: AgentAccounts = { list: () => [], page: () => undefined };

/** Records calls in memory alone, newest first: Settings shows them, nothing keeps them. */
function activityLog(now: () => number) {
  let entries: AgentActivity[] = [];
  return {
    entries: () => entries,
    record: (token: AgentToken, tool: string, account: string, result: string): void => {
      entries = [{ time: now(), token: token.id, tool, account, result }, ...entries].slice(
        0,
        MAX_ACTIVITY,
      );
    },
  };
}

/** What answers each request on `port`, with the state the checks keep between requests. */
function answering(
  deps: AgentServerDependencies,
  record: ReturnType<typeof activityLog>['record'],
): (port: number) => Answer {
  const handler = {
    tokens: deps.tokens,
    counter: slidingCounter(deps.now),
    lock: failureLock(deps.now),
    queue: accountQueue(),
    record,
    notifySent: (token: AgentToken, chat: string) => {
      deps.notify(en.agents.sent({ token: token.name, chat }));
    },
    version: deps.version,
  };
  return (port) => (request) =>
    answerAgent(request, port, { ...handler, accounts: deps.accounts() ?? noAccounts });
}

/** Listens on one port at a time, one change after another. */
function listening(deps: AgentServerDependencies, answer: (port: number) => Answer) {
  const state: { listener: AgentListener | undefined; problem: string } = {
    listener: undefined,
    problem: '',
  };
  let pending = Promise.resolve();
  const start = async (port: number): Promise<void> => {
    try {
      state.listener = await deps.serve(port, answer(port));
    } catch {
      state.problem = en.agents.portTaken({ port: String(port) });
      deps.warn('The MCP server could not listen on its port.');
    }
  };
  const switchTo = async (port: number | undefined): Promise<void> => {
    if (state.listener?.port === port && port !== undefined) {
      return;
    }
    const previous = state.listener;
    state.listener = undefined;
    state.problem = '';
    await previous?.close();
    if (port !== undefined) {
      await start(port);
    }
  };
  return {
    state,
    listenOn: (port: number | undefined): void => {
      pending = pending.then(() => switchTo(port));
    },
  };
}

/**
 * The MCP server for AI agents (ADR 0019): it listens on 127.0.0.1 only
 * while Settings › Agents has it on, and stops the moment it is turned
 * off. The port is picked once and kept, so agents' configs stay valid.
 */
export function agentServer(deps: AgentServerDependencies): AgentServer {
  const log = activityLog(deps.now);
  const { state, listenOn } = listening(deps, answering(deps, log.record));
  const newPort = (): void => {
    const port = FIRST_PORT + Math.floor(deps.random() * (LAST_PORT - FIRST_PORT + 1));
    deps.settings.update((settings) => ({ ...settings, agents: { ...settings.agents, port } }));
  };
  const follow = (): void => {
    const { enabled, port } = deps.settings.current().agents;
    if (enabled && port === 0) {
      // Saving the new port calls this again, which then listens on it.
      newPort();
      return;
    }
    listenOn(enabled ? port : undefined);
  };
  deps.settings.onChange(follow);
  follow();
  return {
    address: () =>
      state.listener === undefined ? null : `http://127.0.0.1:${String(state.listener.port)}/mcp`,
    problem: () => state.problem,
    activity: log.entries,
    newPort,
  };
}
