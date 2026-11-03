import { describe, expect, it } from 'vitest';
import { failureLock, MAX_FAILURES, MINUTE_MS, slidingCounter } from './limits.ts';

function clock() {
  const time = { now: 0 };
  return { time, now: () => time.now };
}

describe('slidingCounter', () => {
  it('allows up to the limit in the window, then again as the oldest leave it', () => {
    const { time, now } = clock();
    const counter = slidingCounter(now);
    expect(counter.take('a', 2, MINUTE_MS)).toBe(true);
    time.now = 10;
    expect(counter.take('a', 2, MINUTE_MS)).toBe(true);
    expect(counter.full('a', 2, MINUTE_MS)).toBe(true);
    expect(counter.take('a', 2, MINUTE_MS)).toBe(false);
    expect(counter.take('b', 2, MINUTE_MS)).toBe(true);
    time.now = MINUTE_MS - 1;
    expect(counter.take('a', 2, MINUTE_MS)).toBe(false);
    time.now = MINUTE_MS;
    expect(counter.take('a', 2, MINUTE_MS)).toBe(true);
    expect(counter.take('a', 2, MINUTE_MS)).toBe(false);
  });

  it('counts nothing and allows everything when Unlimited', () => {
    const counter = slidingCounter(() => 0);
    for (let call = 0; call < 1000; call += 1) {
      expect(counter.take('a', null, MINUTE_MS)).toBe(true);
    }
    expect(counter.full('a', null, MINUTE_MS)).toBe(false);
    expect(counter.take('a', 1, MINUTE_MS)).toBe(true);
  });
});

describe('failureLock', () => {
  it('locks everyone out after too many failures in a minute, until they age out', () => {
    const { time, now } = clock();
    const lock = failureLock(now);
    for (let failure = 1; failure < MAX_FAILURES; failure += 1) {
      lock.failed();
    }
    expect(lock.locked()).toBe(false);
    lock.failed();
    expect(lock.locked()).toBe(true);
    time.now = MINUTE_MS - 1;
    expect(lock.locked()).toBe(true);
    time.now = MINUTE_MS;
    expect(lock.locked()).toBe(false);
  });
});
