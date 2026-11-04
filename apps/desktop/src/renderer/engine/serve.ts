import type { EngineBridge, EngineCommand } from '../../shared/api/engine-api.ts';
import { failureOf, type Engine } from './engine.ts';

/** What the page serves with: the engine, and how it reads the downloaded model. */
export interface EnginePage {
  readonly engine: Engine;
  /** The model's file, which YapYap serves on `app://engine` alone. */
  readonly model: () => Promise<Blob>;
}

/** Commands under way, by number, so a cancel reaches its completion. */
type Running = Map<number, AbortController>;

async function load(bridge: EngineBridge, page: EnginePage, id: number): Promise<void> {
  await page.engine.load(await page.model());
  bridge.send({ id, type: 'done', truncated: false });
}

async function complete(
  bridge: EngineBridge,
  page: EnginePage,
  command: Extract<EngineCommand, { type: 'complete' }>,
  running: Running,
): Promise<void> {
  const controller = new AbortController();
  running.set(command.id, controller);
  try {
    const reply = await page.engine.chat(
      command.turns,
      (text) => {
        bridge.send({ type: 'text', id: command.id, text });
      },
      controller.signal,
    );
    bridge.send({ type: 'done', id: command.id, truncated: reply.truncated });
  } finally {
    running.delete(command.id);
  }
}

/**
 * Runs the main process's commands in the engine page (ADR 0017): loads the
 * model, streams completions, and stops one on request. Every failure is
 * answered with its kind alone, never the engine's own words, which could
 * quote the chat.
 */
export function serveEngine(bridge: EngineBridge, page: EnginePage): void {
  const running: Running = new Map();
  bridge.onCommand((command) => {
    if (command.type === 'cancel') {
      running.get(command.id)?.abort();
      return;
    }
    const work =
      command.type === 'load'
        ? load(bridge, page, command.id)
        : complete(bridge, page, command, running);
    work.catch((error: unknown) => {
      bridge.send({ type: 'failed', id: command.id, kind: failureOf(error) });
    });
  });
}
