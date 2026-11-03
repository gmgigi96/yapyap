import { describe, expect, it, vi } from 'vitest';
import { fakeSettings } from '../../../test/fake-settings.ts';
import type { Settings } from '../settings/schema.ts';
import { createPrivacyScreen, IDLE_SECONDS } from './privacy-screen.ts';

function page() {
  let count = 0;
  return {
    insertCSS: vi.fn(() => {
      count += 1;
      return Promise.resolve(`key-${String(count)}`);
    }),
    removeInsertedCSS: vi.fn(() => Promise.resolve()),
  };
}

function setup(privacy: Partial<Settings['privacy']> = {}) {
  const settings = fakeSettings({ privacy });
  const state = {
    focused: true,
    idle: 0,
    pages: [page()],
  };
  let tick: (() => void) | undefined;
  const deps = {
    settings,
    pages: () => state.pages,
    focused: () => state.focused,
    idleSeconds: () => state.idle,
    every: vi.fn((callback: () => void) => {
      tick = callback;
    }),
    onChange: vi.fn(),
  };
  const screen = createPrivacyScreen(deps);
  return {
    state,
    deps,
    screen,
    tick: () => tick?.(),
    changeSettings: (next: Partial<Settings['privacy']>) => {
      settings.change({ privacy: next });
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('createPrivacyScreen', () => {
  it('covers every page on demand, new ones too, and uncovers them when switched off', async () => {
    const t = setup();
    expect(t.screen.covered()).toBe(false);
    t.screen.toggle();
    expect(t.screen.covered()).toBe(true);
    const [first] = t.state.pages;
    expect(first?.insertCSS).toHaveBeenCalledWith(expect.stringContaining('blur('));
    const added = page();
    t.state.pages = [...t.state.pages, added];
    t.tick();
    expect(added.insertCSS).toHaveBeenCalledOnce();
    expect(first?.insertCSS).toHaveBeenCalledOnce();
    t.screen.toggle();
    await settle();
    expect(first?.removeInsertedCSS).toHaveBeenCalledWith('key-1');
    expect(added.removeInsertedCSS).toHaveBeenCalledWith('key-1');
    expect(t.deps.onChange).toHaveBeenCalledTimes(2);
  });

  it('covers WhatsApp while the window is out of focus, if asked to', () => {
    const t = setup({ blurWhenUnfocused: true });
    t.state.focused = false;
    t.screen.update();
    expect(t.screen.covered()).toBe(true);
    t.state.focused = true;
    t.screen.update();
    expect(t.screen.covered()).toBe(false);
  });

  it('covers WhatsApp while the computer is idle, if asked to', () => {
    const t = setup();
    t.state.idle = IDLE_SECONDS;
    t.tick();
    expect(t.screen.covered()).toBe(false);
    t.changeSettings({ blurWhenIdle: true });
    expect(t.screen.covered()).toBe(true);
    t.state.idle = 3;
    t.tick();
    expect(t.screen.covered()).toBe(false);
  });

  it('keeps a manual screen until it is switched off, and lifts an automatic one with the switch', () => {
    const t = setup({ blurWhenUnfocused: true });
    t.screen.toggle();
    t.state.focused = false;
    t.screen.update();
    t.state.focused = true;
    t.screen.update();
    expect(t.screen.covered()).toBe(true);
    t.screen.toggle();
    expect(t.screen.covered()).toBe(false);
  });

  it('copes with a page that is gone before it could be uncovered', async () => {
    const t = setup();
    const [first] = t.state.pages;
    first?.removeInsertedCSS.mockRejectedValueOnce(new Error('destroyed'));
    t.screen.toggle();
    t.screen.toggle();
    await settle();
    expect(first?.removeInsertedCSS).toHaveBeenCalledOnce();
  });
});
