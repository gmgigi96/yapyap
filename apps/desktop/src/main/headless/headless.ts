import type { DisplayBackend } from '../display/backend.ts';

/** Starts YapYap with no window on screen and, on Linux, no display at all (ADR 0021). */
const HEADLESS_FLAG = '--headless';

interface SwitchLine {
  appendSwitch(name: string, value?: string): void;
}

/** Where headless mode writes what the user must see: the terminal that started YapYap. */
export interface Terminal {
  /** False when the output is piped or redirected, as under a service manager. */
  readonly isTTY: boolean;
  readonly write: (text: string) => void;
}

export function headlessRequested(argv: readonly string[]): boolean {
  return argv.includes(HEADLESS_FLAG);
}

/**
 * Chromium's own headless backend, which needs no X11 or Wayland. Chromium
 * takes it only from its real command line: on Ubuntu it picks its display
 * before YapYap's code runs, so a switch YapYap appends comes too late and
 * Chromium crashes looking for X11 (#587).
 */
const HEADLESS_BACKEND = '--ozone-platform=headless';

function present(env: Readonly<Record<string, string | undefined>>, name: string): boolean {
  return (env[name] ?? '') !== '';
}

/** Whether Chromium has a display to start on: its headless backend, or a display server. */
export function headlessCanStart(
  argv: readonly string[],
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return (
    platform !== 'linux' ||
    argv.includes(HEADLESS_BACKEND) ||
    present(env, 'DISPLAY') ||
    present(env, 'WAYLAND_DISPLAY')
  );
}

/**
 * On Chromium's headless backend, turns the GPU off, or the GPU process would
 * look for an X display and quit; unsafe SwiftShader, the other way around
 * that, stays off. Anywhere else the display is the usual one, with the
 * window hidden, and this returns nothing.
 */
export function useHeadlessDisplay(
  commandLine: SwitchLine,
  argv: readonly string[],
): DisplayBackend | undefined {
  if (!argv.includes(HEADLESS_BACKEND)) {
    return undefined;
  }
  commandLine.appendSwitch('disable-gpu');
  return {
    ozonePlatform: undefined,
    active: undefined,
    source: 'command line',
    fallback: undefined,
  };
}

/** Writes a line to the terminal in headless mode alone; a desktop session has nobody reading it. */
export function headlessSay(headless: boolean, terminal: Terminal): (line: string) => void {
  return (line) => {
    if (headless) {
      terminal.write(`${line}\n`);
    }
  };
}
