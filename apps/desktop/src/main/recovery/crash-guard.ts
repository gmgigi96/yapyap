import type { Failure } from './failure.ts';
import { en } from '../../shared/messages/en.ts';

/** More reloads than this within the window means reloading is not helping. */
export const MAX_RELOADS = 3;
/** Five minutes. */
export const RELOAD_WINDOW_MS = 300_000;
/** How long a hung renderer gets to recover on its own before it is restarted. */
export const UNRESPONSIVE_GRACE_MS = 30_000;

export interface CrashableContents {
  on(
    event: 'render-process-gone',
    listener: (event: unknown, details: { readonly reason: string }) => void,
  ): unknown;
  on(event: 'unresponsive' | 'responsive', listener: () => void): unknown;
  reload(): void;
  forcefullyCrashRenderer(): void;
}

export interface CrashGuardDependencies {
  readonly now: () => number;
  readonly schedule: (callback: () => void, ms: number) => unknown;
  readonly notify: (message: string) => void;
  readonly showFailure: (failure: Failure) => void;
  readonly warn: (message: string) => void;
}

/**
 * Reloads a crashed WhatsApp renderer, which keeps its session and login,
 * and restarts one that stays hung. A crash loop shows the recovery screen.
 */
export function guardCrashes(contents: CrashableContents, deps: CrashGuardDependencies): void {
  let reloads: number[] = [];
  // Each hang gets a number; recovering makes any pending restart stale.
  let hangs = 0;
  contents.on('render-process-gone', (_event, { reason }) => {
    if (reason === 'clean-exit') {
      return;
    }
    const now = deps.now();
    reloads = reloads.filter((time) => now - time < RELOAD_WINDOW_MS);
    deps.warn(`The WhatsApp renderer ended (${reason}).`);
    if (reloads.length >= MAX_RELOADS) {
      deps.showFailure({ kind: 'crashed' });
      return;
    }
    reloads.push(now);
    contents.reload();
    deps.notify(en.notices.whatsAppReloaded);
  });
  contents.on('unresponsive', () => {
    hangs += 1;
    const hang = hangs;
    deps.schedule(() => {
      if (hang === hangs) {
        contents.forcefullyCrashRenderer();
      }
    }, UNRESPONSIVE_GRACE_MS);
  });
  contents.on('responsive', () => {
    hangs += 1;
  });
}
