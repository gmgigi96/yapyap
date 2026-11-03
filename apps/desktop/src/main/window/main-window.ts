import type { Settings } from '../settings/schema.ts';
import type { SettingsService } from '../settings/service.ts';
import { boundsOnScreen, parseWindowState, type Rect, type WindowState } from './window-state.ts';
import { readIfPresent, type TextFile } from '../atomic-write.ts';

export interface ManagedWindow {
  getNormalBounds(): Rect;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  maximize(): void;
  setFullScreen(flag: boolean): void;
  setAutoHideMenuBar(hide: boolean): void;
  setMenuBarVisibility(visible: boolean): void;
  hide(): void;
  show(): void;
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown;
  /** Windows ends sessions at shutdown without closing windows first. */
  on(event: 'session-end', listener: () => void): unknown;
  once(event: 'show', listener: () => void): unknown;
}

interface QuittingApp {
  on(event: 'before-quit' | 'activate', listener: () => void): unknown;
}

export interface MainWindowDependencies {
  readonly store: TextFile;
  readonly platform: string;
  readonly settings: Pick<SettingsService, 'current' | 'onChange'>;
  readonly app: QuittingApp;
  readonly warn: (message: string) => void;
}

/** The saved state, with bounds kept only while they land on a connected display. */
export function restoreWindowState(
  store: TextFile,
  workAreas: readonly Rect[],
): { readonly state: WindowState; readonly bounds: Rect | undefined } {
  const state = parseWindowState(readIfPresent(store));
  return { state, bounds: boundsOnScreen(state, workAreas) };
}

function applyMenuBar(window: ManagedWindow, platform: string, settings: Settings): void {
  // macOS keeps its menu bar at the top of the screen, outside the window.
  if (platform === 'darwin') {
    return;
  }
  const hide = settings.appearance.autoHideMenuBar;
  window.setAutoHideMenuBar(hide);
  window.setMenuBarVisibility(!hide);
}

function saveState(window: ManagedWindow, deps: MainWindowDependencies): void {
  const state: WindowState = {
    bounds: window.getNormalBounds(),
    maximized: window.isMaximized(),
    fullScreen: window.isFullScreen(),
  };
  try {
    deps.store.write(JSON.stringify(state));
  } catch {
    deps.warn('Could not save the window position.');
  }
}

/**
 * Maximizing or entering full screen also shows a hidden window, so a
 * window started minimized gets its layout back only once something shows
 * it, such as the tray.
 */
function restoreLayout(window: ManagedWindow, state: WindowState, hidden: boolean): void {
  const apply = (): void => {
    if (state.maximized) {
      window.maximize();
    }
    if (state.fullScreen) {
      window.setFullScreen(true);
    }
  };
  if (hidden) {
    window.once('show', apply);
  } else {
    apply();
  }
}

/**
 * Restores the window's maximized and full-screen state, follows the menu
 * bar setting, and saves the window's state whenever it closes. On macOS,
 * and elsewhere with "Close to the tray" on, closing the window hides it
 * until the Dock or tray brings it back, and only Quit really closes it.
 */
export function manageMainWindow(
  window: ManagedWindow,
  state: WindowState,
  deps: MainWindowDependencies,
): void {
  restoreLayout(window, state, deps.settings.current().general.startMinimized);
  applyMenuBar(window, deps.platform, deps.settings.current());
  deps.settings.onChange((settings) => {
    applyMenuBar(window, deps.platform, settings);
  });
  let quitting = false;
  deps.app.on('before-quit', () => {
    quitting = true;
  });
  deps.app.on('activate', () => {
    window.show();
  });
  window.on('session-end', () => {
    saveState(window, deps);
  });
  window.on('close', (event) => {
    saveState(window, deps);
    const keepRunning = deps.platform === 'darwin' || deps.settings.current().general.closeToTray;
    if (quitting || !keepRunning) {
      return;
    }
    event.preventDefault();
    window.hide();
  });
}
