import { showWhenReady } from '../window/show-when-ready.ts';
import type { ViewRegistry } from '../security/views.ts';
import type { WindowOptions } from '../window/windows.ts';
import { CHROME_ORIGIN, CHROME_VIEW } from './assets.ts';

export interface ChromeWindowPort {
  /** Where YapYap tells the page that something it shows has changed. */
  readonly webContents: { send(channel: string, ...args: never[]): void };
  isDestroyed(): boolean;
  focus(): void;
  once(event: 'ready-to-show' | 'closed', listener: () => void): unknown;
  close(): void;
  show(): void;
  loadURL(url: string): Promise<unknown>;
}

export interface ChromeWindowDependencies {
  readonly createWindow: (options: WindowOptions) => ChromeWindowPort;
  readonly views: ViewRegistry;
  readonly warn: (message: string) => void;
}

/** A chrome page that opens in its own window, such as About or Settings. */
export interface ChromePage {
  /** Relative to `app://chrome/`. */
  readonly path: string;
  readonly window: WindowOptions;
}

/**
 * Opens `page` in a new chrome window, known as chrome to the permission
 * and navigation guards, and shown once it has rendered or after a short
 * wait. A page that fails to load is logged.
 */
function openChromeWindow(
  deps: ChromeWindowDependencies,
  page: ChromePage,
  extra: WindowOptions,
): ChromeWindowPort {
  // Dialog-like windows have no use for the app menu, which Windows and Linux
  // would otherwise draw inside each of them.
  const window = deps.createWindow({
    autoHideMenuBar: true,
    ...page.window,
    ...extra,
    show: false,
  });
  showWhenReady(window);
  deps.views.set(window.webContents, CHROME_VIEW);
  window.loadURL(`${CHROME_ORIGIN}/${page.path}`).catch(() => {
    deps.warn(`Could not load ${page.path}.`);
  });
  return window;
}

/** Opens `page` in a window at most once: opening it again focuses it. */
export function chromeWindowOpener(deps: ChromeWindowDependencies, page: ChromePage): () => void {
  let current: ChromeWindowPort | undefined;
  return () => {
    if (current === undefined || current.isDestroyed()) {
      current = openChromeWindow(deps, page, {});
    } else {
      current.focus();
    }
  };
}

/** A window that asks one question and goes away once answered or closed. */
export interface PromptWindow {
  readonly webContents: object;
  close(): void;
  /** Called once the window is gone, however it was closed. */
  onClosed(listener: () => void): void;
}

/** Opens `page` as a prompt window, which closing twice cannot break. */
export function openPromptWindow(
  deps: ChromeWindowDependencies,
  page: ChromePage,
  extra: WindowOptions = {},
): PromptWindow {
  const window = openChromeWindow(deps, page, extra);
  return {
    webContents: window.webContents,
    close: () => {
      if (!window.isDestroyed()) {
        window.close();
      }
    },
    onClosed: (listener) => {
      window.once('closed', listener);
    },
  };
}
