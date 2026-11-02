import { describe, expect, it, vi } from 'vitest';
import { cappedFetcher } from './capped-fetch.ts';

/** A response whose body arrives in `chunks`, recording whether it was cancelled. */
function streamed(chunks: number[][], ok = true) {
  const cancelled = vi.fn();
  let next = 0;
  // Chunks are handed out one read at a time, so the stream is still open when it is cancelled.
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[next];
        next += 1;
        if (chunk === undefined) {
          controller.close();
        } else {
          controller.enqueue(new Uint8Array(chunk));
        }
      },
      cancel: cancelled,
    },
    { highWaterMark: 0 },
  );
  return { response: { ok, body }, cancelled };
}

describe('cappedFetcher', () => {
  it('joins a body that arrives in pieces', async () => {
    const { response } = streamed([[1, 2], [3], [4, 5]]);
    const fetcher = cappedFetcher(() => Promise.resolve(response), 5);
    expect(await fetcher('https://packages.example/a')).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('stops reading as soon as a body passes the limit', async () => {
    const { response, cancelled } = streamed([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(await cappedFetcher(() => Promise.resolve(response), 5)('https://x')).toBeUndefined();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('downloads nothing for an error status, an empty body or a failed request', async () => {
    expect(
      await cappedFetcher(() => Promise.resolve(streamed([[1]], false).response), 5)('https://x'),
    ).toBeUndefined();
    expect(
      await cappedFetcher(() => Promise.resolve({ ok: true, body: null }), 5)('https://x'),
    ).toBeUndefined();
    expect(
      await cappedFetcher(() => Promise.reject(new Error('offline')), 5)('https://x'),
    ).toBeUndefined();
  });
});
