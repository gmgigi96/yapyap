export interface ShutdownSources {
  readonly onSignal: (signal: 'SIGTERM' | 'SIGINT', listener: () => void) => void;
  /** Linux and macOS warn before shutting down. */
  readonly onSystemShutdown: (listener: () => void) => void;
}

/**
 * Turns termination signals and system shutdown into an ordinary quit, so
 * windows close and save their state the same way every time. Quitting
 * twice is harmless, so overlapping triggers need no coordination.
 */
export function quitOnShutdown(sources: ShutdownSources, quit: () => void): void {
  sources.onSignal('SIGTERM', quit);
  sources.onSignal('SIGINT', quit);
  sources.onSystemShutdown(quit);
}
