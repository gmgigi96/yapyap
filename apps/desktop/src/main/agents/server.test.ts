import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENT_LIMITS } from '../../shared/agents-api.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import type { SettingsService } from '../settings/service.ts';
import type { AgentRequest } from './handler.ts';
import { agentServer, MAX_ACTIVITY, type AgentServerDependencies } from './server.ts';
import type { AgentToken } from './tokens.ts';

const PRESENTED = `yapyap_mcp_${'2'.repeat(16)}_${'1'.repeat(64)}`;
const ACCOUNT = '11111111-2222-4333-8444-555555555555';

const TOKEN: AgentToken = {
  id: '2'.repeat(16),
  name: 'Claude Code',
  scopes: ['messages:send'],
  accounts: [ACCOUNT],
  chats: 'all',
  limits: DEFAULT_AGENT_LIMITS,
  created: 0,
  expires: null,
  notify: true,
  lastUsed: null,
};

function settingsOf(initial: Partial<Settings['agents']> = {}): SettingsService {
  let settings: Settings = {
    ...defaultSettings(),
    agents: { enabled: false, port: 0, ...initial },
  };
  const listeners: ((settings: Settings) => void)[] = [];
  return {
    current: () => settings,
    notice: undefined,
    firstRun: false,
    update: (change) => {
      settings = change(settings);
      for (const listener of listeners) {
        listener(settings);
      }
    },
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(initial: Partial<Settings['agents']> = {}) {
  const answers: ((request: AgentRequest) => unknown)[] = [];
  const closed: number[] = [];
  const deps = {
    settings: settingsOf(initial),
    tokens: {
      create: vi.fn(),
      verify: vi.fn((given: string) => (given === PRESENTED ? TOKEN : undefined)),
      list: vi.fn(),
      count: vi.fn(),
      revoke: vi.fn(),
      narrow: vi.fn(),
    },
    accounts: vi.fn<AgentServerDependencies['accounts']>(() => undefined),
    serve: vi.fn((port: number, answer: (request: AgentRequest) => unknown) => {
      answers.push(answer);
      return Promise.resolve({
        port,
        close: () => {
          closed.push(port);
          return Promise.resolve();
        },
      });
    }),
    random: vi.fn(() => 0.5),
    now: () => 42,
    notify: vi.fn(),
    warn: vi.fn(),
    version: '1.2.3',
  } satisfies AgentServerDependencies;
  return { deps, answers, closed, server: agentServer(deps) };
}

const request = (port: number, body: unknown): AgentRequest => ({
  remoteAddress: '127.0.0.1',
  method: 'POST',
  url: '/mcp',
  headers: {
    host: `127.0.0.1:${String(port)}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${PRESENTED}`,
  },
  body: JSON.stringify(body),
});

describe('agentServer', () => {
  it('listens on nothing while it is off', async () => {
    const t = setup();
    await settle();
    expect(t.deps.serve).not.toHaveBeenCalled();
    expect(t.server.address()).toBeNull();
    expect(t.server.problem()).toBe('');
  });

  it('picks a port in the dynamic range the first time, keeps it, and listens there', async () => {
    const t = setup();
    t.deps.settings.update((settings) => ({ ...settings, agents: { enabled: true, port: 0 } }));
    await settle();
    expect(t.deps.settings.current().agents.port).toBe(57_344);
    expect(t.deps.serve).toHaveBeenCalledExactlyOnceWith(57_344, expect.any(Function));
    expect(t.server.address()).toBe('http://127.0.0.1:57344/mcp');
    t.deps.random.mockReturnValue(0);
    t.server.newPort();
    expect(t.deps.settings.current().agents.port).toBe(49_152);
    t.deps.random.mockReturnValue(0.999_999_99);
    t.server.newPort();
    expect(t.deps.settings.current().agents.port).toBe(65_535);
  });

  it('stops listening the moment it is turned off, and moves when the port changes', async () => {
    const t = setup({ enabled: true, port: 50_000 });
    await settle();
    t.deps.settings.update((settings) => ({ ...settings, general: { ...settings.general } }));
    await settle();
    expect(t.deps.serve).toHaveBeenCalledOnce();
    t.deps.settings.update((settings) => ({
      ...settings,
      agents: { enabled: true, port: 50_001 },
    }));
    await settle();
    expect(t.closed).toEqual([50_000]);
    expect(t.server.address()).toBe('http://127.0.0.1:50001/mcp');
    t.deps.settings.update((settings) => ({
      ...settings,
      agents: { enabled: false, port: 50_001 },
    }));
    await settle();
    expect(t.closed).toEqual([50_000, 50_001]);
    expect(t.server.address()).toBeNull();
  });

  it('says when its port is taken, and clears that once it moves', async () => {
    const t = setup();
    t.deps.serve.mockRejectedValueOnce(new Error('EADDRINUSE'));
    t.deps.settings.update((settings) => ({
      ...settings,
      agents: { enabled: true, port: 50_000 },
    }));
    await settle();
    expect(t.server.address()).toBeNull();
    expect(t.server.problem()).toBe(
      'Another program uses port 50000, so agents can’t connect. Pick another port.',
    );
    expect(t.deps.warn).toHaveBeenCalledWith('The MCP server could not listen on its port.');
    t.server.newPort();
    await settle();
    expect(t.server.problem()).toBe('');
    expect(t.server.address()).toBe('http://127.0.0.1:57344/mcp');
  });

  it('answers agents with the accounts open at that moment, recording each call', async () => {
    const t = setup({ enabled: true, port: 50_000 });
    await settle();
    const answer = t.answers[0];
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_accounts' } };
    await answer?.(request(50_000, call));
    t.deps.accounts.mockReturnValue({
      list: () => [{ id: ACCOUNT, name: 'Personal' }],
      page: () => undefined,
    });
    const sent = { name: 'send_message', arguments: { account: ACCOUNT, chat: 'Ana', text: 'Hi' } };
    await answer?.(request(50_000, { ...call, params: sent }));
    expect(t.server.activity()).toEqual([
      {
        time: 42,
        token: TOKEN.id,
        tool: 'send_message',
        account: ACCOUNT,
        result: 'account_not_allowed',
      },
    ]);
  });

  it('reaches no account before the accounts are open', async () => {
    const t = setup({ enabled: true, port: 50_000 });
    await settle();
    const call = (name: string, args: unknown) =>
      t.answers[0]?.(
        request(50_000, {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      ) as Promise<{ body: string }>;
    expect((await call('list_accounts', {})).body).toContain('[]');
    await call('send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' });
    expect(t.server.activity()[0]?.result).toBe('account_not_allowed');
  });

  it('keeps only the latest calls, newest first', async () => {
    const t = setup({ enabled: true, port: 50_000 });
    await settle();
    t.deps.accounts.mockReturnValue({ list: () => [], page: () => undefined });
    const body = (id: number) => ({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: 'send_message',
        arguments: { account: `a${String(id)}`, chat: 'Ana', text: 'Hi' },
      },
    });
    const unlimited = {
      ...TOKEN,
      limits: { callsPerMinute: null, sendsPerMinute: null, sendsPerDay: null },
    };
    t.deps.tokens.verify.mockReturnValue(unlimited);
    for (let id = 0; id <= MAX_ACTIVITY; id += 1) {
      await t.answers[0]?.(request(50_000, body(id)));
    }
    expect(t.server.activity()).toHaveLength(MAX_ACTIVITY);
    expect(t.server.activity()[0]?.account).toBe(`a${String(MAX_ACTIVITY)}`);
  });

  it('tells the user when a token sent a message', async () => {
    const t = setup({ enabled: true, port: 50_000 });
    await settle();
    const page = {
      readOpenChat: () => Promise.resolve({ name: 'Ana', group: false, messages: [] }),
      readUnread: () => Promise.resolve([]),
      readDraft: () => Promise.resolve(''),
      replaceDraft: () => Promise.resolve(true),
      pressEnter: () => Promise.resolve(true),
      openChat: () => Promise.resolve(true),
    };
    t.deps.accounts.mockReturnValue({ list: () => [], page: () => page });
    await t.answers[0]?.(
      request(50_000, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'send_message', arguments: { account: ACCOUNT, chat: 'Ana', text: 'Hi' } },
      }),
    );
    expect(t.deps.notify).toHaveBeenCalledWith('Claude Code sent a message to Ana.');
  });
});
