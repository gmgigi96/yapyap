import { describe, expect, it, vi } from 'vitest';
import type { ProxyLoginAnswer } from '../../shared/api/chrome-api.ts';
import { createProxyLogin, DECLINE_MS } from './proxy-login.ts';

const PROXY = { isProxy: true, host: 'proxy.example.org', port: 3128 };
const NAME = 'proxy:proxy.example.org:3128';

function setup(saved?: string) {
  const store = new Map<string, string>(saved === undefined ? [] : [[NAME, saved]]);
  let answer: ((credentials: ProxyLoginAnswer | undefined) => void) | undefined;
  const deps = {
    secrets: {
      canKeep: () => Promise.resolve(true),
      get: (name: string) => Promise.resolve(store.get(name)),
      set: vi.fn((name: string, value: string | undefined) => {
        if (value === undefined) {
          store.delete(name);
        } else {
          store.set(name, value);
        }
        return Promise.resolve(true);
      }),
    },
    ask: vi.fn(
      () =>
        new Promise<ProxyLoginAnswer | undefined>((resolve) => {
          answer = resolve;
        }),
    ),
    now: vi.fn(() => 0),
  };
  const login = createProxyLogin(deps);
  const event = () => ({ preventDefault: vi.fn() });
  return {
    deps,
    login,
    event,
    store,
    answer: (credentials?: ProxyLoginAnswer) => answer?.(credentials),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('createProxyLogin', () => {
  it('leaves sign-ins to sites alone', () => {
    const t = setup();
    const event = t.event();
    const callback = vi.fn();
    t.login.handle(event, {}, { ...PROXY, isProxy: false }, callback);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(t.deps.ask).not.toHaveBeenCalled();
  });

  it('asks once for every request waiting on the same proxy, and keeps the answer if asked to', async () => {
    const t = setup();
    const first = vi.fn();
    const second = vi.fn();
    t.login.handle(t.event(), {}, PROXY, first);
    t.login.handle(t.event(), {}, PROXY, second);
    await settle();
    expect(t.deps.ask).toHaveBeenCalledExactlyOnceWith({
      host: 'proxy.example.org',
      port: 3128,
      failed: false,
      canRemember: true,
    });
    t.answer({ username: 'ana', password: 'hunter2', remember: true });
    await settle();
    expect(first).toHaveBeenCalledExactlyOnceWith('ana', 'hunter2');
    expect(second).toHaveBeenCalledExactlyOnceWith('ana', 'hunter2');
    expect(JSON.parse(t.store.get(NAME) ?? '')).toMatchObject({
      username: 'ana',
      password: 'hunter2',
    });
  });

  it('signs in with saved credentials once per session, then asks, saying they failed', async () => {
    const t = setup(JSON.stringify({ username: 'ana', password: 'old' }));
    const session = {};
    const callback = vi.fn();
    t.login.handle(t.event(), session, PROXY, callback);
    await settle();
    expect(callback).toHaveBeenCalledExactlyOnceWith('ana', 'old');
    expect(t.deps.ask).not.toHaveBeenCalled();
    t.login.handle(t.event(), session, PROXY, callback);
    await settle();
    expect(t.deps.ask).toHaveBeenCalledWith(expect.objectContaining({ failed: true }));
    t.answer({ username: 'ana', password: 'new', remember: false });
    await settle();
    expect(callback).toHaveBeenLastCalledWith('ana', 'new');
    // Not remembering this time forgets the old, refused password too.
    expect(t.store.has(NAME)).toBe(false);
  });

  it('stops asking for a while after the user cancels', async () => {
    const t = setup();
    const callback = vi.fn();
    t.login.handle(t.event(), {}, PROXY, callback);
    await settle();
    t.answer();
    await settle();
    expect(callback).toHaveBeenCalledExactlyOnceWith(undefined, undefined);
    t.deps.now.mockReturnValue(DECLINE_MS - 1);
    t.login.handle(t.event(), {}, PROXY, callback);
    await settle();
    expect(callback).toHaveBeenLastCalledWith();
    expect(t.deps.ask).toHaveBeenCalledOnce();
    t.deps.now.mockReturnValue(DECLINE_MS);
    t.login.handle(t.event(), {}, PROXY, callback);
    await settle();
    expect(t.deps.ask).toHaveBeenCalledTimes(2);
  });

  it('asks when the saved credentials cannot be read', async () => {
    for (const saved of ['{', '{"username":"ana"}', 'null']) {
      const t = setup(saved);
      t.login.handle(t.event(), {}, PROXY, vi.fn());
      await settle();
      expect(t.deps.ask).toHaveBeenCalledOnce();
    }
  });
});
