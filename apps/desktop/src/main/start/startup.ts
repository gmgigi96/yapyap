import { APP_ID, PRODUCT_NAME } from '../identity/product.ts';
import { guardGpu, type Graphics, type GraphicsReason } from '../recovery/gpu-safe-mode.ts';
import { applyResourceLimits } from '../reliability/resource-limits.ts';
import { watchForReleases } from '../updates/update-notice.ts';
import { startSelfUpdates } from '../updates/self-update.ts';
import { chooseDisplayBackend, type DisplayBackend } from '../display/backend.ts';
import { trackCrashes } from '../crash/crash-reports.ts';
import { installSecurity, type SecurityDependencies } from '../security/security.ts';
import type { MainWindowOptions } from '../window/windows.ts';
import { refuseUnsafeStart } from '../security/sandbox-check.ts';
import { manageMainWindow, restoreWindowState } from '../window/main-window.ts';
import { resolveWhatsAppOrigin } from '../whatsapp-origin.ts';
import { en } from '../../shared/messages/en.ts';
import { followGlobalShortcuts, toggleWindow } from '../shortcuts/global-shortcuts.ts';
import { createProxyLogin } from '../network/proxy-login.ts';
import { useCameraPortal } from '../permissions/camera-portal.ts';
import { headlessRequested, useHeadlessDisplay } from '../headless/headless.ts';
import type { StartDependencies, WindowPort } from './types.ts';

/** Starts without hardware acceleration, for when graphics problems stop YapYap from starting. */
const SAFE_MODE_FLAG = '--safe-mode';

/** A fallback the user did not choose in settings is worth telling them about. */
const GRAPHICS_NOTICES: Readonly<Record<GraphicsReason, string | undefined>> = {
  'safe-mode': en.notices.safeMode,
  'gpu-crashes': en.notices.gpuCrashes,
  settings: undefined,
};

const MAIN_WINDOW: MainWindowOptions = {
  title: PRODUCT_NAME,
  width: 1200,
  height: 800,
  minWidth: 640,
  minHeight: 480,
  show: false,
};

/** Everything Electron only accepts before the app is ready. */
export function beforeReady<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  security: SecurityDependencies,
): Graphics {
  const { app, warn } = deps;
  app.userAgentFallback = security.identity.userAgent;
  // Sandboxes the renderers Electron creates on its own too.
  app.enableSandbox();
  const graphics = guardGpu(app, {
    preferences: deps.settings.current().reliability,
    safeMode: deps.argv.includes(SAFE_MODE_FLAG),
    readLog: deps.gpuCrashLog.read,
    writeLog: deps.gpuCrashLog.write,
    now: Date.now,
    warn,
  });
  installSecurity(app, security);
  applyResourceLimits(app.commandLine, deps.settings.current().reliability);
  useCameraPortal(app.commandLine, deps.env);
  deps.chrome.beforeReady();
  // Windows groups notifications and taskbar entries by this ID.
  app.setAppUserModelId(APP_ID);
  app.on('window-all-closed', () => {
    app.quit();
  });
  return graphics;
}

/** Chromium reads the display backend only before the app is ready. */
export function applyDisplayBackend<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): DisplayBackend {
  if (headlessRequested(deps.argv)) {
    return useHeadlessDisplay(deps.app.commandLine, deps.platform);
  }
  const display = chooseDisplayBackend({
    platform: deps.platform,
    setting: deps.settings.current().reliability.displayBackend,
    argv: deps.argv,
    env: deps.env,
  });
  if (display.ozonePlatform !== undefined) {
    deps.app.commandLine.appendSwitch('ozone-platform', display.ozonePlatform);
  }
  if (display.fallback !== undefined) {
    deps.warn(display.fallback);
  }
  return display;
}

/** Starts watching for unclean exits; the returned function reports the last one once chrome is up. */
export function watchCrashes<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): (technicalDetails: () => string) => void {
  const report = trackCrashes({
    files: deps.crashes.files,
    version: deps.crashes.version,
    now: Date.now,
    setting: () => deps.settings.current().privacy.crashReports,
    onQuit: (listener) => {
      deps.app.on('will-quit', listener);
    },
    warn: deps.warn,
  });
  return (technicalDetails) => {
    report({ ...deps.crashes, technicalDetails, openExternal: deps.openExternal }).catch(() => {
      deps.warn('Could not offer the crash report.');
    });
  };
}

