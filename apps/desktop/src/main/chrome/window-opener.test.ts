import { describe, expect, it, vi } from 'vitest';
import { SHOW_FALLBACK_MS } from '../window/show-when-ready.ts';
import type { ViewInfo } from '../security/views.ts';
import { chromeWindowOpener, openPromptWindow, type ChromeWindowPort } from './window-opener.ts';

function fakeWindow() {
  let ready: () => void = () => undefined;
  let destroyed = false;
  const window = {
    webContents: { send: vi.fn() },
    isDestroyed: vi.fn(() => destroyed),
    focus: vi.fn(),
    once: vi.fn((_event: 'ready-to-show' | 'closed', listener: () => void) => {
      ready = listener;
    }),
    close: vi.fn(),
    show: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
  } satisfies ChromeWindowPort;
  return {
    window,
    ready: () => {
      ready();
    },
    destroy: () => {
      destroyed = true;
    },
  };
}

function setup() {
  const windows = [fakeWindow(), fakeWindow()] as const;
  const createWindow = vi
    .fn<() => ChromeWindowPort>()
    .mockReturnValueOnce(windows[0].window)
    .mockReturnValueOnce(windows[1].window);
  const views = new WeakMap<object, ViewInfo>();
  const warn = vi.fn();
  return {
    windows,
    createWindow,
    views,
    warn,
    open: chromeWindowOpener(
      { createWindow, views, warn },
      { path: 'about.html', window: { title: 'About YapYap', width: 480, show: true } },
    ),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('chromeWindowOpener', () => {
  it('opens a hidden chrome window on the page and shows it when ready', () => {
    const t = setup();
    t.open();
    const [first] = t.windows;
    expect(t.createWindow).toHaveBeenCalledExactlyOnceWith({
      autoHideMenuBar: true,
      title: 'About YapYap',
      width: 480,
      show: false,
    });
    expect(t.views.get(first.window.webContents)).toEqual({
      zone: 'chrome',
      home: 'app://chrome',
      label: 'YapYap',
    });
    expect(first.window.loadURL).toHaveBeenCalledWith('app://chrome/about.html');
    expect(first.window.once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
    expect(first.window.show).not.toHaveBeenCalled();
    first.ready();
    expect(first.window.show).toHaveBeenCalledOnce();
  });

  it('shows the window after a short wait when it never reports ready', () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      t.open();
      vi.advanceTimersByTime(SHOW_FALLBACK_MS - 1);
      expect(t.windows[0].window.show).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(t.windows[0].window.show).toHaveBeenCalledOnce();
      t.windows[0].ready();
      expect(t.windows[0].window.show).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('focuses the open window instead of opening another', () => {
    const t = setup();
    t.open();
    t.open();
    expect(t.createWindow).toHaveBeenCalledOnce();
    expect(t.windows[0].window.focus).toHaveBeenCalledOnce();
  });

  it('opens a new window after the previous one was closed', () => {
    const t = setup();
    t.open();
    t.windows[0].destroy();
    t.open();
    expect(t.createWindow).toHaveBeenCalledTimes(2);
    expect(t.windows[0].window.focus).not.toHaveBeenCalled();
  });

  it('logs a page that fails to load', async () => {
    const t = setup();
    t.windows[0].window.loadURL.mockRejectedValueOnce(new Error('ERR_FAILED'));
    t.open();
    await settle();
    expect(t.warn).toHaveBeenCalledExactlyOnceWith('Could not load about.html.');
  });
});

describe('openPromptWindow', () => {
  it('closes its window once, and hears when it is gone', () => {
    const t = setup();
    const prompt = openPromptWindow(
      { createWindow: t.createWindow, views: t.views, warn: t.warn },
      { path: 'proxy-login.html', window: {} },
    );
    const [{ window, destroy }] = t.windows;
    const closed = vi.fn();
    prompt.onClosed(closed);
    expect(window.once).toHaveBeenLastCalledWith('closed', closed);
    prompt.close();
    destroy();
    prompt.close();
    expect(window.close).toHaveBeenCalledOnce();
  });
});
