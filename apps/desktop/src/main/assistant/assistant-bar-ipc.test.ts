import { describe, expect, it, vi } from 'vitest';
import type { ViewRegistry } from '../security/views.ts';
import { listenToAssistantBar } from './assistant-bar-ipc.ts';

const ORIGIN = 'https://web.whatsapp.com';

function setup() {
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => void>();
  const ipc = {
    on: vi.fn((channel: string, listener: (event: never, ...args: unknown[]) => void) => {
      listeners.set(channel, listener as (event: unknown, ...args: unknown[]) => void);
    }),
  };
  const bar = {
    suggest: vi.fn(() => Promise.resolve()),
    summarize: vi.fn(() => Promise.resolve()),
    rewrite: vi.fn(() => Promise.resolve()),
    catchUp: vi.fn(() => Promise.resolve()),
    prompt: vi.fn(() => Promise.resolve()),
    use: vi.fn(() => Promise.resolve()),
    send: vi.fn(() => Promise.resolve()),
    choose: vi.fn(() => Promise.resolve()),
    button: vi.fn(() => Promise.resolve()),
  };
  const openSettings = vi.fn();
  const active = {};
  const views: ViewRegistry = new WeakMap();
  views.set(active, { zone: 'whatsapp', home: ORIGIN, label: 'Home', account: 'a' });
  const warn = vi.fn();
  let page: object = active;
  listenToAssistantBar(ipc, bar, {
    views,
    origin: ORIGIN,
    activePage: () => page,
    openSettings,
    warn,
  });
  const fromBar = { sender: active, senderFrame: { url: `${ORIGIN}/` } };
  const hear = async (channel: string, event: object, ...args: unknown[]): Promise<void> => {
    listeners.get(`whatsapp:assistant-bar-${channel}`)?.(event, ...args);
    // Each action runs after a resolved promise, so let it.
    await Promise.resolve();
  };
  return {
    ipc,
    bar,
    openSettings,
    views,
    warn,
    fromBar,
    hear,
    switchTo: (other: object) => {
      page = other;
    },
  };
}

describe('listenToAssistantBar', () => {
  it('passes each of the bar’s actions on, a request trimmed', async () => {
    const t = setup();
    await t.hear('suggest', t.fromBar);
    await t.hear('summarize', t.fromBar);
    await t.hear('rewrite', t.fromBar, 'translate:pt');
    await t.hear('catch-up', t.fromBar);
    await t.hear('prompt', t.fromBar, '  say I am late ');
    await t.hear('use', t.fromBar, 0);
    await t.hear('send', t.fromBar, 4);
    await t.hear('choose', t.fromBar, 'claude-haiku-5-5');
    await t.hear('button', t.fromBar, 'what-sent');
    await t.hear('settings', t.fromBar);
    expect(t.bar.choose).toHaveBeenCalledExactlyOnceWith('claude-haiku-5-5');
    expect(t.bar.suggest).toHaveBeenCalledOnce();
    expect(t.bar.summarize).toHaveBeenCalledOnce();
    expect(t.bar.catchUp).toHaveBeenCalledOnce();
    expect(t.bar.rewrite).toHaveBeenCalledExactlyOnceWith('translate:pt');
    expect(t.bar.button).toHaveBeenCalledExactlyOnceWith('what-sent');
    expect(t.openSettings).toHaveBeenCalledOnce();
    expect(t.bar.prompt).toHaveBeenCalledExactlyOnceWith('say I am late');
    expect(t.bar.use).toHaveBeenCalledExactlyOnceWith(0);
    expect(t.bar.send).toHaveBeenCalledExactlyOnceWith(4);
    expect(t.warn).not.toHaveBeenCalled();
  });

  it('hears only the active account’s WhatsApp view, on WhatsApp’s origin', async () => {
    const t = setup();
    const call = {};
    t.views.set(call, { zone: 'whatsapp', home: ORIGIN, label: 'Home', account: 'a' });
    const chrome = {};
    t.views.set(chrome, { zone: 'chrome', home: 'app://chrome', label: 'YapYap' });
    await t.hear('send', { ...t.fromBar, sender: call }, 0);
    await t.hear('send', { ...t.fromBar, sender: {} }, 0);
    await t.hear('send', { ...t.fromBar, senderFrame: { url: 'https://example.com/' } }, 0);
    await t.hear('send', { ...t.fromBar, senderFrame: null }, 0);
    t.switchTo(chrome);
    await t.hear('send', { ...t.fromBar, sender: chrome }, 0);
    t.switchTo(call);
    await t.hear('send', t.fromBar, 0);
    expect(t.bar.send).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledTimes(6);
    expect(t.warn).toHaveBeenCalledWith('Ignored an assistant bar message from outside the bar.');
  });

  it('takes a request of reasonable length, and nothing blank', async () => {
    const t = setup();
    for (const args of [[], ['   '], ['x'.repeat(2001)], [3], ['hi', 'there']]) {
      await t.hear('prompt', t.fromBar, ...args);
    }
    expect(t.bar.prompt).not.toHaveBeenCalled();
    await t.hear('prompt', t.fromBar, 'x'.repeat(2000));
    expect(t.bar.prompt).toHaveBeenCalledOnce();
  });

  it('uses or sends one of at most five suggestions by index, and takes no arguments elsewhere', async () => {
    const t = setup();
    for (const args of [[], [-1], [5], [1.5], ['1'], [1, 2]]) {
      await t.hear('use', t.fromBar, ...args);
      await t.hear('send', t.fromBar, ...args);
    }
    await t.hear('suggest', t.fromBar, 1);
    for (const args of [[], [''], ['m'.repeat(201)], [7], ['a', 'b']]) {
      await t.hear('choose', t.fromBar, ...args);
    }
    for (const args of [[], ['press'], ['allow', 'twice']]) {
      await t.hear('button', t.fromBar, ...args);
    }
    expect(t.bar.choose).not.toHaveBeenCalled();
    expect(t.bar.use).not.toHaveBeenCalled();
    expect(t.bar.send).not.toHaveBeenCalled();
    expect(t.bar.suggest).not.toHaveBeenCalled();
    expect(t.bar.button).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledTimes(21);
  });

  it('warns, without the error, when an action fails', async () => {
    const t = setup();
    t.bar.send.mockRejectedValueOnce(new Error('Your message is: hi'));
    await t.hear('send', t.fromBar, 0);
    await vi.waitFor(() => {
      expect(t.warn).toHaveBeenCalledExactlyOnceWith('An assistant bar action failed.');
    });
  });
});
