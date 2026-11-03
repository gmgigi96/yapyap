import { describe, expect, it, vi } from 'vitest';
import type { EngineCommand } from '../../../shared/api/engine-api.ts';
import {
  createEngineHost,
  EngineFailed,
  engineListener,
  IDLE_MS,
  type EngineWindow,
} from './engine-host.ts';

const PAGE = 'app://engine/engine.html';

/** Engine windows as the tests play them: what each was sent, and how to close it. */
function playedWindows(loaded: () => Promise<void> = () => Promise.resolve()) {
  const opened: (EngineWindow & { sent: EngineCommand[]; closed: () => void; closes: number })[] =
    [];
  const open = (): EngineWindow => {
    let onClosed = (): void => undefined;
    const window = {
      contents: {},
      sent: [] as EngineCommand[],
      loaded: loaded(),
      closes: 0,
      send: (command: EngineCommand) => {
        window.sent.push(command);
      },
      close: () => {
        window.closes += 1;
      },
      onClosed: (listener: () => void) => {
        onClosed = listener;
      },
      closed: () => {
        onClosed();
      },
    };
    opened.push(window);
    return window;
  };
  return { opened, open };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function host(loaded?: () => Promise<void>) {
  const windows = playedWindows(loaded);
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const warn = vi.fn();
  const engine = createEngineHost({
    open: windows.open,
    after: (ms, run) => {
      const timer = { ms, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    warn,
  });
  const say = (payload: unknown, index = 0) => {
    engine.hear(windows.opened[index]?.contents ?? {}, PAGE, payload);
  };
  return { engine, windows, timers, warn, say };
}

const TURNS = [{ role: 'user', content: 'Hello' }] as const;

describe('createEngineHost', () => {
  it('opens the window on first use, loads the model once, and streams completions', async () => {
    const { engine, windows, say } = host();
    const pieces: string[] = [];
    const first = engine.complete(TURNS, (text) => pieces.push(text));
    await settled();
    const [window] = windows.opened;
    expect(window?.sent).toEqual([{ type: 'load', id: 1 }]);
    say({ type: 'text', id: 1, text: 'loading' });
    say({ type: 'done', id: 1, truncated: false });
    await settled();
    expect(window?.sent[1]).toEqual({ type: 'complete', id: 2, turns: TURNS });
    say({ type: 'text', id: 2, text: 'Hi' });
    say({ type: 'text', id: 2, text: ' there' });
    say({ type: 'done', id: 2, truncated: true });
    await expect(first).resolves.toEqual({ text: 'Hi there', truncated: true });
    expect(pieces).toEqual(['Hi', ' there']);
    const second = engine.complete(TURNS, () => undefined);
    await settled();
    expect(window?.sent[2]).toEqual({ type: 'complete', id: 3, turns: TURNS });
    say({ type: 'done', id: 3, truncated: false });
    await expect(second).resolves.toEqual({ text: '', truncated: false });
    expect(windows.opened).toHaveLength(1);
  });

  it('believes only the engine window, on its own origin, with events of the right shape', async () => {
    const { engine, windows, warn, say } = host();
    const pending = engine.complete(TURNS, () => undefined);
    await settled();
    engine.hear({}, PAGE, { type: 'done', id: 1, truncated: false });
    engine.hear(windows.opened[0]?.contents ?? {}, 'app://chrome/x.html', {
      type: 'done',
      id: 1,
      truncated: false,
    });
    say({ type: 'done', id: 1, truncated: false, extra: 1 });
    say({ type: 'shout', id: 1 });
    expect(warn).toHaveBeenCalledTimes(4);
    say({ type: 'done', id: 99, truncated: false });
    say({ type: 'failed', id: 1, kind: 'out-of-memory' });
    await expect(pending).rejects.toEqual(new EngineFailed('out-of-memory'));
  });

  it('tries loading again after a failure, and stops a completion on request', async () => {
    const { engine, windows, say } = host();
    const failed = engine.complete(TURNS, () => undefined);
    await settled();
    say({ type: 'failed', id: 1, kind: 'failed' });
    await expect(failed).rejects.toMatchObject({ kind: 'failed' });
    const controller = new AbortController();
    const stopped = engine.complete(TURNS, () => undefined, controller.signal);
    await settled();
    say({ type: 'done', id: 2, truncated: false });
    await settled();
    controller.abort();
    expect(windows.opened[0]?.sent.at(-1)).toEqual({ type: 'cancel', id: 3 });
    say({ type: 'failed', id: 3, kind: 'cancelled' });
    await expect(stopped).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('waits for the last of several requests before it starts counting idle time', async () => {
    const { engine, timers, say } = host();
    const one = engine.complete(TURNS, () => undefined);
    await settled();
    say({ type: 'done', id: 1, truncated: false });
    await settled();
    const two = engine.complete(TURNS, () => undefined);
    await settled();
    say({ type: 'done', id: 2, truncated: false });
    await one;
    expect(timers).toHaveLength(0);
    say({ type: 'done', id: 3, truncated: false });
    await two;
    expect(timers).toHaveLength(1);
  });

  it('closes the window after a while without requests, and opens a new one when asked again', async () => {
    const { engine, windows, timers, say } = host();
    const done = engine.complete(TURNS, () => undefined);
    await settled();
    say({ type: 'done', id: 1, truncated: false });
    await settled();
    say({ type: 'done', id: 2, truncated: false });
    await done;
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(IDLE_MS);
    timers[0]?.run();
    expect(windows.opened[0]?.closes).toBe(1);
    void engine.complete(TURNS, () => undefined);
    await settled();
    expect(windows.opened).toHaveLength(2);
    expect(windows.opened[1]?.sent).toEqual([{ type: 'load', id: 3 }]);
  });

  it('fails what waits when the window goes or closes, or its page never loads', async () => {
    const { engine, windows, say } = host();
    const gone = engine.complete(TURNS, () => undefined);
    await settled();
    windows.opened[0]?.closed();
    await expect(gone).rejects.toMatchObject({ kind: 'failed' });
    const closing = engine.complete(TURNS, () => undefined);
    await settled();
    windows.opened[0]?.closed();
    engine.close();
    await expect(closing).rejects.toMatchObject({ kind: 'cancelled' });
    expect(windows.opened[1]?.closes).toBe(1);
    engine.close();
    say({ type: 'done', id: 1, truncated: false });
    const broken = host(() => Promise.reject(new Error('no page')));
    await expect(broken.engine.complete(TURNS, () => undefined)).rejects.toMatchObject({
      kind: 'failed',
    });
  });
});

describe('engineListener', () => {
  it('passes the sender, its frame’s address and the payload on', () => {
    const hear = vi.fn();
    const sender = {};
    engineListener(hear)({ sender, senderFrame: { url: PAGE } }, { type: 'done' });
    engineListener(hear)({ sender, senderFrame: null }, 1);
    expect(hear.mock.calls).toEqual([
      [sender, PAGE, { type: 'done' }],
      [sender, '', 1],
    ]);
  });
});
