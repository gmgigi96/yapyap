import { afterEach, describe, expect, it, vi } from 'vitest';
import { pause } from './pause.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('pause', () => {
  it('resolves once the time has passed, not before', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void pause(100).then(done);
    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledOnce();
  });
});
