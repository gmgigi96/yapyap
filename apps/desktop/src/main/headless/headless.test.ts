import { describe, expect, it, vi } from 'vitest';
import { headlessRequested, headlessSay, useHeadlessDisplay } from './headless.ts';

describe('headlessRequested', () => {
  it('is on only with the flag itself', () => {
    expect(headlessRequested(['yapyap', '--headless'])).toBe(true);
    expect(headlessRequested(['yapyap'])).toBe(false);
    expect(headlessRequested(['yapyap', '--headless=no', 'headless'])).toBe(false);
  });
});

describe('useHeadlessDisplay', () => {
  it('puts Chromium on its headless backend without a GPU on Linux', () => {
    const commandLine = { appendSwitch: vi.fn() };
    const display = useHeadlessDisplay(commandLine, 'linux');
    expect(commandLine.appendSwitch.mock.calls).toEqual([
      ['ozone-platform', 'headless'],
      ['disable-gpu'],
    ]);
    expect(display).toEqual({
      ozonePlatform: undefined,
      active: undefined,
      source: 'command line',
      fallback: undefined,
    });
  });

  it('leaves the display alone elsewhere, where only the window stays hidden', () => {
    for (const platform of ['darwin', 'win32']) {
      const commandLine = { appendSwitch: vi.fn() };
      expect(useHeadlessDisplay(commandLine, platform).active).toBeUndefined();
      expect(commandLine.appendSwitch).not.toHaveBeenCalled();
    }
  });
});

describe('headlessSay', () => {
  it('writes a line to the terminal in headless mode alone', () => {
    const terminal = { isTTY: false, write: vi.fn() };
    headlessSay(true, terminal)('Listening');
    expect(terminal.write).toHaveBeenCalledExactlyOnceWith('Listening\n');
    headlessSay(false, terminal)('Listening');
    expect(terminal.write).toHaveBeenCalledOnce();
  });
});
