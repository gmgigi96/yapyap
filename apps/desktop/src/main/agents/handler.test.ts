import { describe, expect, it, vi } from 'vitest';
import type { ReadChat } from '../../adapter/active-chat.ts';
import { DEFAULT_AGENT_LIMITS, type AgentScope } from '../../shared/agents-api.ts';
import { chatId } from '../assistant/chats.ts';
import { answerAgent, type AgentHandlerDependencies } from './handler.ts';
import { failureLock, slidingCounter } from './limits.ts';
import type { AgentToken } from './tokens.ts';
import { accountQueue, type AgentPage } from './tool-steps.ts';

const PORT = 51_234;
const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const OTHER = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const PRESENTED = `yapyap_mcp_${'2'.repeat(16)}_${'1'.repeat(64)}`;

const token = (overrides: Partial<AgentToken> = {}): AgentToken => ({
  id: '2'.repeat(16),
  name: 'Claude Code',
  scopes: ['chat:read-active'],
  accounts: [ACCOUNT],
  chats: 'all',
  limits: DEFAULT_AGENT_LIMITS,
  created: 0,
  expires: null,
  notify: true,
  lastUsed: null,
  ...overrides,
});

/** A WhatsApp page in memory: a chat list, the open chat and its message box. */
function fakePage(open: string | null = 'Ana') {
  const state = { open, draft: '', sent: [] as string[] };
  const chat = (messages: number): ReadChat | null =>
    state.open === null
      ? null
      : {
          name: state.open,
          group: false,
          messages: [{ outgoing: false, text: 'Hi' }].slice(0, messages),
        };
  const page = {
    readOpenChat: vi.fn((messages: number) => Promise.resolve(chat(messages))),
    readUnread: vi.fn(() =>
      Promise.resolve([
        { name: 'Ana', unread: 2, messages: [{ outgoing: false, text: 'Dinner?' }] },
        { name: 'Rui', unread: 1, messages: [{ outgoing: false, text: 'Hello' }] },
      ]),
    ),
    readDraft: vi.fn(() => Promise.resolve(state.open === null ? null : state.draft)),
    replaceDraft: vi.fn((text: string) => {
      state.draft = text;
      return Promise.resolve(state.open !== null);
    }),
    pressEnter: vi.fn(() => {
      state.sent.push(state.draft);
      state.draft = '';
      return Promise.resolve(true);
    }),
    openChat: vi.fn((name: string) => {
      const found = ['Ana', 'Rui'].includes(name);
      if (found) {
        state.open = name;
      }
      return Promise.resolve(found);
    }),
  } satisfies AgentPage;
  return { state, page };
}

function setup(presented: AgentToken | undefined = token(), page = fakePage().page) {
  const deps = {
    tokens: { verify: vi.fn((given: string) => (given === PRESENTED ? presented : undefined)) },
    accounts: {
      list: () => [
        { id: ACCOUNT, name: 'Personal' },
        { id: OTHER, name: 'Work' },
      ],
      page: vi.fn((id: string) => (id === ACCOUNT ? page : undefined)),
    },
    counter: slidingCounter(() => 0),
    lock: failureLock(() => 0),
    queue: accountQueue(),
    record: vi.fn(),
    notifySent: vi.fn(),
    version: '1.2.3',
  } satisfies AgentHandlerDependencies;
  return deps;
}

const headers = (auth = `Bearer ${PRESENTED}`) => ({
  host: `127.0.0.1:${String(PORT)}`,
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  authorization: auth,
});

function post(deps: AgentHandlerDependencies, body: unknown, auth?: string) {
  return answerAgent(
    {
      remoteAddress: '127.0.0.1',
      method: 'POST',
      url: '/mcp',
      headers: headers(auth),
      body: JSON.stringify(body),
    },
    PORT,
    deps,
  );
}

/** The JSON-RPC message in an answer, sent as JSON or as one server-sent event. */
function messageOf(body: string): { result?: Record<string, unknown>; error?: unknown } {
  const data = body.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(data === undefined ? body : data.slice('data: '.length)) as never;
}

