import { en } from '../../shared/messages/en.ts';
import { isSet, type Environment } from '../environment.ts';

export const TROUBLESHOOTING_URL = 'https://yapyap.guita.org/guide/troubleshooting#sandbox';

/**
 * The dialog's message and detail as one line for the log, which mirrors to
 * stderr, so it reaches people who start YapYap from a terminal.
 */
const UNSAFE_START_MESSAGE = `${en.dialogs.unsafeStart.message}. ${en.dialogs.unsafeStart.detail}`;

export interface SandboxSwitches {
  hasSwitch(name: string): boolean;
}

/**
 * True when Chromium's sandbox was turned off: by `--no-sandbox`, which an
 * AppImage launcher adds on its own when user namespaces are restricted, or
 * by `ELECTRON_DISABLE_SANDBOX`.
 */
export function sandboxDisabled(switches: SandboxSwitches, env: Environment): boolean {
  return switches.hasSwitch('no-sandbox') || isSet(env, 'ELECTRON_DISABLE_SANDBOX');
}

export interface UnsafeStartDependencies {
  readonly whenReady: () => Promise<unknown>;
  /** Explains the problem; true when the user asks for the troubleshooting guide. */
  readonly explain: () => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly logError: (message: string) => void;
  readonly quit: () => void;
}

/**
 * Explains why YapYap will not run, then quits, without ever opening
 * WhatsApp or a session. Running unsandboxed is never an option.
 */
export async function refuseUnsafeStart(deps: UnsafeStartDependencies): Promise<void> {
  deps.logError(UNSAFE_START_MESSAGE);
  await deps.whenReady();
  if (await deps.explain()) {
    await deps.openExternal(TROUBLESHOOTING_URL).catch(() => undefined);
  }
  deps.quit();
}
