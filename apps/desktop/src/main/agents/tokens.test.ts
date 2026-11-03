import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENT_LIMITS, type AgentTokenSpec } from '../../shared/api/agents-api.ts';
import { chatId } from '../assistant/chats.ts';
import { agentTokens, MAX_TOKENS, reaches, reachesPhone } from './tokens.ts';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const OTHER = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const DAY = 86_400_000;

const spec = (overrides: Partial<AgentTokenSpec> = {}): AgentTokenSpec => ({
  name: ' Claude Code ',
  scopes: ['chat:read-active', 'chat:open'],
  accounts: [ACCOUNT, OTHER],
  chats: [
    { name: 'Ana', phone: null },
    { name: 'Rui', phone: '+44 7700 900123' },
  ],
  limits: DEFAULT_AGENT_LIMITS,
  expiresInDays: 7,
  notify: true,
  ...overrides,
});

/** The tokens over a file and secrets in memory, with counting random bytes. */
function setup(text = '', canKeep = true) {
  const file = {
    text,
    read: () => file.text,
    write: vi.fn((next: string) => {
      file.text = next;
    }),
  };
  const kept = new Map<string, string>();
  const names = {
    get: vi.fn((name: string) => Promise.resolve(kept.get(name))),
    set: vi.fn((name: string, value: string | undefined) => {
      if (canKeep && value !== undefined) {
        kept.set(name, value);
      }
      return canKeep ? Promise.resolve(true) : Promise.reject(new Error('No keyring.'));
    }),
    forgetAll: vi.fn((prefix: string) => {
      for (const name of [...kept.keys()].filter((entry) => entry.startsWith(prefix))) {
        kept.delete(name);
      }
    }),
  };
  let counter = 0;
  const clock = { now: 1_000 };
  const warn = vi.fn();
  const tokens = agentTokens({
    file,
    names,
    randomHex: (bytes) => {
      counter += 1;
      return String(counter % 10).repeat(bytes * 2);
    },
    now: () => clock.now,
    warn,
  });
  return { file, kept, names, tokens, clock, warn };
}

/** A listed chat's ID, as the store derives it from its name and number. */
const entryId = (name: string | null, phone: string | null): string =>
  chatId(`entry:${name ?? ''}\n${phone ?? ''}`);
const ANA = entryId('Ana', null);
const RUI = entryId('Rui', '+447700900123');

const SECRET = '1'.repeat(64);
const ID = '2'.repeat(16);
const PRESENTED = `yapyap_mcp_${ID}_${SECRET}`;

