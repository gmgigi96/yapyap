export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

/** Failed authentications, from any caller, that lock everyone out for a minute. */
export const MAX_FAILURES = 10;

/**
 * Counts what happened in sliding windows, by key. A limit of null is
 * Unlimited: nothing is counted and everything is allowed.
 */
export interface Counter {
  /** Counts one more for `key` and returns true, unless that would pass `limit` in `windowMs`. */
  readonly take: (key: string, limit: number | null, windowMs: number) => boolean;
  /** Whether one more would pass `limit`, counting nothing. */
  readonly full: (key: string, limit: number | null, windowMs: number) => boolean;
}

export function slidingCounter(now: () => number): Counter {
  const seen = new Map<string, number[]>();
  const recent = (key: string, windowMs: number): number[] => {
    const since = now() - windowMs;
    const kept = (seen.get(key) ?? []).filter((time) => time > since);
    seen.set(key, kept);
    return kept;
  };
  const full = (key: string, limit: number | null, windowMs: number): boolean =>
    limit !== null && recent(key, windowMs).length >= limit;
  return {
    full,
    take: (key, limit, windowMs) => {
      if (full(key, limit, windowMs)) {
        return false;
      }
      if (limit !== null) {
        recent(key, windowMs).push(now());
      }
      return true;
    },
  };
}

/**
 * Whether failed authentications lock the server: after {@link MAX_FAILURES}
 * in a minute, from any caller, every request is refused for a minute, so a
 * program on this computer cannot guess tokens quickly.
 */
export interface FailureLock {
  readonly locked: () => boolean;
  readonly failed: () => void;
}

export function failureLock(now: () => number): FailureLock {
  const failures = slidingCounter(now);
  return {
    locked: () => failures.full('', MAX_FAILURES, MINUTE_MS),
    failed: () => {
      failures.take('', MAX_FAILURES, MINUTE_MS);
    },
  };
}
