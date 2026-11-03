import { describe, expect, it, vi } from 'vitest';
import type { EngineCommand } from '../../shared/api/engine-api.ts';
import { createEngineBridge } from './bridge.ts';

describe('createEngineBridge', () => {
  it('passes commands on without the IPC event, and sends events on the fixed channel', () => {
    const listeners: ((event: unknown, command: EngineCommand) => void)[] = [];
    const ipc = {
      on: vi.fn((_channel: string, listener: (event: unknown, command: EngineCommand) => void) => {
        listeners.push(listener);
      }),
      send: vi.fn(),
    };
    const bridge = createEngineBridge(ipc);
    const heard = vi.fn();
    bridge.onCommand(heard);
    expect(ipc.on).toHaveBeenCalledWith('engine:command', expect.any(Function));
    listeners[0]?.({ sender: 'ipc' }, { type: 'load', id: 1 });
    expect(heard).toHaveBeenCalledWith({ type: 'load', id: 1 });
    bridge.send({ type: 'done', id: 1, truncated: false });
    expect(ipc.send).toHaveBeenCalledWith('engine:event', {
      type: 'done',
      id: 1,
      truncated: false,
    });
  });
});