describe('agentTokens', () => {
  it('shows a new token once, and keeps only its hash and its chats’ fingerprints', async () => {
    const t = setup();
    expect(await t.tokens.create(spec())).toBe(PRESENTED);
    expect(t.file.text).not.toContain(SECRET);
    expect(t.file.text).not.toContain('Ana');
    expect(t.file.text).not.toContain('7700');
    expect(t.file.text).toContain(createHash('sha256').update(SECRET).digest('hex'));
    expect(t.file.text).toContain(chatId('Ana'));
    expect(t.file.text).toContain(chatId('phone:447700900123'));
    expect(t.file.text.endsWith('\n')).toBe(true);
    expect(JSON.parse(t.kept.get(`agents/chat/${ID}/${RUI}`) ?? '')).toEqual({
      name: 'Rui',
      phone: '+447700900123',
    });
    expect(t.tokens.count()).toBe(1);
  });

  it('accepts its own token while it is valid, and nothing else', async () => {
    const t = setup();
    await t.tokens.create(spec());
    const token = t.tokens.verify(PRESENTED);
    expect(token).toMatchObject({
      id: ID,
      name: 'Claude Code',
      accounts: [ACCOUNT, OTHER],
      expires: 1_000 + 7 * DAY,
      lastUsed: 1_000,
    });
    expect(token && 'hash' in token).toBe(false);
    expect(t.tokens.verify(`yapyap_mcp_${ID}_${'3'.repeat(64)}`)).toBeUndefined();
    expect(t.tokens.verify(`yapyap_mcp_${'4'.repeat(16)}_${SECRET}`)).toBeUndefined();
    expect(t.tokens.verify(`${PRESENTED}0`)).toBeUndefined();
    expect(t.tokens.verify('')).toBeUndefined();
    t.clock.now = 1_000 + 7 * DAY - 1;
    expect(t.tokens.verify(PRESENTED)).toBeDefined();
    t.clock.now = 1_000 + 7 * DAY;
    expect(t.tokens.verify(PRESENTED)).toBeUndefined();
  });

  it('keeps a token that never expires, and one that reaches every chat', async () => {
    const t = setup();
    await t.tokens.create(spec({ chats: 'all', expiresInDays: null }));
    t.clock.now = Number.MAX_SAFE_INTEGER;
    expect(t.tokens.verify(PRESENTED)).toMatchObject({ chats: 'all', expires: null });
    expect(t.names.set).not.toHaveBeenCalled();
  });

  it('lists tokens with their chats’ names, unnamed where the system kept none', async () => {
    const t = setup('', false);
    await t.tokens.create(spec());
    const [view] = await t.tokens.list();
    expect(view).toEqual({
      id: ID,
      name: 'Claude Code',
      scopes: ['chat:read-active', 'chat:open'],
      accounts: [ACCOUNT, OTHER],
      chats: [
        { id: ANA, name: null, phone: null },
        { id: RUI, name: null, phone: null },
      ],
      limits: DEFAULT_AGENT_LIMITS,
      expires: 1_000 + 7 * DAY,
      notify: true,
      lastUsed: null,
    });
    t.names.get.mockRejectedValueOnce(new Error('Locked.'));
    expect((await t.tokens.list())[0]?.chats).toHaveLength(2);
  });

  it('lists all chats as such, and the names it kept', async () => {
    const t = setup();
    await t.tokens.create(spec());
    await t.tokens.create(spec({ chats: 'all' }));
    const [listed, everything] = await t.tokens.list();
    expect(listed?.chats).toEqual([
      { id: ANA, name: 'Ana', phone: null },
      { id: RUI, name: 'Rui', phone: '+447700900123' },
    ]);
    expect(everything?.chats).toBe('all');
  });

  it('gives an agent the chats its token lists, as far as they were kept', async () => {
    const t = setup();
    await t.tokens.create(spec());
    await t.tokens.create(spec({ chats: 'all' }));
    t.kept.set(`agents/chat/${ID}/${ANA}`, 'not JSON');
    expect(await t.tokens.listed(ID)).toEqual({
      chats: [{ name: 'Rui', phone: '+447700900123' }],
      unnamed: 1,
    });
    expect(await t.tokens.listed('4'.repeat(16))).toBe('all');
    expect(await t.tokens.listed('f'.repeat(16))).toEqual({ chats: [], unnamed: 0 });
  });

  it('keeps a chat listed by number alone, and reads odd details as none', async () => {
    const t = setup();
    await t.tokens.create(spec({ chats: [{ name: '  ', phone: '0044 7700 900456' }] }));
    await t.tokens.create(spec({ chats: [{ name: null, phone: '+44 7700 900789' }] }));
    expect(await t.tokens.listed('4'.repeat(16))).toEqual({
      chats: [{ name: null, phone: '+447700900789' }],
      unnamed: 0,
    });
    const only = entryId(null, '+447700900456');
    expect(await t.tokens.listed(ID)).toEqual({
      chats: [{ name: null, phone: '+447700900456' }],
      unnamed: 0,
    });
    t.kept.set(`agents/chat/${ID}/${only}`, '{"name":7,"phone":["x"]}');
    expect(await t.tokens.listed(ID)).toEqual({ chats: [], unnamed: 1 });
  });

  it('reads back what it saved, and starts empty from a missing or foreign file', async () => {
    const t = setup();
    await t.tokens.create(spec());
    expect(setup(t.file.text).tokens.verify(PRESENTED)).toBeDefined();
    expect(setup('{').tokens.count()).toBe(0);
    expect(setup('{"version":2,"tokens":[]}').tokens.count()).toBe(0);
    const missing = setup();
    missing.file.read = () => {
      throw new Error('ENOENT');
    };
    expect(agentTokens({ ...missing, randomHex: () => '', now: () => 0 }).count()).toBe(0);
  });

  it('revokes a token and forgets its chat names', async () => {
    const t = setup();
    await t.tokens.create(spec());
    t.tokens.revoke('f'.repeat(16));
    expect(t.tokens.count()).toBe(1);
    t.tokens.revoke(ID);
    expect(t.tokens.count()).toBe(0);
    expect(t.tokens.verify(PRESENTED)).toBeUndefined();
    expect(t.kept.size).toBe(0);
    expect(t.names.forgetAll).toHaveBeenCalledWith(`agents/chat/${ID}/`);
  });

  it('narrows a token one step at a time, never leaving it with nothing', async () => {
    const t = setup();
    await t.tokens.create(spec());
    expect(t.tokens.narrow(ID, { scope: 'chat:open' })).toBe(true);
    expect(t.tokens.narrow(ID, { scope: 'chat:read-active' })).toBe(false);
    expect(t.tokens.narrow(ID, { scope: 'messages:send' })).toBe(false);
    expect(t.tokens.narrow(ID, { account: OTHER })).toBe(true);
    expect(t.tokens.narrow(ID, { account: ACCOUNT })).toBe(false);
    expect(t.tokens.narrow(ID, { chat: RUI })).toBe(true);
    expect(t.tokens.narrow(ID, { chat: ANA })).toBe(false);
    expect(t.tokens.narrow('f'.repeat(16), { account: ACCOUNT })).toBe(false);
    expect(t.tokens.verify(PRESENTED)).toMatchObject({
      scopes: ['chat:read-active'],
      accounts: [ACCOUNT],
      chats: [{ id: ANA, name: chatId('Ana'), phone: null }],
    });
    expect(setup(t.file.text).tokens.verify(PRESENTED)?.scopes).toEqual(['chat:read-active']);
  });

  it('narrows only the token it names', async () => {
    const t = setup();
    await t.tokens.create(spec());
    const other = await t.tokens.create(spec({ name: 'Other' }));
    expect(t.tokens.narrow(ID, { scope: 'chat:open' })).toBe(true);
    expect(t.tokens.verify(other)?.scopes).toEqual(['chat:read-active', 'chat:open']);
  });

  it('cannot narrow the chats of a token that reaches them all', async () => {
    const t = setup();
    await t.tokens.create(spec({ chats: 'all' }));
    expect(t.tokens.narrow(ID, { chat: ANA })).toBe(false);
  });

  it('tells the log when it cannot save', async () => {
    const t = setup();
    t.file.write.mockImplementation(() => {
      throw new Error('EACCES');
    });
    await t.tokens.create(spec());
    expect(t.warn).toHaveBeenCalledWith('Could not save the agent tokens.');
  });

  it('keeps at most a few tokens in its file', () => {
    expect(MAX_TOKENS).toBe(20);
  });
});

describe('reaches and reachesPhone', () => {
  const listed = {
    chats: [
      { id: ANA, name: chatId('Ana'), phone: null },
      { id: RUI, name: null, phone: chatId('phone:447700900123') },
    ],
  };

  it('lets a token reach every chat, or only those it lists by name', () => {
    expect(reaches({ chats: 'all' }, 'Anyone')).toBe(true);
    expect(reaches(listed, 'Ana')).toBe(true);
    expect(reaches(listed, 'Rui')).toBe(false);
  });

  it('lets a token reach a number only when it lists that number', () => {
    expect(reachesPhone({ chats: 'all' }, '447700900999')).toBe(true);
    expect(reachesPhone(listed, '447700900123')).toBe(true);
    expect(reachesPhone(listed, '447700900999')).toBe(false);
    // A chat named like a number is not that number.
    expect(
      reachesPhone(
        { chats: [{ id: ANA, name: chatId('447700900123'), phone: null }] },
        '447700900123',
      ),
    ).toBe(false);
  });
});
