import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADAPTER_WORLD_ID } from '../../adapter/world.ts';
import { LOGIN_CODE } from '../../adapter/login-code.ts';
import { PAGE_STATE_PROBE } from '../../adapter/page-state.ts';
import { en } from '../../shared/messages/en.ts';
import { PAIRING_CHECK_MS, renderCode, showPairingCodes } from './pairing.ts';

const WHITE = '\u001b[30;107m';
const RESET = '\u001b[0m';

/** A 21-module code: dark modules along the diagonal. */
const DIAGONAL = Array.from({ length: 21 }, (_row, y) =>
  Array.from({ length: 21 }, (_cell, x) => (x === y ? '1' : '0')).join(''),
);
const FULL = Array.from({ length: 21 }, () => '1'.repeat(21));

const LOGGED_OUT = { view: 'logged-out', chatOpen: false, unread: 0 };
const CHATS = { view: 'chats', chatOpen: false, unread: 0 };

/** A page that answers the state probe with `state()` and the code probe with `code()`. */
function pageOf(state: () => unknown, code: () => unknown = () => DIAGONAL) {
  return {
    executeJavaScriptInIsolatedWorld: vi.fn((world: number, [script]: { code: string }[]) => {
      const source = script?.code;
      expect(world).toBe(ADAPTER_WORLD_ID);
      return Promise.resolve(
        source === PAGE_STATE_PROBE ? state() : source === LOGIN_CODE ? code() : null,
      );
    }),
  };
}

function setUp(
  isTTY: boolean,
  accounts: { id: string; name: string; page: ReturnType<typeof pageOf> }[],
) {
  const terminal = { isTTY, write: vi.fn() };
  showPairingCodes({ accounts: () => accounts, terminal, every: setInterval });
  const tick = () => vi.advanceTimersByTimeAsync(PAIRING_CHECK_MS);
  return { terminal, tick };
}

describe('renderCode', () => {
  it('draws two modules a character, black on white, inside a quiet zone of 4', () => {
    const lines = renderCode(DIAGONAL).split('\n');
    expect(lines.pop()).toBe('');
    // 21 modules and 8 of quiet zone make 29 rows, so 15 lines.
    expect(lines).toHaveLength(15);
    for (const line of lines) {
      expect(line.startsWith(WHITE) && line.endsWith(RESET)).toBe(true);
      expect(line.slice(WHITE.length, -RESET.length)).toHaveLength(29);
    }
    const body = lines.map((line) => line.slice(WHITE.length, -RESET.length));
    expect(body.slice(0, 2)).toEqual([' '.repeat(29), ' '.repeat(29)]);
    expect(body[2]).toBe(`${' '.repeat(4)}▀▄${' '.repeat(23)}`);
    expect(body[3]).toBe(`${' '.repeat(6)}▀▄${' '.repeat(21)}`);
    // The last code row pairs with the quiet zone below it.
    expect(body[12]).toBe(`${' '.repeat(24)}▀${' '.repeat(4)}`);
    expect(body.at(-1)).toBe(' '.repeat(29));
  });

  it('draws two dark modules as a full block', () => {
    const body = renderCode(FULL).split('\n')[2]?.slice(WHITE.length, -RESET.length);
    expect(body).toBe(`${' '.repeat(4)}${'█'.repeat(21)}${' '.repeat(4)}`);
  });
});

describe('showPairingCodes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a logged-out account’s code under its name, again only when it changes', async () => {
    let code = DIAGONAL;
    const page = pageOf(
      () => LOGGED_OUT,
      () => code,
    );
    const { terminal, tick } = setUp(true, [{ id: 'a', name: 'Work', page }]);
    expect(terminal.write).not.toHaveBeenCalled();
    await tick();
    expect(terminal.write).toHaveBeenCalledExactlyOnceWith(
      `${en.headless.scan({ account: 'Work' })}\n${renderCode(DIAGONAL)}`,
    );
    await tick();
    expect(terminal.write).toHaveBeenCalledOnce();
    code = FULL;
    await tick();
    expect(terminal.write).toHaveBeenLastCalledWith(
      `${en.headless.scan({ account: 'Work' })}\n${renderCode(FULL)}`,
    );
  });

  it('says once that the account is linked, after showing its code', async () => {
    let state: unknown = LOGGED_OUT;
    const { terminal, tick } = setUp(true, [{ id: 'a', name: 'Work', page: pageOf(() => state) }]);
    await tick();
    state = { view: 'loading', chatOpen: false, unread: 0 };
    await tick();
    expect(terminal.write).toHaveBeenCalledOnce();
    state = CHATS;
    await tick();
    await tick();
    expect(terminal.write).toHaveBeenCalledTimes(2);
    expect(terminal.write).toHaveBeenLastCalledWith(`${en.headless.linked({ account: 'Work' })}\n`);
  });

  it('says nothing for an account that was already linked, loading or unreadable', async () => {
    const pages = [
      pageOf(() => CHATS),
      pageOf(() => ({ view: 'loading', chatOpen: false, unread: 0 })),
      pageOf(() => 'garbage'),
      pageOf(
        () => LOGGED_OUT,
        () => ['1'],
      ),
      pageOf(() => Promise.reject(new Error('navigating'))),
    ];
    const { terminal, tick } = setUp(
      true,
      pages.map((page, index) => ({ id: String(index), name: 'Work', page })),
    );
    await tick();
    expect(terminal.write).not.toHaveBeenCalled();
    for (const page of pages) {
      expect(page.executeJavaScriptInIsolatedWorld).toHaveBeenCalled();
    }
  });

  it('shows each account’s own code', async () => {
    const { terminal, tick } = setUp(true, [
      {
        id: 'a',
        name: 'Work',
        page: pageOf(
          () => LOGGED_OUT,
          () => DIAGONAL,
        ),
      },
      {
        id: 'b',
        name: 'Home',
        page: pageOf(
          () => LOGGED_OUT,
          () => DIAGONAL,
        ),
      },
    ]);
    await tick();
    expect(terminal.write.mock.calls).toEqual([
      [`${en.headless.scan({ account: 'Work' })}\n${renderCode(DIAGONAL)}`],
      [`${en.headless.scan({ account: 'Home' })}\n${renderCode(DIAGONAL)}`],
    ]);
  });

  it('never reads the code without a terminal, and says once how to see it', async () => {
    const page = pageOf(() => LOGGED_OUT);
    const { terminal, tick } = setUp(false, [
      { id: 'a', name: 'Work', page },
      { id: 'b', name: 'Home', page: pageOf(() => LOGGED_OUT) },
    ]);
    await tick();
    await tick();
    expect(terminal.write.mock.calls).toEqual([
      [`${en.headless.notTerminal({ account: 'Work' })}\n`],
      [`${en.headless.notTerminal({ account: 'Home' })}\n`],
    ]);
    const asked = page.executeJavaScriptInIsolatedWorld.mock.calls.map(
      ([, [script]]) => script?.code,
    );
    expect(asked).not.toContain(LOGIN_CODE);
  });
});
