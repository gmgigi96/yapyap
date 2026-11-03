import { describe, expect, it, vi } from 'vitest';
import {
  headlessCanStart,
  headlessRequested,
  headlessSay,
  useHeadlessDisplay,
} from './headless.ts';

describe('headlessRequested', () => {
  it('is on only with the flag itself', () => {
    expect(headlessRequested(['yapyap', '--headless'])).toBe(true);
    expect(headlessRequested(['yapyap'])).toBe(false);
    expect(headlessRequested(['yapyap', '--headless=no', 'headless'])).toBe(false);
  });
});

describe('headlessCanStart', () => {
  it('needs Chromium’s headless backend or a display server on Linux', () => {
    const backend = ['yapyap', '--headless', '--ozone-platform=headless'];
    expect(headlessCanStart(backend, 'linux', {})).toBe(true);
    expect(headlessCanStart(['yapyap', '--headless'], 'linux', {})).toBe(false);
    expect(headlessCanStart(['yapyap'], 'linux', { DISPLAY: '', WAYLAND_DISPLAY: '' })).toBe(false);
    expect(headlessCanStart(['yapyap'], 'linux', { DISPLAY: ':99' })).toBe(true);
    expect(headlessCanStart(['yapyap'], 'linux', { WAYLAND_DISPLAY: 'wayland-0' })).toBe(true);
  });

  it('always has a display elsewhere', () => {
    expect(headlessCanStart(['yapyap', '--headless'], 'darwin', {})).toBe(true);
    expect(headlessCanStart(['yapyap', '--headless'], 'win32', {})).toBe(true);
  });
});

describe('useHeadlessDisplay', () => {
  it('turns the GPU off on Chromium’s headless backend', () => {
    const commandLine = { appendSwitch: vi.fn() };
    const display = useHeadlessDisplay(commandLine, ['yapyap', '--ozone-platform=headless']);
    expect(commandLine.appendSwitch.mock.calls).toEqual([['disable-gpu']]);
    expect(display).toEqual({
      ozonePlatform: undefined,
      active: undefined,
      source: 'command line',
      fallback: undefined,
    });
  });

  it('leaves any other display alone, where only the window stays hidden', () => {
    const commandLine = { appendSwitch: vi.fn() };
    expect(useHeadlessDisplay(commandLine, ['yapyap', '--ozone-platform=x11'])).toBeUndefined();
    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
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