let id = 0;
async function call(deps: AgentHandlerDependencies, name: string, args: unknown = {}) {
  id += 1;
  const answer = await post(deps, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const result = messageOf(answer.body).result as {
    content: { text: string }[];
    isError?: boolean;
  };
  const text = result.content[0]?.text ?? '';
  return result.isError === true ? { failure: text } : { value: JSON.parse(text) as unknown };
}

async function toolNames(deps: AgentHandlerDependencies): Promise<string[]> {
  const answer = await post(deps, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const { tools } = messageOf(answer.body).result as { tools: { name: string }[] };
  return tools.map((tool) => tool.name);
}

describe('answerAgent', () => {
  it('turns away what the request checks refuse, before anything else', async () => {
    const deps = setup();
    const answer = await answerAgent(
      { remoteAddress: '192.0.2.7', method: 'POST', url: '/mcp', headers: headers(), body: '{}' },
      PORT,
      deps,
    );
    expect(answer).toEqual({ status: 403, headers: {}, body: '' });
    expect(deps.tokens.verify).not.toHaveBeenCalled();
  });

  it('asks for a token, and locks everyone out after too many wrong ones', async () => {
    const deps = setup();
    const wrong = await post(deps, {}, 'Bearer nope');
    expect(wrong).toEqual({ status: 401, headers: { 'www-authenticate': 'Bearer' }, body: '' });
    expect((await post(deps, {}, '')).status).toBe(401);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await post(deps, {}, 'Bearer nope');
    }
    expect((await post(deps, {})).status).toBe(429);
  });

  it('holds a token to its calls a minute, and none when Unlimited', async () => {
    const limited = setup(token({ limits: { ...DEFAULT_AGENT_LIMITS, callsPerMinute: 1 } }));
    expect((await post(limited, { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(200);
    expect((await post(limited, { jsonrpc: '2.0', id: 2, method: 'ping' })).status).toBe(429);
    const unlimited = setup(token({ limits: { ...DEFAULT_AGENT_LIMITS, callsPerMinute: null } }));
    for (let call = 0; call < 100; call += 1) {
      expect((await post(unlimited, { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(200);
    }
  });

  it('introduces itself as YapYap, in the version the agent asks for', async () => {
    const answer = await post(setup(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'agent', version: '1' },
      },
    });
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toMatch(/^(application\/json|text\/event-stream)/);
    expect(messageOf(answer.body).result).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'YapYap', version: '1.2.3' },
    });
  });

  it('acknowledges a notification with no body to type', async () => {
    const answer = await post(setup(), { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(answer).toEqual({ status: 202, headers: {}, body: '' });
  });

  it('lets the SDK refuse what is not MCP', async () => {
    const answer = await post(setup(), { hello: 'world' });
    expect(answer.status).toBeGreaterThanOrEqual(400);
  });
});

describe('the tools', () => {
  it('shows an agent only the tools its token’s scopes allow', async () => {
    expect(await toolNames(setup(token({ scopes: ['composer:read-draft'] })))).toEqual([
      'list_accounts',
      'read_draft',
    ]);
    const every: AgentScope[] = [
      'chat:read-unread-summary',
      'chat:read-active',
      'chat:open',
      'composer:read-draft',
      'composer:insert-draft',
      'messages:send',
    ];
    expect(await toolNames(setup(token({ scopes: every })))).toEqual([
      'list_accounts',
      'list_unread',
      'read_chat',
      'read_draft',
      'write_draft',
      'send_message',
    ]);
  });

  it('lists only the token’s accounts', async () => {
    const deps = setup();
    expect(await call(deps, 'list_accounts')).toEqual({
      value: [{ id: ACCOUNT, name: 'Personal' }],
    });
  });

  it('refuses an account the token does not name, and one that is not running', async () => {
    const deps = setup(token({ accounts: [ACCOUNT, OTHER] }));
    expect(await call(deps, 'read_chat', { account: OTHER })).toEqual({
      failure: 'account_not_allowed',
    });
    const narrow = setup();
    expect(await call(narrow, 'read_chat', { account: OTHER })).toEqual({
      failure: 'account_not_allowed',
    });
    expect(narrow.accounts.page).not.toHaveBeenCalledWith(OTHER);
    expect(narrow.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: '2'.repeat(16) }),
      'read_chat',
      OTHER,
      'account_not_allowed',
    );
  });

  it('lists unread chats, only those the token lists', async () => {
    const all = setup(token({ scopes: ['chat:read-unread-summary'] }));
    expect(await call(all, 'list_unread', { account: ACCOUNT })).toEqual({
      value: [
        { name: 'Ana', unread: 2, messages: [{ outgoing: false, text: 'Dinner?' }] },
        { name: 'Rui', unread: 1, messages: [{ outgoing: false, text: 'Hello' }] },
      ],
    });
    const listed = setup(token({ scopes: ['chat:read-unread-summary'], chats: [chatId('Rui')] }));
    expect(await call(listed, 'list_unread', { account: ACCOUNT })).toEqual({
      value: [{ name: 'Rui', unread: 1, messages: [{ outgoing: false, text: 'Hello' }] }],
    });
    expect(listed.record).toHaveBeenLastCalledWith(expect.anything(), 'list_unread', ACCOUNT, 'ok');
  });

  it('reads the open chat, refusing one the token does not list', async () => {
    const { page } = fakePage();
    const deps = setup(token(), page);
    expect(await call(deps, 'read_chat', { account: ACCOUNT })).toEqual({
      value: { name: 'Ana', group: false, messages: [{ outgoing: false, text: 'Hi' }] },
    });
    expect(page.readOpenChat).toHaveBeenLastCalledWith(20);
    await call(deps, 'read_chat', { account: ACCOUNT, messages: 5 });
    expect(page.readOpenChat).toHaveBeenLastCalledWith(5);
    const listed = setup(token({ chats: [chatId('Rui')] }), page);
    expect(await call(listed, 'read_chat', { account: ACCOUNT })).toEqual({
      failure: 'chat_not_allowed',
    });
    const closed = setup(token(), fakePage(null).page);
    expect(await call(closed, 'read_chat', { account: ACCOUNT })).toEqual({
      failure: 'no_chat_open',
    });
  });

  it('opens a named chat only with chat:open, and only one the token lists', async () => {
    const { page, state } = fakePage();
    const reading = setup(token({ chats: [chatId('Rui')] }), page);
    expect(await call(reading, 'read_chat', { account: ACCOUNT, chat: 'Rui' })).toEqual({
      failure: 'scope_missing',
    });
    const opening = setup(
      token({ scopes: ['chat:read-active', 'chat:open'], chats: [chatId('Rui')] }),
      page,
    );
    expect(await call(opening, 'read_chat', { account: ACCOUNT, chat: 'Ana' })).toEqual({
      failure: 'chat_not_allowed',
    });
    expect(page.openChat).not.toHaveBeenCalled();
    expect(await call(opening, 'read_chat', { account: ACCOUNT, chat: 'Rui' })).toMatchObject({
      value: { name: 'Rui' },
    });
    expect(state.open).toBe('Rui');
  });

  it('says a listed chat is not found when WhatsApp cannot open it, or opens another', async () => {
    const { page } = fakePage();
    const deps = setup(
      token({ scopes: ['chat:read-active', 'chat:open'], chats: [chatId('Eva'), chatId('Rui')] }),
      page,
    );
    expect(await call(deps, 'read_chat', { account: ACCOUNT, chat: 'Eva' })).toEqual({
      failure: 'chat_not_found',
    });
    page.openChat.mockResolvedValueOnce(true);
    page.readOpenChat.mockResolvedValueOnce(null);
    expect(await call(deps, 'read_chat', { account: ACCOUNT, chat: 'Rui' })).toEqual({
      failure: 'chat_not_found',
    });
  });

  it('calls a page that throws WhatsApp not ready, never a crash', async () => {
    const { page } = fakePage();
    page.readOpenChat.mockRejectedValueOnce(new Error('Gone.'));
    expect(await call(setup(token(), page), 'read_chat', { account: ACCOUNT })).toEqual({
      failure: 'whatsapp_not_ready',
    });
  });

  it('reads the draft of an allowed open chat', async () => {
    const { page, state } = fakePage();
    state.draft = 'See you';
    const deps = setup(token({ scopes: ['composer:read-draft'] }), page);
    expect(await call(deps, 'read_draft', { account: ACCOUNT })).toEqual({
      value: { draft: 'See you' },
    });
    const listed = setup(token({ scopes: ['composer:read-draft'], chats: [chatId('Rui')] }), page);
    expect(await call(listed, 'read_draft', { account: ACCOUNT })).toEqual({
      failure: 'chat_not_allowed',
    });
  });

  it('writes a draft without sending it, opening a named chat first', async () => {
    const { page, state } = fakePage();
    const scopes: AgentScope[] = ['composer:insert-draft', 'chat:open'];
    const deps = setup(token({ scopes, chats: [chatId('Ana'), chatId('Rui')] }), page);
    expect(await call(deps, 'write_draft', { account: ACCOUNT, text: 'On my way' })).toEqual({
      value: { written: true },
    });
    expect(await call(deps, 'write_draft', { account: ACCOUNT, chat: 'Rui', text: 'Hi' })).toEqual({
      value: { written: true },
    });
    expect(state).toMatchObject({ open: 'Rui', draft: 'Hi', sent: [] });
    page.replaceDraft.mockResolvedValueOnce(false);
    expect(await call(deps, 'write_draft', { account: ACCOUNT, text: 'Lost' })).toEqual({
      failure: 'no_chat_open',
    });
  });

  it('refuses arguments the tool’s schema does not take', async () => {
    const deps = setup(token({ scopes: ['composer:insert-draft'] }));
    const long = await call(deps, 'write_draft', { account: ACCOUNT, text: 'x'.repeat(4097) });
    expect(long).toHaveProperty('failure');
    expect(deps.record).not.toHaveBeenCalled();
  });
});

describe('send_message', () => {
  const sender = (overrides: Partial<AgentToken> = {}) =>
    token({ scopes: ['messages:send'], chats: [chatId('Ana'), chatId('Rui')], ...overrides });

  it('sends to a listed chat, opening it first, and tells the user', async () => {
    const { page, state } = fakePage();
    const deps = setup(sender(), page);
    expect(await call(deps, 'send_message', { account: ACCOUNT, chat: 'Rui', text: 'Hi' })).toEqual(
      { value: { sent: true } },
    );
    expect(state).toMatchObject({ open: 'Rui', draft: '', sent: ['Hi'] });
    expect(deps.notifySent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Claude Code' }),
      'Rui',
    );
    expect(deps.record).toHaveBeenLastCalledWith(expect.anything(), 'send_message', ACCOUNT, 'ok');
  });

  it('stays quiet when the token asks not to notify', async () => {
    const deps = setup(sender({ notify: false }));
    await call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' });
    expect(deps.notifySent).not.toHaveBeenCalled();
  });

  it('never sends to a chat the token does not list', async () => {
    const { page, state } = fakePage();
    const deps = setup(sender({ chats: [chatId('Rui')] }), page);
    expect(await call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' })).toEqual(
      { failure: 'chat_not_allowed' },
    );
    expect(state.sent).toEqual([]);
    expect(page.openChat).not.toHaveBeenCalled();
  });

  it('never touches what the user is typing', async () => {
    const { page, state } = fakePage();
    state.draft = 'Half a thought';
    const deps = setup(sender(), page);
    expect(await call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' })).toEqual(
      { failure: 'composer_busy' },
    );
    expect(state).toMatchObject({ draft: 'Half a thought', sent: [] });
    state.draft = '  ';
    expect(await call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' })).toEqual(
      { value: { sent: true } },
    );
  });

  it('holds sending to the token’s limits a minute and a day', async () => {
    const minute = setup(sender({ limits: { ...DEFAULT_AGENT_LIMITS, sendsPerMinute: 1 } }));
    const send = (deps: AgentHandlerDependencies) =>
      call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' });
    expect(await send(minute)).toEqual({ value: { sent: true } });
    expect(await send(minute)).toEqual({ failure: 'rate_limited' });
    const day = setup(sender({ limits: { ...DEFAULT_AGENT_LIMITS, sendsPerDay: 1 } }));
    expect(await send(day)).toEqual({ value: { sent: true } });
    expect(await send(day)).toEqual({ failure: 'rate_limited' });
    const unlimited = setup(
      sender({ limits: { callsPerMinute: null, sendsPerMinute: null, sendsPerDay: null } }),
    );
    for (let message = 0; message < 20; message += 1) {
      expect(await send(unlimited)).toEqual({ value: { sent: true } });
    }
  });

  it('says no chat is open when the message box is gone', async () => {
    const { page, state } = fakePage();
    const deps = setup(sender(), page);
    page.pressEnter.mockResolvedValueOnce(false);
    expect(await call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' })).toEqual(
      { failure: 'no_chat_open' },
    );
    // What failed to send stays in the box, so the next send waits for the user.
    expect(await call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' })).toEqual(
      { failure: 'composer_busy' },
    );
    state.draft = '';
    page.replaceDraft.mockResolvedValueOnce(false);
    expect(await call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' })).toEqual(
      { failure: 'no_chat_open' },
    );
    page.readDraft.mockResolvedValueOnce(null);
    expect(await call(deps, 'send_message', { account: ACCOUNT, chat: 'Ana', text: 'Hi' })).toEqual(
      { value: { sent: true } },
    );
  });
});

describe('accountQueue', () => {
  it('runs one account’s calls one after another, even after one fails', async () => {
    const queue = accountQueue();
    const order: string[] = [];
    let release = (): void => undefined;
    const first = queue('a', () =>
      new Promise<void>((resolve) => (release = resolve)).then(() => {
        order.push('first');
      }),
    );
    const failing = queue('a', () => Promise.reject(new Error('Failed.')));
    const third = queue('a', () => {
      order.push('third');
      return Promise.resolve('done');
    });
    const other = queue('b', () => {
      order.push('other');
      return Promise.resolve();
    });
    await other;
    expect(order).toEqual(['other']);
    release();
    await first;
    await expect(failing).rejects.toThrow('Failed.');
    await expect(third).resolves.toBe('done');
    expect(order).toEqual(['other', 'first', 'third']);
  });
});
