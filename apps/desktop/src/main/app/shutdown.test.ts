import { describe, expect, it, vi } from 'vitest';
import { quitOnShutdown } from './shutdown.ts';

describe('quitOnShutdown', () => {
  it('quits on SIGTERM, SIGINT and system shutdown', () => {
    const signals = new Map<string, () => void>();
    let shutdown: () => void = () => undefined;
    const quit = vi.fn();
    quitOnShutdown(
      {
        onSignal: (signal, listener) => {
          signals.set(signal, listener);
        },
        onSystemShutdown: (listener) => {
          shutdown = listener;
        },
      },
      quit,
    );
    expect([...signals.keys()]).toEqual(['SIGTERM', 'SIGINT']);
    signals.get('SIGTERM')?.();
    signals.get('SIGINT')?.();
    shutdown();
    expect(quit).toHaveBeenCalledTimes(3);
  });
});
