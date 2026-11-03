import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_LIMITS, type AgentTokenSpec } from '../../shared/agents-api.ts';
import { checkSpec } from './token-spec.ts';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const ACCOUNTS = new Set([ACCOUNT]);

const spec = (overrides: Partial<AgentTokenSpec> = {}): AgentTokenSpec => ({
  name: 'Claude Code',
  scopes: ['chat:read-active'],
  accounts: [ACCOUNT],
  chats: 'all',
  limits: DEFAULT_AGENT_LIMITS,
  expiresInDays: 30,
  notify: true,
  ...overrides,
});

describe('checkSpec', () => {
  it('accepts a complete token, Unlimited limits and no expiry included', () => {
    expect(checkSpec(spec(), ACCOUNTS)).toEqual(spec());
    const unlimited = { callsPerMinute: null, sendsPerMinute: null, sendsPerDay: null };
    const lasting = spec({ limits: unlimited, expiresInDays: null });
    expect(checkSpec(lasting, ACCOUNTS)).toEqual(lasting);
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['an empty name', { name: '' }],
    ['no scopes', { scopes: [] }],
    ['an unknown scope', { scopes: ['messages:delete'] }],
    ['a repeated scope', { scopes: ['chat:open', 'chat:open'] }],
    ['no accounts', { accounts: [] }],
    ['a limit of zero', { limits: { ...DEFAULT_AGENT_LIMITS, callsPerMinute: 0 } }],
    ['a fractional limit', { limits: { ...DEFAULT_AGENT_LIMITS, sendsPerDay: 1.5 } }],
    ['an unoffered expiry', { expiresInDays: 14 }],
    ['an extra field', { owner: 'someone' }],
  ])('calls %s invalid', (_case, overrides) => {
    expect(checkSpec({ ...spec(), ...overrides }, ACCOUNTS)).toBe('invalid');
  });

  it('asks for a chat when the list of chats is empty', () => {
    expect(checkSpec(spec({ chats: [] }), ACCOUNTS)).toBe('noChats');
  });

  it('refuses what is not an object at all', () => {
    expect(checkSpec(null, ACCOUNTS)).toBe('invalid');
    expect(checkSpec('token', ACCOUNTS)).toBe('invalid');
  });

  it('lists chats by name, number or both, never by nothing', () => {
    const chats = [
      { name: 'Vasco Guita', phone: '+44 7700 900123' },
      { name: 'Ana', phone: null },
      { name: null, phone: '0044 7700 900456' },
    ];
    expect(checkSpec(spec({ chats }), ACCOUNTS)).toMatchObject({ chats });
    const nothing = [{ name: null, phone: null }];
    expect(checkSpec(spec({ chats: nothing }), ACCOUNTS)).toBe('invalid');
    const blank = [{ name: '  ', phone: null }];
    expect(checkSpec(spec({ chats: blank }), ACCOUNTS)).toBe('invalid');
    expect(checkSpec({ ...spec(), chats: ['Ana'] }, ACCOUNTS)).toBe('invalid');
  });

  it('refuses a number that is not international', () => {
    const local = [{ name: 'Ana', phone: '07700 900123' }];
    expect(checkSpec(spec({ chats: local }), ACCOUNTS)).toBe('invalidPhone');
  });

  it('refuses an account YapYap does not have', () => {
    expect(checkSpec(spec({ accounts: ['gone'] }), ACCOUNTS)).toBe('unknownAccount');
  });

  it('makes a token that opens chats or sends list its chats', () => {
    expect(checkSpec(spec({ scopes: ['chat:open'] }), ACCOUNTS)).toBe('chatsNeeded');
    expect(checkSpec(spec({ scopes: ['messages:send'] }), ACCOUNTS)).toBe('chatsNeeded');
    const listed = spec({ scopes: ['chat:open'], chats: [{ name: 'Ana', phone: null }] });
    expect(checkSpec(listed, ACCOUNTS)).toEqual(listed);
  });

  it('makes a token that sends expire within 30 days', () => {
    const sending = {
      scopes: ['messages:send'] as const,
      chats: [{ name: null, phone: '+44 7700 900123' }],
    };
    expect(checkSpec(spec({ ...sending, expiresInDays: 90 }), ACCOUNTS)).toBe('sendingExpiry');
    expect(checkSpec(spec({ ...sending, expiresInDays: null }), ACCOUNTS)).toBe('sendingExpiry');
    expect(checkSpec(spec({ ...sending, expiresInDays: 30 }), ACCOUNTS)).toMatchObject(sending);
    expect(checkSpec(spec({ expiresInDays: 90 }), ACCOUNTS)).toMatchObject({ expiresInDays: 90 });
  });
});
