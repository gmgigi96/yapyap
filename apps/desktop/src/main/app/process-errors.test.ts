import { describe, expect, it, vi } from 'vitest';
import { logProcessErrors } from './process-errors.ts';

describe('logProcessErrors', () => {
  it('logs uncaught exceptions and unhandled rejections instead of showing a dialog', () => {
    const listeners = new Map<string, (error: unknown) => void>();
    const source = {
      on: vi.fn((event: string, listener: (error: unknown) => void) =>
        listeners.set(event, listener),
      ),
    };
    const log = vi.fn();
    logProcessErrors(source, log);
    const error = new Error('Object has been destroyed');
    listeners.get('uncaughtException')?.(error);
    const bare = new Error('no stack');
    Object.defineProperty(bare, 'stack', { value: undefined });
    listeners.get('unhandledRejection')?.(bare);
    listeners.get('unhandledRejection')?.('a reason');
    expect(log.mock.calls).toEqual([
      [`Uncaught exception: ${String(error.stack)}`],
      ['Unhandled rejection: no stack'],
      ['Unhandled rejection: a reason'],
    ]);
  });
});
