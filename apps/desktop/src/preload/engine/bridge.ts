import {
  ENGINE_CHANNELS,
  type EngineBridge,
  type EngineCommand,
} from '../../shared/api/engine-api.ts';

/** The parts of `ipcRenderer` the bridge uses. */
export interface EngineIpc {
  on(channel: string, listener: (event: unknown, command: EngineCommand) => void): unknown;
  send(channel: string, ...args: unknown[]): void;
}

/**
 * The engine page's whole reach (ADR 0017): it hears commands, never the
 * IPC event, and sends events on one fixed channel, which the main process
 * checks before it believes them.
 */
export function createEngineBridge(ipc: EngineIpc): EngineBridge {
  return {
    onCommand: (listener) => {
      ipc.on(ENGINE_CHANNELS.command, (_event, command) => {
        listener(command);
      });
    },
    send: (event) => {
      ipc.send(ENGINE_CHANNELS.event, event);
    },
  };
}
