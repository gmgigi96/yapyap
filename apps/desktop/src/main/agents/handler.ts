import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { MINUTE_MS, type Counter, type FailureLock } from './limits.ts';
import { bearerOf, refusalOf, type ArrivingRequest } from './request-checks.ts';
import type { AgentToken, AgentTokens } from './tokens.ts';
import type { AgentAccounts } from './tool-steps.ts';
import { registerTools } from './tools.ts';

/** A request with its body read, as far as the server takes it. */
export interface AgentRequest extends ArrivingRequest {
  readonly body: string;
}

/** What the server answers. */
export interface AgentAnswer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface AgentHandlerDependencies {
  readonly tokens: Pick<AgentTokens, 'verify' | 'listed'>;
  readonly accounts: AgentAccounts;
  readonly counter: Counter;
  readonly lock: FailureLock;
  readonly queue: <T>(account: string, run: () => Promise<T>) => Promise<T>;
  readonly record: (token: AgentToken, tool: string, account: string, result: string) => void;
  readonly notifySent: (token: AgentToken, chat: string) => void;
  /** YapYap's version, which the server names in its handshake. */
  readonly version: string;
}

/** Headers the SDK reads; nothing else of the request reaches it. */
const PASSED_HEADERS = ['content-type', 'accept', 'mcp-protocol-version'];

const bare = (status: number, headers: Record<string, string> = {}): AgentAnswer => ({
  status,
  headers,
  body: '',
});

function sdkRequest(request: AgentRequest, port: number): Request {
  const headers = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = request.headers[name];
    if (typeof value === 'string') {
      headers.set(name, value);
    }
  }
  return new Request(`http://127.0.0.1:${String(port)}/mcp`, {
    method: 'POST',
    headers,
    body: request.body,
  });
}

/** Serves one call with a server that has only the tools `token` may use. */
async function serve(
  request: AgentRequest,
  port: number,
  token: AgentToken,
  deps: AgentHandlerDependencies,
): Promise<AgentAnswer> {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'YapYap', version: deps.version });
    registerTools(server, {
      token,
      accounts: deps.accounts,
      queue: deps.queue,
      counter: deps.counter,
      record: (tool, account, result) => {
        deps.record(token, tool, account, result);
      },
      notifySent: (chat) => {
        deps.notifySent(token, chat);
      },
      listed: () => deps.tokens.listed(token.id),
    });
    return server;
  });
  const response = await handler.fetch(sdkRequest(request, port));
  return {
    status: response.status,
    headers: Object.fromEntries(
      ['content-type'].flatMap((name) => {
        const value = response.headers.get(name);
        return value === null ? [] : [[name, value]];
      }),
    ),
    body: await response.text(),
  };
}

/**
 * Answers one request to the MCP server, checking it in the order of ADR
 * 0019, §3: where it comes from and what it is, the lockout after failed
 * authentications, the token, and the token's call limit. Only then does
 * the SDK parse it.
 */
export async function answerAgent(
  request: AgentRequest,
  port: number,
  deps: AgentHandlerDependencies,
): Promise<AgentAnswer> {
  const refusal = refusalOf(request, port);
  if (refusal !== undefined) {
    return bare(refusal.status);
  }
  if (deps.lock.locked()) {
    return bare(429);
  }
  const token = deps.tokens.verify(bearerOf(request) ?? '');
  if (token === undefined) {
    deps.lock.failed();
    return bare(401, { 'www-authenticate': 'Bearer' });
  }
  if (!deps.counter.take(`${token.id}:calls`, token.limits.callsPerMinute, MINUTE_MS)) {
    return bare(429);
  }
  return serve(request, port, token, deps);
}
