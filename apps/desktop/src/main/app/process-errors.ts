export interface ErrorSource {
  on(
    event: 'uncaughtException' | 'unhandledRejection',
    listener: (error: unknown) => void,
  ): unknown;
}

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/**
 * Electron shows an uncaught main-process error in a modal box that blocks
 * the whole app, quitting included, until someone dismisses it (#223).
 * YapYap writes it to the redacted log instead and keeps running.
 */
export function logProcessErrors(source: ErrorSource, log: (message: string) => void): void {
  source.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${describe(error)}`);
  });
  source.on('unhandledRejection', (error) => {
    log(`Unhandled rejection: ${describe(error)}`);
  });
}
