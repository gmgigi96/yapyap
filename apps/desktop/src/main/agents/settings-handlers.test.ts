import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENT_LIMITS, type AgentTokenView } from '../../shared/api/agents-api.ts';
import { chatId } from '../assistant/chats.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import { agentsHandlers, type AgentsSettingsDependencies } from './settings-handlers.ts';
import { MAX_TOKENS } from './tokens.ts';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const ID = '2'.repeat(16);

const VIEW: AgentTokenView = {
  id: ID,
  name: 'Claude Code',
  scopes: ['chat:read-active'],
  accounts: [ACCOUNT],
  chats: 'all',
  limits: DEFAULT_AGENT_LIMITS,
  expires: null,
  notify: true,
  lastUsed: null,
};

const SPEC = {
  name: 'Claude Code',
  scopes: ['chat:read-active'],
  accounts: [ACCOUNT],
  chats: 'all',
  limits: DEFAULT_AGENT_LIMITS,
  expiresInDays: 30,
  notify: true,
};

function setup() {
  const page = {
    readOpenChat: vi.fn(() => Promise.resolve({ name: 'Ana', group: false, messages: [] })),
    readUnread: vi.fn(),
    readDraft: vi.fn(),
    replaceDraft: vi.fn(),
    pressEnter: vi.fn(),
    openChat: vi.fn(),
    openPhone: vi.fn(),
  };
  const deps = {
    server: {
      address: vi.fn(() => 'http://127.0.0.1:50000/mcp'),
      problem: vi.fn(() => ''),
      activity: vi.fn(() => [
        { time: 2, token: ID, tool: 'read_chat', account: ACCOUNT, result: 'ok' },
        { time: 1, token: 'f'.repeat(16), tool: 'list_unread', account: 'gone', result: 'ok' },
      ]),
      newPort: vi.fn(),
    },
    tokens: {
      create: vi.fn(() => Promise.resolve('yapyap_mcp_new')),
      verify: vi.fn(),
      list: vi.fn(() => Promise.resolve([VIEW])),
      count: vi.fn(() => 1),
      revoke: vi.fn(),
      narrow: vi.fn(() => true),
      listed: vi.fn(),
    },
    accounts: vi.fn<AgentsSettingsDependencies['accounts']>(() => ({
      list: () => [{ id: ACCOUNT, name: 'Personal' }],
      page: (id: string) => (id === ACCOUNT ? page : undefined),
    })),
    writeClipboard: vi.fn(),
  } satisfies AgentsSettingsDependencies;
  const handlers = new Map(
    agentsHandlers(deps).map((handler): [string, ChromeHandler] => [handler.channel, handler]),
  );
  const accepts = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)?.accepts(args) === true;
  const call = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)?.handle({ sender: {} }, ...args);
  return { deps, page, accepts, call };
}

