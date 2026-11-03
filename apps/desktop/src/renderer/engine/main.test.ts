/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import type { EngineCommand, EngineEvent } from '../../shared/api/engine-api.ts';
import type * as EngineModule from './engine.ts';

const made = vi.hoisted(() => ({
  setups: [] as { wasm: string; hasGpu: () => Promise<boolean> }[],
}));

vi.mock('./engine.ts', async (original) => ({
  ...(await original<typeof EngineModule>()),
  wllamaEngine: (setup: { wasm: string; hasGpu: () => Promise<boolean> }) => {
    made.setups.push(setup);
    return {
      load: (model: Blob) => (model.size > 0 ? Promise.resolve() : Promise.reject(new Error('x'))),
      chat: vi.fn(),
      unload: vi.fn(),
    };
  },
}));

describe('engine entry', () => {
  it('serves the main process with wllama, its wasm and the model from the engine’s own origin', async () => {
    let command: (command: EngineCommand) => void = () => undefined;
    const sent: EngineEvent[] = [];
    Object.defineProperty(window, 'yapyapEngine', {
      value: {
        onCommand: (listener: (next: EngineCommand) => void) => {
          command = listener;
        },
        send: (event: EngineEvent) => sent.push(event),
      },
    });
    const fetch = vi.fn(() => Promise.resolve(new Response('gguf')));
    vi.stubGlobal('fetch', fetch);
    await import('./main.ts');
    const [setup] = made.setups;
    expect(setup?.wasm).toBe(new URL('wllama.wasm', location.href).href);
    expect(await setup?.hasGpu()).toBe(false);
    command({ type: 'load', id: 1 });
    await vi.waitFor(() => {
      expect(sent).toEqual([{ type: 'done', id: 1, truncated: false }]);
    });
    expect(fetch).toHaveBeenCalledWith('model.gguf');
  });
});
