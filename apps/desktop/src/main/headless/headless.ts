import type { DisplayBackend } from '../display/backend.ts';

/** Starts YapYap with no window on screen and, on Linux, no display at all (ADR 0020). */
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
 * Puts Chromium on its own headless backend on Linux, which needs no X11 or
 * Wayland, overriding any backend from settings or the command line. The GPU
 * process would otherwise look for an X display and quit; unsafe SwiftShader,
 * the other way around that, stays off.
 */
export function useHeadlessDisplay(commandLine: SwitchLine, platform: string): DisplayBackend {
  if (platform === 'linux') {
    commandLine.appendSwitch('ozone-platform', 'headless');
    commandLine.appendSwitch('disable-gpu');
  }
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