/** Tells the user about anything startup changed that they did not choose. */
export function announceStartup(
  deps: Pick<
    StartDependencies<WindowPort>,
    'settings' | 'notify' | 'releases' | 'selfUpdate' | 'warn'
  >,
  graphics: Graphics,
): void {
  const betas = (): boolean => deps.settings.current().general.betaUpdates;
  watchForReleases({ ...deps.releases, betas, every: setInterval, warn: deps.warn });
  startSelfUpdates(deps.selfUpdate.updater, {
    betas,
    policy: deps.releases.policy,
    askToInstall: deps.selfUpdate.askToInstall,
    every: setInterval,
    warn: deps.warn,
  });
  if (deps.settings.notice !== undefined) {
    deps.notify(deps.settings.notice);
  }
  const graphicsNotice =
    graphics.reason === undefined ? undefined : GRAPHICS_NOTICES[graphics.reason];
  if (graphicsNotice !== undefined) {
    deps.notify(graphicsNotice);
  }
}

export function whatsAppOrigin(
  env: Readonly<Record<string, string | undefined>>,
  warn: (message: string) => void,
): string {
  const { origin, rejectedOverride } = resolveWhatsAppOrigin(env['YAPYAP_TEST_WHATSAPP_ORIGIN']);
  if (rejectedOverride) {
    warn('Ignoring YAPYAP_TEST_WHATSAPP_ORIGIN: only loopback http origins are allowed.');
  }
  return origin;
}

/** Requests that come from no page, such as a service worker's, share one record of attempts. */
const NO_PAGE = {};

/** Proxies that ask for a password get the saved one, or the user is asked (#76). */
export function signInToProxies<Window extends WindowPort>(
  deps: Pick<StartDependencies<Window>, 'app' | 'secrets'>,
  chrome: Pick<ReturnType<StartDependencies<Window>['chrome']['afterReady']>, 'askProxyLogin'>,
): void {
  const login = createProxyLogin({
    secrets: deps.secrets,
    ask: chrome.askProxyLogin,
    now: Date.now,
  });
  deps.app.on('login', (event, contents, _details, info, callback) => {
    login.handle(event, contents?.session ?? NO_PAGE, info, callback);
  });
}

/** The shortcuts that work from any app, given back when YapYap quits (#75). */
export function takeGlobalShortcuts<Window extends WindowPort>(
  deps: Pick<StartDependencies<Window>, 'app' | 'globalShortcuts' | 'settings'>,
  window: Window,
): void {
  followGlobalShortcuts(deps.globalShortcuts, deps.settings, {
    toggleWindow: () => {
      toggleWindow(window);
    },
  });
  deps.app.on('will-quit', () => {
    deps.globalShortcuts.unregisterAll();
  });
}

/** Opens the main window where the user left it. */
export function openMainWindow<Window extends WindowPort>(deps: StartDependencies<Window>): Window {
  const { state, bounds } = restoreWindowState(deps.windowState, deps.workAreas());
  const window = deps.createWindow({ ...MAIN_WINDOW, ...bounds });
  manageMainWindow(window, state, {
    store: deps.windowState,
    platform: deps.platform,
    settings: deps.settings,
    app: deps.app,
    warn: deps.warn,
  });
  return window;
}

/**
 * Never runs unsandboxed: explains why YapYap will not start, then quits.
 * Headless, the logged reason is all there is, since nobody sees a dialog.
 */
export function refuseWithoutSandbox<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): Promise<void> {
  return refuseUnsafeStart({
    whenReady: () => deps.app.whenReady(),
    explain: headlessRequested(deps.argv) ? () => Promise.resolve(false) : deps.explainUnsafeStart,
    openExternal: deps.openExternal,
    logError: deps.logError,
    quit: () => {
      deps.app.quit();
    },
  });
}
