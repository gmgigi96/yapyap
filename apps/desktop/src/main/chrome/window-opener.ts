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

export interface ChromeWindowDependencies<Window extends ChromeWindowPort = ChromeWindowPort> {
  readonly createWindow: (options: WindowOptions) => Window;
  readonly views: ViewRegistry;
  readonly warn: (message: string) => void;
}

/** A chrome page that opens in its own window, such as About or Settings. */
export interface ChromePage {
  /** Relative to `app://chrome/`. */
  readonly path: string;
  readonly window: WindowOptions;
}

/** Opens `page` in a new chrome window, shown once it has rendered or after a short wait. */
export function openChromeWindow<Window extends ChromeWindowPort>(
  deps: ChromeWindowDependencies<Window>,
  page: ChromePage,
  extra: WindowOptions = {},
): Window {
  // Dialog-like windows have no use for the app menu, which Windows and Linux
  // would otherwise draw inside each of them.
  const window = deps.createWindow({
    autoHideMenuBar: true,
    ...page.window,
    ...extra,
    show: false,
  });
  showWhenReady(window);
  void loadChromePage(deps, window, page.path);
  return window;
}

/**
 * Loads one of YapYap's own pages in `window`, known as chrome to the
 * permission and navigation guards. Settles once the load ends, however it
 * ends; a failure is logged.
 */
function loadChromePage(
  deps: Pick<ChromeWindowDependencies, 'views' | 'warn'>,
  window: Pick<ChromeWindowPort, 'webContents' | 'loadURL'>,
  path: string,
): Promise<void> {
  deps.views.set(window.webContents, CHROME_VIEW);
  return window.loadURL(`${CHROME_ORIGIN}/${path}`).then(
    () => undefined,
    () => {
      deps.warn(`Could not load ${path}.`);
    },
  );
}

/** A chrome window opened at most once. */
export interface ChromeWindowSlot {
  /** Opens the window, or focuses it when it is already open. */
  readonly open: () => void;
}

export function createChromeWindowSlot(
  deps: ChromeWindowDependencies,
  page: ChromePage,
): ChromeWindowSlot {
  let current: ChromeWindowPort | undefined;
  const open = (): ChromeWindowPort | undefined =>
    current !== undefined && !current.isDestroyed() ? current : undefined;
  return {
    open: () => {
      const shown = open();
      if (shown === undefined) {
        current = openChromeWindow(deps, page);
      } else {
        shown.focus();
      }
    },
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
export function openPromptWindow(deps: ChromeWindowDependencies, page: ChromePage): PromptWindow {
  return asPromptWindow(openChromeWindow(deps, page));
}

/** `window` as a prompt window, which closing twice cannot break. */
function asPromptWindow(window: ChromeWindowPort): PromptWindow {
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
