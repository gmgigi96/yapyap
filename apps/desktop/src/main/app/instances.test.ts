import { describe, expect, it, vi } from 'vitest';
import {
  claimSingleInstance,
  type InstanceApp,
  type LinkPage,
  type LinkWindow,
} from './instances.ts';

const HOME = 'https://web.whatsapp.com';

function setup(locked = true) {
  let secondInstance: (event: unknown, argv: readonly string[]) => void = () => undefined;
  let openUrl: (event: { preventDefault(): void }, url: string) => void = () => undefined;
  const app = {
    requestSingleInstanceLock: vi.fn(() => locked),
    quit: vi.fn(),
    on: vi.fn((event: string, listener: never) => {
      if (event === 'second-instance') {
        secondInstance = listener;
      } else {
        openUrl = listener;
      }
    }),
  } satisfies InstanceApp;
  const warn = vi.fn();
  const instances = claimSingleInstance(app, HOME, warn);
  const window = {
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  } satisfies LinkWindow;
  const page = { loadURL: vi.fn(() => Promise.resolve()) } satisfies LinkPage;
  const launchAgain = (...argv: string[]) => {
    secondInstance({}, ['/opt/YapYap/yapyap', ...argv]);
  };
  const preventDefault = vi.fn();
  const openLink = (url: string) => {
    openUrl({ preventDefault }, url);
  };
  return { app, warn, instances, window, page, launchAgain, openLink, preventDefault };
}

describe('claimSingleInstance', () => {
  it('quits when another YapYap already runs on this profile', () => {
    const t = setup(false);
    expect(t.instances).toBeUndefined();
    expect(t.app.quit).toHaveBeenCalledOnce();
    expect(t.app.on).not.toHaveBeenCalled();
  });

  it('brings the window to the front when YapYap is launched again', () => {
    const t = setup();
    t.instances?.attach(t.window, t.page);
    t.launchAgain();
    expect(t.window.restore).not.toHaveBeenCalled();
    expect(t.window.show).toHaveBeenCalledOnce();
    expect(t.window.focus).toHaveBeenCalledOnce();
    expect(t.page.loadURL).not.toHaveBeenCalled();
    t.window.isMinimized.mockReturnValueOnce(true);
    t.launchAgain();
    expect(t.window.restore).toHaveBeenCalledOnce();
  });

  it('opens a valid chat link from the new launch and ignores everything else', () => {
    const t = setup();
    t.instances?.attach(t.window, t.page);
    t.launchAgain('--evil-flag', 'https://example.com/', 'https://wa.me/351912345678');
    expect(t.page.loadURL).toHaveBeenCalledExactlyOnceWith(`${HOME}/send?phone=351912345678`);
  });

  it('keeps a link that arrives before the window and opens it once attached', () => {
    const t = setup();
    t.launchAgain('whatsapp://send?text=Early');
    t.openLink('https://wa.me/1');
    expect(t.preventDefault).toHaveBeenCalledOnce();
    t.instances?.attach(t.window, t.page);
    expect(t.page.loadURL).toHaveBeenCalledExactlyOnceWith(`${HOME}/send?phone=1`);
    expect(t.window.focus).not.toHaveBeenCalled();
  });

  it('opens chat links macOS hands over and refuses other links without logging them', () => {
    const t = setup();
    t.instances?.attach(t.window, t.page);
    t.openLink('whatsapp://send?phone=42');
    expect(t.page.loadURL).toHaveBeenCalledExactlyOnceWith(`${HOME}/send?phone=42`);
    t.openLink('https://example.com/?phone=42');
    expect(t.page.loadURL).toHaveBeenCalledOnce();
    expect(t.warn).toHaveBeenCalledExactlyOnceWith(
      'Ignored a link that is not a WhatsApp chat link.',
    );
  });

  it('leaves a failed load to the recovery monitor', async () => {
    const t = setup();
    t.page.loadURL.mockRejectedValueOnce(new Error('ERR_FAILED'));
    t.instances?.attach(t.window, t.page);
    t.launchAgain('https://wa.me/1');
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.warn).not.toHaveBeenCalled();
  });
});