describe('agentsHandlers', () => {
  it('shows where agents connect, the tokens, and calls named by token and account', async () => {
    const t = setup();
    expect(t.accepts('agents:view')).toBe(true);
    expect(t.accepts('agents:view', 'x')).toBe(false);
    expect(await t.call('agents:view')).toEqual({
      address: 'http://127.0.0.1:50000/mcp',
      problem: '',
      tokens: [VIEW],
      activity: [
        { time: 2, token: 'Claude Code', tool: 'read_chat', account: 'Personal', result: 'ok' },
        { time: 1, token: 'A revoked token', tool: 'list_unread', account: 'gone', result: 'ok' },
      ],
      accounts: [{ id: ACCOUNT, name: 'Personal' }],
    });
  });

  it('shows no accounts before they are open', async () => {
    const t = setup();
    t.deps.accounts.mockReturnValue(undefined);
    expect(await t.call('agents:view')).toMatchObject({ accounts: [] });
  });

  it('creates a token from a checked spec, returning it once with the address', async () => {
    const t = setup();
    expect(t.accepts('agents:create', SPEC)).toBe(true);
    expect(t.accepts('agents:create', null)).toBe(false);
    expect(t.accepts('agents:create', 'spec')).toBe(false);
    expect(await t.call('agents:create', SPEC)).toEqual({
      token: 'yapyap_mcp_new',
      address: 'http://127.0.0.1:50000/mcp',
    });
    expect(t.deps.tokens.create).toHaveBeenCalledWith(SPEC);
  });

  it('refuses a token it cannot keep, saying why', async () => {
    const t = setup();
    expect(await t.call('agents:create', { ...SPEC, name: '' })).toEqual({
      problem: 'Give the token a name, at least one thing it may do, and at least one account.',
    });
    expect(await t.call('agents:create', { ...SPEC, scopes: ['messages:send'] })).toEqual({
      problem:
        'A token that opens chats or sends messages must list the chats it may reach, by name or by number.',
    });
    t.deps.accounts.mockReturnValue(undefined);
    expect(await t.call('agents:create', SPEC)).toEqual({
      problem: 'One of the accounts no longer exists.',
    });
    t.deps.tokens.count.mockReturnValue(MAX_TOKENS);
    expect(await t.call('agents:create', SPEC)).toEqual({
      problem: 'YapYap keeps at most 20 tokens. Revoke one first.',
    });
    expect(t.deps.tokens.create).not.toHaveBeenCalled();
  });

  it('revokes and narrows a token named by its ID alone', () => {
    const t = setup();
    expect(t.accepts('agents:revoke', ID)).toBe(true);
    expect(t.accepts('agents:revoke', 'Claude Code')).toBe(false);
    expect(t.accepts('agents:revoke', 7)).toBe(false);
    t.call('agents:revoke', ID);
    expect(t.deps.tokens.revoke).toHaveBeenCalledWith(ID);
    for (const step of [{ scope: 'chat:open' }, { account: ACCOUNT }, { chat: chatId('Ana') }]) {
      expect(t.accepts('agents:narrow', ID, step)).toBe(true);
    }
    for (const step of [
      { scope: 'messages:delete' },
      { account: 'x'.repeat(37) },
      { chat: 'Ana' },
      { scope: 'chat:open', account: ACCOUNT },
      {},
      null,
      'scope',
    ]) {
      expect(t.accepts('agents:narrow', ID, step)).toBe(false);
    }
    expect(t.call('agents:narrow', ID, { scope: 'chat:open' })).toBe(true);
    expect(t.deps.tokens.narrow).toHaveBeenCalledWith(ID, { scope: 'chat:open' });
  });

  it('moves to a new port on request', () => {
    const t = setup();
    expect(t.accepts('agents:new-port')).toBe(true);
    t.call('agents:new-port');
    expect(t.deps.server.newPort).toHaveBeenCalledOnce();
  });

  it('names the chat open in an account, to add it to a token', async () => {
    const t = setup();
    expect(t.accepts('agents:open-chat', ACCOUNT)).toBe(true);
    expect(t.accepts('agents:open-chat', 3)).toBe(false);
    expect(await t.call('agents:open-chat', ACCOUNT)).toBe('Ana');
    expect(t.page.readOpenChat).toHaveBeenCalledWith(1);
    expect(await t.call('agents:open-chat', 'other')).toBeNull();
    t.page.readOpenChat.mockResolvedValueOnce(null as never);
    expect(await t.call('agents:open-chat', ACCOUNT)).toBeNull();
    t.page.readOpenChat.mockRejectedValueOnce(new Error('Not ready.'));
    expect(await t.call('agents:open-chat', ACCOUNT)).toBeNull();
    t.deps.accounts.mockReturnValue(undefined);
    expect(await t.call('agents:open-chat', ACCOUNT)).toBeNull();
  });

  it('copies short text, such as a new token, for the page', () => {
    const t = setup();
    expect(t.accepts('agents:copy', 'yapyap_mcp_x')).toBe(true);
    expect(t.accepts('agents:copy', 'x'.repeat(1025))).toBe(false);
    expect(t.accepts('agents:copy', 1)).toBe(false);
    t.call('agents:copy', 'yapyap_mcp_x');
    expect(t.deps.writeClipboard).toHaveBeenCalledWith('yapyap_mcp_x');
  });
});
