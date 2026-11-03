import {
  ENGINE_CHANNELS,
  ENGINE_ORIGIN,
  type EngineCommand,
} from '../../../shared/api/engine-api.ts';
import type { ChromeWindowPort } from '../../chrome/window-opener.ts';
import { PRODUCT_NAME } from '../../identity/product.ts';
import type { ViewRegistry } from '../../security/views.ts';
import type { RendererOptions } from '../../window/web-preferences.ts';
import type { WindowOptions } from '../../window/windows.ts';
import type { EngineWindow } from './engine-host.ts';

/** The engine page's own in-memory session: it shares no storage with anything (ADR 0017). */
export const ENGINE_PARTITION = 'yapyap-engine';

export interface EngineWindowDependencies {
  /** `createSecureWindow`: sandboxed and context-isolated, like every window. */
  readonly createWindow: (options: WindowOptions, renderer: RendererOptions) => ChromeWindowPort;
  readonly views: ViewRegistry;
  /** The engine preload, whose bridge is the page's whole reach. */
  readonly preload: string;
  readonly warn: (message: string) => void;
}

/**
 * Opens the private model's engine page in a hidden window that is never
 * shown and takes no focus, on its own session. It is a chrome view of
 * its own origin, so it may not navigate away nor call the chrome API,
 * whose calls must come from `app://chrome`.
 */
export function engineWindowOpener(deps: EngineWindowDependencies): () => EngineWindow {
  return () => {
    const window = deps.createWindow(
      { show: false, skipTaskbar: true, focusable: false, width: 1, height: 1 },
      { partition: ENGINE_PARTITION, preload: deps.preload },
    );
    deps.views.set(window.webContents, {
      zone: 'chrome',
      home: ENGINE_ORIGIN,
      label: PRODUCT_NAME,
    });
    const loaded = window.loadURL(`${ENGINE_ORIGIN}/engine.html`).then(
      () => undefined,
      (error: unknown) => {
        deps.warn('Could not load the private model’s engine.');
        throw error;
      },
    );
    return {
      loaded,
      contents: window.webContents,
      send: (command: EngineCommand) => {
        (window.webContents.send as (channel: string, payload: unknown) => void)(
          ENGINE_CHANNELS.command,
          command,
        );
      },
      close: () => {
        if (!window.isDestroyed()) {
          window.close();
        }
      },
      onClosed: (listener) => {
        window.once('closed', listener);
      },
    };
  };
}
