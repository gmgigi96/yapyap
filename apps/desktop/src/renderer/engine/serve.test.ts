import { describe, expect, it, vi } from 'vitest';
import type { EngineCommand, EngineEvent } from '../../shared/api/engine-api.ts';
import { EngineError, type Engine } from './engine.ts';
import { serveEngine } from './serve.ts';

/** The page as the tests play it: the commands it hears, and what it sends back. */
function playedPage(engine: Partial<Engine> = {}) {
  let command: (command: EngineCommand) => void = () => undefined;
  const sent: EngineEvent[] = [];
  const model = new Blob(['gguf']);
  const full: Engine = {
    load: vi.fn(() => Promise.resolve()),
    unload: vi.fn(() => Promise.resolve()),
    chat: vi.fn((_turns, onText: (text: string) => void) => {
      onText('Hi');
      return Promise.resolve({ text: 'Hi', truncated: true });
    }),
    ...engine,
  };
  serveEngine(
    {
      onCommand: (listener) => {
        command = listener;
      },
      send: (event) => {
        sent.push(event);
      },
    },
    { engine: full, model: () => Promise.resolve(model) },
  );
  const send = (next: EngineCommand): void => {
    command(next);
  };
  return { send, sent, engine: full, model };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('serveEngine', () => {
  it('loads the model it reads from YapYap, and says when it is done', async () => {
    const page = playedPage();
    page.send({ type: 'load', id: 1 });
    await settled();
    expect(page.engine.load).toHaveBeenCalledWith(page.model);
    expect(page.sent).toEqual([{ type: 'done', id: 1, truncated: false }]);
  });

  it('streams a completion, piece by piece, then says how it ended', async () => {
    const page = playedPage();
    const turns = [{ role: 'user', content: 'Hello' }] as const;
    page.send({ type: 'complete', id: 2, turns });
    await settled();
    expect(page.engine.chat).toHaveBeenCalledWith(
      turns,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(page.sent).toEqual([
      { type: 'text', id: 2, text: 'Hi' },
      { type: 'done', id: 2, truncated: true },
    ]);
  });

  it('stops a completion on request, and answers failures with their kind alone', async () => {
    const page = playedPage({
      chat: (_turns, _onText, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new EngineError('cancelled'));
          });
        }),
      load: () => Promise.reject(new Error('Aborted(OOM) while reading “Dinner?”')),
    });
    page.send({ type: 'complete', id: 3, turns: [] });
    page.send({ type: 'cancel', id: 3 });
    page.send({ type: 'cancel', id: 9 });
    page.send({ type: 'load', id: 4 });
    await settled();
    expect(page.sent).toEqual([
      { type: 'failed', id: 3, kind: 'cancelled' },
      { type: 'failed', id: 4, kind: 'out-of-memory' },
    ]);
  });
});
