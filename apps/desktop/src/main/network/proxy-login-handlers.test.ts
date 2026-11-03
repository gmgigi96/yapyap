import { describe, expect, it, vi } from 'vitest';
import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import { createProxyLoginPrompt } from './proxy-login-handlers.ts';

const REQUEST = { host: 'proxy.example.org', port: 3128, failed: false, canRemember: true };
const ANSWER = { username: 'ana', password: 'hunter2', remember: true };

function setup() {
  let closed: (() => void) | undefined;
  const window = {
    webContents: {},
    close: vi.fn(() => closed?.()),
    onClosed: (listener: () => void) => {
      closed = listener;
    },
  };
  const open = vi.fn(() => window);
  const prompt = createProxyLoginPrompt(open);
  const handler = (channel: string) => {
    const found = prompt.handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(channel);
    }
    return found;
  };
  const own = { sender: window.webContents };
  return { prompt, window, open, handler, own, closeByUser: () => closed?.() };
}

describe('createProxyLoginPrompt', () => {
  it('shows the request to its own window and resolves with the answer', async () => {
    const t = setup();
    const asked = t.prompt.ask(REQUEST);
    expect(t.handler(CHROME_CHANNELS.proxyLoginRequest).handle(t.own)).toBe(REQUEST);
    expect(() => t.handler(CHROME_CHANNELS.proxyLoginRequest).handle({ sender: {} })).toThrow(
      'No proxy sign-in belongs to this window.',
    );
    t.handler(CHROME_CHANNELS.proxyLoginAnswer).handle(t.own, ANSWER);
    await expect(asked).resolves.toEqual(ANSWER);
    expect(t.window.close).toHaveBeenCalledOnce();
  });

  it('cancels when the user cancels or closes the window, and asks about one proxy at a time', async () => {
    const t = setup();
    const asked = t.prompt.ask(REQUEST);
    await expect(t.prompt.ask(REQUEST)).resolves.toBeUndefined();
    t.handler(CHROME_CHANNELS.proxyLoginAnswer).handle(t.own, null);
    await expect(asked).resolves.toBeUndefined();
    const again = t.prompt.ask(REQUEST);
    t.closeByUser();
    await expect(again).resolves.toBeUndefined();
    expect(t.open).toHaveBeenCalledTimes(2);
  });

  it('refuses malformed answers, and remembering where nothing can be kept', () => {
    const t = setup();
    void t.prompt.ask({ ...REQUEST, canRemember: false });
    const answer = t.handler(CHROME_CHANNELS.proxyLoginAnswer);
    expect(answer.accepts([ANSWER])).toBe(true);
    expect(answer.accepts([])).toBe(false);
    // Each bad answer is otherwise valid, so only its own fault refuses it.
    const kept = { ...ANSWER, remember: false };
    for (const bad of [
      ANSWER,
      'ana',
      { ...kept, remember: 'yes' },
      { ...kept, extra: true },
      { ...kept, username: 'a'.repeat(257) },
      { ...kept, password: 7 },
      { ...kept, password: ['hunter2'] },
      { ...kept, password: 'p'.repeat(1025) },
      { ...kept, username: 7 },
    ]) {
      expect(() => answer.handle(t.own, bad)).toThrow('Not a proxy sign-in answer.');
    }
    answer.handle(t.own, { ...kept, username: 'a'.repeat(256), password: 'p'.repeat(1024) });
    expect(t.window.close).toHaveBeenCalledOnce();
  });
});
