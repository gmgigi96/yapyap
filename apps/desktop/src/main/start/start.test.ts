import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeEmitter } from '../../../test/emitter.ts';
import { APP_ID } from '../identity/product.ts';
import { SHOW_FALLBACK_MS } from '../window/show-when-ready.ts';
import { startApp } from './start.ts';
import type { AppPort, WindowPort } from './types.ts';
import type { Accounts } from '../accounts/accounts.ts';
import type { AccountMenu } from '../chrome/feature.ts';
import type { CaptureChoice } from '../permissions/session-guard.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import type { PanelOwner } from '../chrome/quick-panel.ts';
import type { SidebarSource } from '../chrome/sidebar.ts';
import type { ContextMenuItem, ContextMenuParams } from '../spelling/context-menu.ts';
import type { ProxyLoginAnswer } from '../../shared/chrome-api.ts';
import { WHATSAPP_ORIGIN } from '../whatsapp-origin.ts';
import type { WindowOptions } from '../window/windows.ts';
import type { ExtensionAction } from '../extensions/runtime.ts';
import type { AssistantBar } from '../assistant/bar.ts';
import type { AssistantBarView } from '../assistant/bar-page.ts';

const ACCOUNT = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';
const SECOND = '7d2e9b1c-3f4a-4c5d-8e6f-1a2b3c4d5e6f';
const THIRD = '0f0e0d0c-0b0a-4908-8706-050403020100';

/** A web contents whose listeners the test can fire by event name. */
function fakeContents() {
  const { on, once, fire } = fakeEmitter();
  const contents = {
    on,
    once,
    focus: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    setZoomFactor: vi.fn(),
    getZoomFactor: () => 1,
    loadURL: vi.fn(() => Promise.resolve()),
    executeJavaScriptInIsolatedWorld: vi.fn((): Promise<unknown> => Promise.resolve()),
    reload: vi.fn(),
    send: vi.fn(),
    forcefullyCrashRenderer: vi.fn(),
    getOSProcessId: () => 4242,
    setBackgroundThrottling: vi.fn(),
    setAudioMuted: vi.fn(),
    setWebRTCIPHandlingPolicy: vi.fn(),
    insertText: vi.fn(() => Promise.resolve()),
    sendInputEvent: vi.fn(),
    insertCSS: vi.fn(() => Promise.resolve('privacy')),
    removeInsertedCSS: vi.fn(() => Promise.resolve()),
    replaceMisspelling: vi.fn(),
    isDestroyed: vi.fn(() => false),
    session: {
      clearCache: vi.fn(() => Promise.resolve()),
      clearStorageData: vi.fn(() => Promise.resolve()),
      fetch: vi.fn(() => Promise.resolve(new Response(new Uint8Array(4)))),
    },
  };
  return { contents, fire };
}

function fakes(env: Record<string, string | undefined> = {}, argv: readonly string[] = []) {
  const web = fakeContents();
  const listeners = new Map<string, (...args: never[]) => void>();
  const app = {
    userAgentFallback: '',
    disableHardwareAcceleration: vi.fn(),
    commandLine: {
      appendSwitch: vi.fn(),
      hasSwitch: vi.fn(() => false),
      getSwitchValue: vi.fn<(name: string) => string>(() => ''),
    },
    enableSandbox: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    setAppUserModelId: vi.fn(),
    // Every listener of an event runs, as Electron's emitter runs them all.
    on: vi.fn((event: string, listener: (...args: never[]) => void) => {
      const previous = listeners.get(event);
      listeners.set(
        event,
        previous === undefined
          ? listener
          : (...args: never[]) => {
              previous(...args);
              listener(...args);
            },
      );
    }),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
  } satisfies AppPort;
  const window = {
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    on: vi.fn(),
    setTitle: vi.fn(),
    show: vi.fn(),
    isMinimized: vi.fn(() => false),
    isFocused: vi.fn(() => false),
    restore: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    maximize: vi.fn(),
    setFullScreen: vi.fn(),
    getNormalBounds: vi.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
    isMaximized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    setAutoHideMenuBar: vi.fn(),
    setMenuBarVisibility: vi.fn(),
    setOverlayIcon: vi.fn(),
    isVisible: vi.fn(() => true),
  } satisfies WindowPort;
  const createWindow = vi.fn<(options: WindowOptions) => WindowPort>(() => window);
  const panel = vi.fn<(source: SidebarSource) => void>();
  const runtime = {
    attachRecovery: vi.fn<
      (
        contents: unknown,
        origin: string,
        createOverlay: (renderer: object) => unknown,
      ) => { reconnect: () => void }
    >(() => ({ reconnect: vi.fn() })),
    pickCaptureSource: vi.fn<(contents: object) => Promise<CaptureChoice | undefined>>(() =>
      Promise.resolve({ video: { id: 'screen:1:0', name: 'Screen' } }),
    ),
    technicalDetails: () => 'YapYap 0.1.0 (deb)',
    openChatsWith: vi.fn<(open: (phone: string) => void) => void>(),
    setAccountMenu: vi.fn<(menu: AccountMenu) => void>(),
    openSettings: vi.fn(),
    openWelcome: vi.fn(),
    openSpellingLanguages: vi.fn(),
    askProxyLogin: vi.fn(() =>
      Promise.resolve<ProxyLoginAnswer | undefined>({
        username: 'ana',
        password: 'hunter2',
        remember: false,
      }),
    ),
    sidebar: vi.fn<(source: SidebarSource) => void>(),
    attachSidebar: vi.fn((create: (renderer: object) => unknown) => {
      create({ preload: '/app/preload/chrome.cjs' });
      return runtime.sidebar;
    }),
    panel,
    attachQuickPanel: vi.fn<(owner: PanelOwner) => typeof panel>(() => panel),
    extensionActions: vi.fn<() => readonly ExtensionAction[]>(() => []),
    runExtensionCommand: vi.fn(() => true),
    installExtensionFromLink: vi.fn(),
    assistantBar: {
      state: vi.fn(() => ({
        status: '',
        working: false,
        suggestions: ['On my way'],
        result: null,
        buttons: [],
        choice: undefined,
        rewrites: [],
      })),
      refresh: vi.fn(() => Promise.resolve()),
      suggest: vi.fn(() => Promise.resolve()),
      suggestOnArrival: vi.fn(() => Promise.resolve()),
      prompt: vi.fn(() => Promise.resolve()),
      summarize: vi.fn(() => Promise.resolve()),
      rewrite: vi.fn(() => Promise.resolve()),
      catchUp: vi.fn(() => Promise.resolve()),
      use: vi.fn(() => Promise.resolve()),
      send: vi.fn(() => Promise.resolve()),
      choose: vi.fn(() => Promise.resolve()),
      button: vi.fn(() => Promise.resolve()),
      privateModelChanged: vi.fn(() => Promise.resolve()),
    } satisfies AssistantBar,
    assistantBarView: undefined as AssistantBarView | undefined,
    attachAssistantBar: vi.fn((create: (bar: AssistantBar) => AssistantBarView) => {
      runtime.assistantBarView = create(runtime.assistantBar);
    }),
    recorder: {
      gate: { recording: () => false, callFrame: () => undefined },
      stop: vi.fn(() => Promise.resolve()),
    },
  };
  const createSidebar = vi.fn(() => ({
    webContents: { loadURL: vi.fn(() => Promise.resolve()), send: vi.fn() },
    setWidth: vi.fn(),
  }));
  // The first account's page is `web`, so single-account tests read it directly.
  const hosts: {
    page: ReturnType<typeof fakeContents>;
    webContents: ReturnType<typeof fakeContents>['contents'];
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    createOverlay: ReturnType<typeof vi.fn>;
  }[] = [];
  const createAccountHost = vi.fn(() => {
    const page = hosts.length === 0 ? web : fakeContents();
    const host = {
      page,
      webContents: page.contents,
      show: vi.fn(),
      hide: vi.fn(),
      close: vi.fn(),
      createOverlay: vi.fn(),
    };
    hosts.push(host);
    return host;
  });
  const stored = new Map<string, string>();
  const natives: {
    options: { title: string; body: string; silent: boolean };
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }[] = [];
  const ipcListeners = new Map<string, (event: unknown, ...args: unknown[]) => void>();
  const warn = vi.fn();
  const openExternal = vi.fn(() => Promise.resolve());
  const fakeSession = () => ({
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    setUserAgent: vi.fn(),
    setSpellCheckerEnabled: vi.fn(),
    setSpellCheckerLanguages: vi.fn(),
    webRequest: { onBeforeSendHeaders: vi.fn() },
    on: vi.fn(),
    clearStorageData: vi.fn(() => Promise.resolve()),
    clearCache: vi.fn(() => Promise.resolve()),
    availableSpellCheckerLanguages: ['en-GB', 'en-US', 'pt-PT'],
    addWordToSpellCheckerDictionary: vi.fn(() => true),
    setProxy: vi.fn(() => Promise.resolve()),
    closeAllConnections: vi.fn(() => Promise.resolve()),
  });
  const session = fakeSession();
  const accountSession = fakeSession();
  const capture = {
    contentsOfFrame: vi.fn(),
    isVisibleAndFocused: vi.fn(() => true),
    pick: undefined,
    useSystemPicker: false,
  };
  return {
    app,
    runtime,
    window,
    web,
    session,
    createWindow,
    createAccountHost,
    createSidebar,
    hosts,
    saveAccounts: vi.fn(),
    whatsAppPreload: '/out/preload/whatsapp.cjs',
    customCode: { attach: vi.fn() },
    natives,
    notifications: {
      create: vi.fn((options: { title: string; body: string; silent: boolean }) => {
        const native = { options, show: vi.fn(), close: vi.fn(), on: vi.fn() };
        natives.push(native);
        return native;
      }),
      isSupported: () => true,
    },
    ipc: {
      on: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => void) =>
        ipcListeners.set(channel, listener),
      ),
    },
    ipcListeners,
    newAccountId: () => SECOND,
    defaultSession: () => session,
    sessionOf: vi.fn(() => accountSession),
    accountSession,
    accounts: {
      version: 1 as const,
      accounts: [{ id: ACCOUNT, name: 'WhatsApp', color: 'green' as const, enabled: true }],
      active: ACCOUNT,
    },
    askMedia: vi.fn(() => Promise.resolve(true)),
    capture: vi.fn<
      (pickInApp: (contents: object) => Promise<unknown>, wayland: boolean) => typeof capture
    >(() => capture),
    chromeVersion: '152.0.7977.167',
    platform: 'linux',
    chrome: { beforeReady: vi.fn(), afterReady: vi.fn(() => runtime) },
    warn,
    openExternal,
    isOnline: vi.fn(() => true),
    gpuCrashLog: { read: () => '[]', write: vi.fn() },
    avatarImage: vi.fn((): string | undefined => 'data:image/png;base64,avatar'),
    selfUpdate: (() => {
      const instance = {
        autoDownload: false,
        autoInstallOnAppQuit: true,
        allowPrerelease: false,
        allowDowngrade: false,
        checkForUpdates: vi.fn(() => Promise.resolve()),
        on: vi.fn(),
        quitAndInstall: vi.fn(),
      };
      return {
        instance,
        updater: vi.fn(() => Promise.resolve(instance)),
        askToInstall: vi.fn(() => Promise.resolve(false)),
      };
    })(),
    badge: {
      setBadgeCount: vi.fn(() => true),
      createImage: vi.fn(() => ({})),
    },
    autostart: { enabled: vi.fn(() => false), enable: vi.fn(), disable: vi.fn(), refresh: vi.fn() },
    tray: {
      create: vi.fn(() => ({
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        setTitle: vi.fn(),
        on: vi.fn(),
        setImage: vi.fn(),
      })),
      buildMenu: vi.fn((template: unknown) => template),
      image: vi.fn((choice: string) => `image:${choice}`),
      scheme: {
        shouldUseDarkColors: true,
        shouldUseDarkColorsForSystemIntegratedUI: false,
        on: vi.fn(),
      },
    },
    releases: {
      policy: 'manual' as 'manual' | 'notify' | 'self-update',
      currentVersion: '0.1.0',
      fetchJson: vi.fn(() =>
        Promise.resolve({ tag_name: 'v0.2.0', draft: false, prerelease: false }),
      ),
      showNotice: vi.fn(),
    },
    appMetrics: vi.fn(() => [{ pid: 4242, memory: { workingSetSize: 100 * 1024 } }]),
    idleSeconds: () => 600,
    globalShortcuts: { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() },
    systemLanguages: () => ['pt-PT', 'en-GB'],
    contextMenu: vi.fn(),
    secrets: {
      canKeep: () => Promise.resolve(true),
      get: vi.fn<(name: string) => Promise<string | undefined>>(() => Promise.resolve(undefined)),
      set: vi.fn(() => Promise.resolve(true)),
    },
    settings: {
      current: () => defaultSettings(),
      notice: undefined as string | undefined,
      firstRun: false,
      update: vi.fn(),
      onChange: vi.fn(),
    },
    nativeTheme: { themeSource: 'light' as 'system' | 'light' | 'dark' },
    notify: vi.fn(),
    onResume: vi.fn(),
    env,
    argv,
    chatListWidths: {
      get: vi.fn<(account: string) => number | undefined>(() => undefined),
      set: vi.fn(),
      forget: vi.fn(),
    },
    windowState: {
      read: vi.fn((): string => {
        throw new Error('ENOENT');
      }),
      write: vi.fn(),
    },
    workAreas: () => [{ x: 0, y: 0, width: 1920, height: 1040 }],
    shutdown: { onSignal: vi.fn(), onSystemShutdown: vi.fn() },
    sandboxDisabled: false,
    explainUnsafeStart: vi.fn(() => Promise.resolve(false)),
    logError: vi.fn(),
    downloads: {
      folder: () => '/home/someone/Downloads',
      taken: () => false,
      lastFolder: { get: () => undefined, set: vi.fn() },
      openPath: vi.fn(() => Promise.resolve('')),
      track: vi.fn(),
    },
    crashes: {
      files: {
        read: (name: string) => stored.get(name),
        write: vi.fn((name: string, text: string) => stored.set(name, text)),
        remove: (name: string) => {
          stored.delete(name);
        },
        modifiedAt: () => undefined,
        clearDumps: () => 0,
      },
      version: '0.1.0',
      previousLog: () => ['last line'],
      review: vi.fn<(report: string) => Promise<'report' | 'copy' | 'close'>>(() =>
        Promise.resolve('close'),
      ),
      writeClipboard: vi.fn(() => Promise.resolve()),
    },
    stored,
    listeners,
  };
}

type Fakes = ReturnType<typeof fakes>;

interface TrayEntry {
  readonly label?: string;
  readonly checked?: boolean;
  readonly click?: () => void;
}

/** The tray menu as YapYap last built it. */
const trayMenu = (f: Pick<Fakes, 'tray'>): TrayEntry[] =>
  (f.tray.buildMenu.mock.calls.at(-1)?.[0] ?? []) as TrayEntry[];

const trayItem = (f: Pick<Fakes, 'tray'>, label: string): TrayEntry | undefined =>
  trayMenu(f).find((entry) => entry.label === label);

/** Clicks the tray item with this label, which must be there. */
function clickTray(f: Pick<Fakes, 'tray'>, label: string): void {
  const click = trayItem(f, label)?.click;
  if (click === undefined) {
    throw new Error(`The tray has no ${label}.`);
  }
  click();
}

/** What the account menu was last told. */
function accountMenu(f: Pick<Fakes, 'runtime'>): AccountMenu {
  const [last] = f.runtime.setAccountMenu.mock.calls.at(-1) ?? [];
  if (last === undefined) {
    throw new Error('No account menu was set.');
  }
  return last;
}

/** What the sidebar was last shown. */
function sidebar(f: Pick<Fakes, 'runtime'>): SidebarSource {
  const [last] = f.runtime.sidebar.mock.calls.at(-1) ?? [];
  if (last === undefined) {
    throw new Error('The sidebar was never shown.');
  }
  return last;
}

/** Runs every listener the main window has for `name`. */
function windowEvent(f: Pick<Fakes, 'window'>, name: string): void {
  for (const [event, listener] of f.window.on.mock.calls) {
    if (event === name) {
      (listener as () => void)();
    }
  }
}

describe('startApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a hidden, hardened window on the real WhatsApp origin and shows it when ready', async () => {
    const f = fakes();
    await startApp(f);

    expect(f.app.setAppUserModelId).toHaveBeenCalledWith(APP_ID);
    expect(f.createWindow).toHaveBeenCalledWith(expect.objectContaining({ show: false }));
    expect(f.web.contents.loadURL).toHaveBeenCalledWith(WHATSAPP_ORIGIN);
    expect(f.window.show).not.toHaveBeenCalled();
    f.web.fire('dom-ready');
    expect(f.window.show).toHaveBeenCalledOnce();
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('sandboxes every renderer and guards every web contents before the app is ready', async () => {
    const f = fakes();
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.app.enableSandbox).toHaveBeenCalledOnce();
      expect(f.listeners.has('web-contents-created')).toBe(true);
      return Promise.resolve();
    });
    await startApp(f);
    const other = fakeContents();
    f.listeners.get('web-contents-created')?.(...([{}, other.contents] as never[]));
    const attach = { preventDefault: vi.fn() };
    other.fire('will-attach-webview', attach);
    expect(attach.preventDefault).toHaveBeenCalledOnce();
    expect(other.contents.setWindowOpenHandler).toHaveBeenCalledOnce();
  });

  it('registers the chrome scheme before the app is ready and serves chrome after', async () => {
    const f = fakes();
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.chrome.beforeReady).toHaveBeenCalledOnce();
      expect(f.chrome.afterReady).not.toHaveBeenCalled();
      return Promise.resolve();
    });
    await startApp(f);
    expect(f.chrome.afterReady).toHaveBeenCalledExactlyOnceWith(
      expect.any(WeakMap),
      f.warn,
      'hardware accelerated, display X11 (automatic)',
      false,
    );
  });

  it('watches the WhatsApp window and lays the recovery screen over that window', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.runtime.attachRecovery).toHaveBeenCalledExactlyOnceWith(
      f.web.contents,
      WHATSAPP_ORIGIN,
      expect.any(Function),
    );
    const [[, , createOverlay]] = f.runtime.attachRecovery.mock.calls as [
      [unknown, unknown, (renderer: object) => unknown],
    ];
    expect(createOverlay).toBe(f.hosts[0]?.createOverlay);
  });

  it('presents the bundled Chromium as desktop Chrome everywhere', async () => {
    const f = fakes();
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.app.userAgentFallback).toBe(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      );
      return Promise.resolve();
    });
    await startApp(f);
    expect(f.session.setUserAgent).toHaveBeenCalledExactlyOnceWith(f.app.userAgentFallback);
    expect(f.session.webRequest.onBeforeSendHeaders).toHaveBeenCalledOnce();
  });

  it('applies the permission policy to the default session and to every new session', async () => {
    const f = fakes();
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.session.setPermissionRequestHandler).not.toHaveBeenCalled();
      return Promise.resolve();
    });
    await startApp(f);
    expect(f.session.setPermissionRequestHandler).toHaveBeenCalledOnce();
    const created = { ...f.session, setPermissionRequestHandler: vi.fn(), setUserAgent: vi.fn() };
    f.listeners.get('session-created')?.(...([created] as never[]));
    expect(created.setPermissionRequestHandler).toHaveBeenCalledOnce();
    expect(created.setUserAgent).toHaveBeenCalledExactlyOnceWith(f.app.userAgentFallback);
  });

  it('puts the default session and every new one on the proxy setting', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.session.setProxy).toHaveBeenCalledWith({ mode: 'system' });
    const created = { ...f.session, setProxy: vi.fn(() => Promise.resolve()) };
    f.listeners.get('session-created')?.(...([created] as never[]));
    expect(created.setProxy).toHaveBeenCalledExactlyOnceWith({ mode: 'system' });
  });

  it('signs in to a proxy that asks, for page requests and pageless ones alike', async () => {
    const f = fakes();
    await startApp(f);
    const login = f.listeners.get('login');
    const callback = vi.fn();
    const proxy = { isProxy: true, host: 'proxy.example.org', port: 3128 };
    login?.(...([{ preventDefault: vi.fn() }, { session: {} }, {}, proxy, callback] as never[]));
    login?.(...([{ preventDefault: vi.fn() }, null, {}, proxy, callback] as never[]));
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledWith('ana', 'hunter2');
    });
    expect(f.runtime.askProxyLogin).toHaveBeenCalledOnce();
  });

  it('keeps a proxy named on the command line while the setting follows the system', async () => {
    const f = fakes();
    f.app.commandLine.getSwitchValue.mockImplementation((name) =>
      name === 'proxy-server' ? 'http://127.0.0.1:3128' : '',
    );
    await startApp(f);
    expect(f.session.setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://127.0.0.1:3128',
    });
  });

  it('lets the WhatsApp window send notifications from its own origin', async () => {
    const f = fakes();
    await startApp(f);
    const [[handler]] = f.session.setPermissionRequestHandler.mock.calls as [
      [
        (
          contents: object,
          permission: string,
          callback: (granted: boolean) => void,
          details: object,
        ) => void,
      ],
    ];
    const callback = vi.fn();
    handler(f.web.contents, 'notifications', callback, { requestingUrl: `${WHATSAPP_ORIGIN}/` });
    handler(f.web.contents, 'geolocation', callback, { requestingUrl: `${WHATSAPP_ORIGIN}/` });
    // Answers settle as promises, since some requests wait for the user.
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[true], [false]]);
  });

  it('keeps the window on its origin and opens other links in the browser', async () => {
    const f = fakes();
    await startApp(f);
    f.listeners.get('web-contents-created')?.(...([{}, f.web.contents] as never[]));
    const inside = { url: `${WHATSAPP_ORIGIN}/x`, isMainFrame: true, preventDefault: vi.fn() };
    const outside = { url: 'https://example.com/', isMainFrame: true, preventDefault: vi.fn() };
    f.web.fire('will-navigate', inside);
    f.web.fire('will-navigate', outside);
    expect(inside.preventDefault).not.toHaveBeenCalled();
    expect(outside.preventDefault).toHaveBeenCalledOnce();
    expect(f.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/');
  });

  it('shows the window when WhatsApp failed to load, so recovery can be seen', async () => {
    const f = fakes();
    await startApp(f);
    f.web.fire('did-fail-load');
    expect(f.window.show).toHaveBeenCalledOnce();
  });

  it('shows the window after a fallback delay when the page never gets ready, exactly once', async () => {
    const f = fakes();
    await startApp(f);
    vi.advanceTimersByTime(SHOW_FALLBACK_MS - 1);
    expect(f.window.show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.window.show).toHaveBeenCalledOnce();
    f.web.fire('dom-ready');
    expect(f.window.show).toHaveBeenCalledOnce();
  });

  it('does not show the window twice when the page gets ready before the fallback', async () => {
    const f = fakes();
    await startApp(f);
    f.web.fire('dom-ready');
    vi.advanceTimersByTime(SHOW_FALLBACK_MS);
    expect(f.window.show).toHaveBeenCalledOnce();
  });

  it('waits for the app to be ready before creating the window', async () => {
    const f = fakes();
    let ready: () => void = () => undefined;
    f.app.whenReady.mockReturnValueOnce(new Promise<void>((resolve) => (ready = resolve)));
    const started = startApp(f);
    await Promise.resolve();
    expect(f.createWindow).not.toHaveBeenCalled();
    ready();
    await started;
    expect(f.createWindow).toHaveBeenCalledOnce();
  });

  it('quits when every window is closed', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.app.quit).not.toHaveBeenCalled();
    f.listeners.get('window-all-closed')?.();
    expect(f.app.quit).toHaveBeenCalledOnce();
  });

  it('marks the title while offline and reconnects when the system wakes', async () => {
    vi.useFakeTimers();
    const f = fakes();
    const reconnect = vi.fn();
    f.runtime.attachRecovery.mockReturnValueOnce({ reconnect });
    f.isOnline.mockReturnValue(false);
    await startApp(f);
    expect(f.window.setTitle).toHaveBeenCalledWith('YapYap (offline)');
    const [[resume]] = f.onResume.mock.calls as [[() => void]];
    resume();
    vi.runOnlyPendingTimers();
    expect(reconnect).toHaveBeenCalled();
  });

  it('turns hardware acceleration off before ready when the settings say so', async () => {
    const f = fakes();
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      reliability: { ...settings.reliability, hardwareAcceleration: false },
    });
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.app.disableHardwareAcceleration).toHaveBeenCalledOnce();
      return Promise.resolve();
    });
    await startApp(f);
    expect(f.chrome.afterReady).toHaveBeenCalledWith(
      expect.anything(),
      f.warn,
      'software rendering (turned off in settings), display X11 (automatic)',
      false,
    );
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('puts Chromium on the display backend chosen in settings, before ready', async () => {
    const f = fakes({ WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' });
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      reliability: { ...settings.reliability, displayBackend: 'x11' },
    });
    await startApp(f);
    expect(f.app.commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith('ozone-platform', 'x11');
    expect(f.capture).toHaveBeenCalledExactlyOnceWith(expect.any(Function), false);
    expect(f.chrome.afterReady).toHaveBeenCalledWith(
      expect.anything(),
      f.warn,
      'hardware accelerated, display X11 (settings)',
      false,
    );
  });

  it('reaches the camera through the portal inside Flatpak, before ready', async () => {
    const f = fakes({ FLATPAK_ID: 'org.guita.YapYap' });
    await startApp(f);
    expect(f.app.commandLine.appendSwitch).toHaveBeenCalledWith(
      'enable-features',
      'WebRtcPipeWireCamera',
    );
  });

  it('uses the portal picker when Chromium runs natively on Wayland', async () => {
    const f = fakes({ WAYLAND_DISPLAY: 'wayland-0' });
    await startApp(f);
    expect(f.app.commandLine.appendSwitch).not.toHaveBeenCalled();
    expect(f.capture).toHaveBeenCalledExactlyOnceWith(expect.any(Function), true);
    expect(f.chrome.afterReady).toHaveBeenCalledWith(
      expect.anything(),
      f.warn,
      expect.any(String),
      true,
    );
  });

  it('logs why a display backend chosen in settings could not be used', async () => {
    const f = fakes({ DISPLAY: ':0' });
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      reliability: { ...settings.reliability, displayBackend: 'wayland' },
    });
    await startApp(f);
    expect(f.app.commandLine.appendSwitch).not.toHaveBeenCalled();
    expect(f.warn).toHaveBeenCalledWith(
      'The Wayland display backend was chosen in settings, but WAYLAND_DISPLAY is not set; using the automatic choice.',
    );
  });

  it('keeps hardware acceleration on by default and tells the user about repaired settings', async () => {
    const f = fakes();
    f.settings.notice = 'Some settings were invalid and were reset to their defaults.';
    await startApp(f);
    expect(f.app.disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(f.app.commandLine.appendSwitch).not.toHaveBeenCalled();
    expect(f.chrome.afterReady).toHaveBeenCalledWith(
      expect.anything(),
      f.warn,
      'hardware accelerated, display X11 (automatic)',
      false,
    );
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(
      'Some settings were invalid and were reset to their defaults.',
    );
  });

  it('hands screen-sharing requests to YapYap’s picker once chrome is ready', async () => {
    const f = fakes();
    let ready: () => void = () => undefined;
    f.app.whenReady.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    );
    const started = startApp(f);
    const [[pickInApp]] = f.capture.mock.calls as unknown as [
      [(contents: object) => Promise<unknown>],
    ];
    const requester = {};
    expect(await pickInApp(requester)).toBeUndefined();
    ready();
    await started;
    expect(await pickInApp(requester)).toEqual({ video: { id: 'screen:1:0', name: 'Screen' } });
    expect(f.runtime.pickCaptureSource).toHaveBeenCalledExactlyOnceWith(requester);
  });

  it('reloads the WhatsApp window when it keeps using more memory than the setting allows', async () => {
    const f = fakes();
    await startApp(f);
    f.appMetrics.mockReturnValue([{ pid: 4242, memory: { workingSetSize: 3000 * 1024 } }]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(f.web.contents.reload).toHaveBeenCalledOnce();
    expect(f.warn).toHaveBeenCalledWith(
      'The WhatsApp renderer used 3000 MB, over the 2048 MB limit; reloading it.',
    );
  });

  it('opens chats from the New Chat window in the WhatsApp window, brought to the front', async () => {
    const f = fakes();
    await startApp(f);
    const open = f.runtime.openChatsWith.mock.calls[0]?.[0];
    f.window.isMinimized.mockReturnValueOnce(true);
    open?.('447700900123');
    expect(f.window.restore).toHaveBeenCalledOnce();
    expect(f.window.focus).toHaveBeenCalled();
    expect(f.web.contents.loadURL).toHaveBeenLastCalledWith(
      'https://web.whatsapp.com/send?phone=447700900123',
    );
    f.web.contents.loadURL.mockRejectedValueOnce(new Error('ERR_INTERNET_DISCONNECTED'));
    open?.('447700900123');
    await vi.advanceTimersByTimeAsync(0);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('tells a portable build about a new release, and other builds never ask', async () => {
    const quiet = fakes();
    await startApp(quiet);
    expect(quiet.releases.fetchJson).not.toHaveBeenCalled();
    const f = fakes();
    f.releases.policy = 'notify';
    await startApp(f);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.releases.showNotice).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('YapYap 0.2.0 is available'),
      'https://github.com/vascoguita/yapyap/releases/tag/v0.2.0',
    );
  });

  it('starts self-updates only for builds that can update themselves', async () => {
    const quiet = fakes();
    await startApp(quiet);
    expect(quiet.selfUpdate.updater).not.toHaveBeenCalled();
    const f = fakes();
    f.releases.policy = 'self-update';
    await startApp(f);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.selfUpdate.instance.checkForUpdates).toHaveBeenCalledOnce();
    expect(f.selfUpdate.instance.autoInstallOnAppQuit).toBe(false);
  });

  it('opens the welcome on the first launch only, saving the defaults so it stays away', async () => {
    const later = fakes();
    await startApp(later);
    expect(later.runtime.openWelcome).not.toHaveBeenCalled();
    const first = fakes();
    first.settings.firstRun = true;
    await startApp(first);
    expect(first.runtime.openWelcome).toHaveBeenCalledOnce();
    const [change] = first.settings.update.mock.calls.at(-1) as [(settings: unknown) => unknown];
    const settings = defaultSettings();
    expect(change(settings)).toBe(settings);
  });

  it('puts YapYap in the tray, keeping its menu and count up to date', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.tray.create).toHaveBeenCalledOnce();
    const icon = f.tray.create.mock.results[0]?.value as { setImage: ReturnType<typeof vi.fn> };
    expect(icon.setImage).toHaveBeenCalledWith('image:color');
    const tray = f.tray.create.mock.results[0]?.value as {
      setToolTip: ReturnType<typeof vi.fn>;
    };
    expect(trayMenu(f)[0]?.label).toBe('Hide YapYap');
    f.window.isVisible.mockReturnValue(false);
    windowEvent(f, 'hide');
    expect(trayMenu(f)[0]?.label).toBe('Show YapYap');
    f.web.fire('page-title-updated', {}, '(2) WhatsApp');
    expect(tray.setToolTip).toHaveBeenLastCalledWith('YapYap: 2 unread chats');
    clickTray(f, 'Settings…');
    expect(f.runtime.openSettings).toHaveBeenCalledOnce();
    clickTray(f, 'Quit YapYap');
    expect(f.app.quit).toHaveBeenCalledOnce();
  });

  it('gives each account’s WhatsApp the user’s own CSS and JavaScript', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.customCode.attach).toHaveBeenCalledExactlyOnceWith(f.hosts[0]?.webContents, ACCOUNT);
  });

  it('lets the quick-access panel stand in for a window out of sight, and bring it back', async () => {
    const f = fakes();
    await startApp(f);
    const owner = f.runtime.attachQuickPanel.mock.calls[0]?.[0];
    expect(owner?.visible()).toBe(true);
    f.window.isMinimized.mockReturnValue(true);
    expect(owner?.visible()).toBe(false);
    owner?.bringToFront();
    expect(f.window.restore).toHaveBeenCalledOnce();
    expect(f.window.show).toHaveBeenCalled();
    f.web.fire('page-title-updated', {}, '(2) WhatsApp');
    expect(f.runtime.panel).toHaveBeenLastCalledWith(sidebar(f));
  });

  it('reads the active account’s open chat for an extension, through the adapter', async () => {
    const f = fakes();
    await startApp(f);
    const menu = accountMenu(f);
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce(null);
    await expect(menu.readActiveChat(5)).resolves.toBeNull();
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce([]);
    await expect(menu.readUnreadSummary()).resolves.toEqual([]);
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce('Draft');
    await expect(menu.readDraft()).resolves.toBe('Draft');
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce(true);
    await expect(menu.replaceDraft('New')).resolves.toBe(true);
    expect(f.web.contents.insertText).toHaveBeenLastCalledWith('New');
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce(true);
    await expect(menu.pressEnter()).resolves.toBe(true);
    expect(f.web.contents.sendInputEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyDown', keyCode: 'Enter' }),
    );
  });

  it('puts an extension’s draft in the active account’s open chat, and only there', async () => {
    const f = fakes();
    await startApp(f);
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce(true);
    await expect(accountMenu(f).insertDraft('Draft')).resolves.toBe(true);
    expect(f.web.contents.insertText).toHaveBeenCalledExactlyOnceWith('Draft');
  });

  it('shows the unread count from the page title as the app badge', async () => {
    const f = fakes();
    await startApp(f);
    f.web.fire('page-title-updated', { preventDefault: vi.fn() }, '(3) WhatsApp');
    expect(f.badge.setBadgeCount).toHaveBeenCalledWith(3);
    expect(f.window.setTitle).toHaveBeenLastCalledWith('(3) WhatsApp');
  });

  it('shows the assistant bar in the active account’s page, and hears it from there alone', async () => {
    const f = fakes();
    await startApp(f);
    const view = f.runtime.assistantBarView;
    f.web.contents.executeJavaScriptInIsolatedWorld.mockClear();
    view?.show(true);
    expect(f.web.contents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(1000, [
      { code: expect.stringContaining('"visible":true') as unknown },
    ]);
    view?.show(false);
    const fromPage = { sender: f.web.contents, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } };
    f.ipcListeners.get('whatsapp:assistant-bar-send')?.(fromPage, 1);
    await vi.waitFor(() => {
      expect(f.runtime.assistantBar.send).toHaveBeenCalledExactlyOnceWith(1);
    });
    f.ipcListeners.get('whatsapp:assistant-bar-send')?.({ ...fromPage, sender: {} }, 2);
    expect(f.warn).toHaveBeenCalledWith('Ignored a message on whatsapp:assistant-bar-send.');
    expect(f.runtime.assistantBar.send).toHaveBeenCalledOnce();
  });

  it('puts the assistant bar back only while the window is on screen', async () => {
    vi.useFakeTimers();
    const f = fakes();
    const settings = defaultSettings();
    // Only the bar's own drawing counts here, not the look for new messages.
    f.settings.current = () => ({
      ...settings,
      assistant: { ...settings.assistant, autoSuggest: false },
    });
    await startApp(f);
    f.runtime.assistantBarView?.show(true);
    f.web.contents.executeJavaScriptInIsolatedWorld.mockClear();
    // The chat list is sized on its own timer, which this test leaves out.
    const barRenders = (): number =>
      (
        f.web.contents.executeJavaScriptInIsolatedWorld.mock.calls as unknown as [
          number,
          { code: string }[],
        ][]
      ).filter(([, [script]]) => script?.code.includes('yapyapAssistantBarView')).length;
    f.window.isFocused.mockReturnValue(false);
    vi.advanceTimersByTime(1000);
    expect(barRenders()).toBe(0);
    f.window.isFocused.mockReturnValue(true);
    vi.advanceTimersByTime(1000);
    expect(barRenders()).toBe(1);
    f.runtime.assistantBarView?.show(false);
    vi.useRealTimers();
  });

  it('suggests replies on its own when a message arrives, while the setting allows', async () => {
    vi.useFakeTimers();
    const f = fakes();
    await startApp(f);
    f.window.isFocused.mockReturnValue(true);
    f.runtime.assistantBarView?.show(true);
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValue('aaaaaaaa:00000001');
    await vi.advanceTimersByTimeAsync(1500);
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValue('aaaaaaaa:00000002');
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.runtime.assistantBar.suggestOnArrival).toHaveBeenCalledOnce();
    f.window.isFocused.mockReturnValue(false);
    f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValue('aaaaaaaa:00000003');
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.runtime.assistantBar.suggestOnArrival).toHaveBeenCalledOnce();
    f.runtime.assistantBarView?.show(false);
    vi.useRealTimers();
  });

  it('shows notifications without an account name when there is one account', async () => {
    const f = fakes();
    await startApp(f);
    f.ipcListeners.get('whatsapp:notification-show')?.(
      { sender: f.web.contents, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } },
      { id: '1', title: 'Alice' },
    );
    expect(f.natives[0]?.options.title).toBe('Alice');
  });

  it('keeps hidden notification details from the system, as the privacy settings say', async () => {
    const f = fakes();
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      privacy: { ...settings.privacy, notificationSender: false, notificationText: false },
    });
    await startApp(f);
    f.ipcListeners.get('whatsapp:notification-show')?.(
      { sender: f.web.contents, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } },
      { id: '1', title: 'Alice', body: 'Hi' },
    );
    expect(f.natives[0]?.options).toEqual({
      title: 'WhatsApp',
      body: 'New message',
      silent: false,
    });
  });

  it('shows the chat’s picture from WhatsApp, or none when it is slow to come', async () => {
    vi.useFakeTimers();
    const f = fakes();
    await startApp(f);
    const from = { sender: f.web.contents, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } };
    const icon = `${WHATSAPP_ORIGIN}/media/avatar.png`;
    f.ipcListeners.get('whatsapp:notification-show')?.(from, { id: '1', title: 'Alice', icon });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.natives[0]?.options).toMatchObject({ icon: 'data:image/png;base64,avatar' });
    f.web.contents.session.fetch.mockReturnValueOnce(new Promise(() => undefined));
    const slow = `${WHATSAPP_ORIGIN}/media/slow.png`;
    f.ipcListeners.get('whatsapp:notification-show')?.(from, { id: '2', title: 'Bob', icon: slow });
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.natives[1]?.options).toEqual({ title: 'Bob', body: '', silent: false });
    vi.useRealTimers();
  });

  describe('with two accounts', () => {
    function twoAccounts(argv: readonly string[] = []) {
      const f = fakes({}, argv);
      const accounts: Accounts = {
        version: 1,
        accounts: [
          { id: ACCOUNT, name: 'Personal', color: 'green', enabled: true },
          { id: SECOND, name: 'Work', color: 'blue', enabled: true },
        ],
        active: SECOND,
      };
      return { ...f, accounts, newAccountId: () => THIRD };
    }
    it('loads both in the background, shows the active one and lists them', async () => {
      const f = twoAccounts(['/opt/YapYap/yapyap', 'https://wa.me/447700900123']);
      await startApp(f);
      const [personal, work] = f.hosts;
      expect(personal?.show).not.toHaveBeenCalled();
      expect(work?.show).toHaveBeenCalledOnce();
      expect(personal?.webContents.loadURL).toHaveBeenCalledWith(WHATSAPP_ORIGIN);
      expect(work?.webContents.loadURL).toHaveBeenCalledWith(
        `${WHATSAPP_ORIGIN}/send?phone=447700900123`,
      );
      expect(accountMenu(f).entries).toEqual([
        {
          id: ACCOUNT,
          name: 'Personal',
          color: 'green',
          enabled: true,
          muted: false,
          proxy: '',
          active: false,
        },
        {
          id: SECOND,
          name: 'Work',
          color: 'blue',
          enabled: true,
          muted: false,
          proxy: '',
          active: true,
        },
      ]);
      expect(accountMenu(f).activeContents()).toBe(work?.webContents);
    });

    it('lets the Accounts window read and forget each running account’s camera and microphone answers', async () => {
      const f = twoAccounts();
      await startApp(f);
      expect(accountMenu(f).permissions(ACCOUNT)).toEqual([]);
      expect(accountMenu(f).permissions('not-running')).toBeUndefined();
      accountMenu(f).forgetPermissions(ACCOUNT);
      accountMenu(f).forgetPermissions('not-running');
      expect(accountMenu(f).permissions(ACCOUNT)).toEqual([]);
    });

    it('titles the window after the active account and counts every account’s unread chats', async () => {
      const f = twoAccounts();
      await startApp(f);
      const [personal, work] = f.hosts;
      personal?.page.fire('page-title-updated', {}, '(2) WhatsApp');
      work?.page.fire('page-title-updated', {}, '(1) WhatsApp');
      expect(f.window.setTitle).toHaveBeenLastCalledWith('(1) WhatsApp');
      expect(f.badge.setBadgeCount).toHaveBeenLastCalledWith(3);
      accountMenu(f).switchTo(ACCOUNT);
      expect(f.window.setTitle).toHaveBeenLastCalledWith('(2) WhatsApp');
      expect(work?.hide).toHaveBeenCalledOnce();
      expect(f.saveAccounts).toHaveBeenCalledWith(expect.objectContaining({ active: ACCOUNT }));
    });

    it('switches accounts from the tray and shows the window', async () => {
      const f = twoAccounts();
      await startApp(f);
      clickTray(f, 'Personal');
      expect(f.hosts[0]?.show).toHaveBeenCalledOnce();
      expect(f.window.show).toHaveBeenCalled();
    });

    it('shows each account’s notifications under its name, and switches to it on a click', async () => {
      const f = twoAccounts();
      await startApp(f);
      const personal = f.hosts[0]?.webContents;
      const fromPersonal = { sender: personal, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } };
      f.ipcListeners.get('whatsapp:notification-show')?.(fromPersonal, {
        id: '1',
        title: 'Alice',
        body: 'Hi',
      });
      const native = f.natives[0];
      if (native === undefined || personal === undefined) {
        throw new Error('No notification was shown.');
      }
      expect(native.options).toEqual({ title: 'Personal: Alice', body: 'Hi', silent: false });
      const [, click] = native.on.mock.calls[0] as [string, () => void];
      click();
      expect(f.hosts[0]?.show).toHaveBeenCalledOnce();
      expect(personal.send).toHaveBeenCalledWith('whatsapp:notification-click', '1');
      f.ipcListeners.get('whatsapp:notification-close')?.(fromPersonal, '1');
      expect(native.close).toHaveBeenCalledOnce();
    });

    it('withdraws an account’s notifications once it has nothing unread', async () => {
      const f = twoAccounts();
      await startApp(f);
      const [personal, work] = f.hosts;
      const notify = (host: typeof personal, id: string): void => {
        f.ipcListeners.get('whatsapp:notification-show')?.(
          { sender: host?.webContents, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } },
          { id, title: 'Alice', body: 'Hi' },
        );
      };
      notify(personal, '1');
      notify(work, '2');
      const [alice, bob] = f.natives;
      personal?.page.fire('page-title-updated', {}, '(1) WhatsApp');
      expect(alice?.close).not.toHaveBeenCalled();
      personal?.page.fire('page-title-updated', {}, 'WhatsApp');
      expect(alice?.close).toHaveBeenCalledOnce();
      expect(bob?.close).not.toHaveBeenCalled();
    });

    it('puts a reply typed in a notification into the chat’s message box, unsent', async () => {
      const f = twoAccounts();
      await startApp(f);
      const personal = f.hosts[0]?.webContents;
      f.ipcListeners.get('whatsapp:notification-show')?.(
        { sender: personal, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } },
        { id: '1', title: 'Alice', body: 'Hi' },
      );
      const native = f.natives[0];
      if (native === undefined || personal === undefined) {
        throw new Error('No notification was shown.');
      }
      personal.executeJavaScriptInIsolatedWorld.mockResolvedValue(true);
      const [, reply] = native.on.mock.calls.find(([event]) => event === 'reply') as [
        string,
        (details: { reply: string }) => void,
      ];
      reply({ reply: 'On my way' });
      expect(f.hosts[0]?.show).toHaveBeenCalledOnce();
      expect(personal.send).toHaveBeenCalledWith('whatsapp:notification-click', '1');
      expect(personal.insertText).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      expect(personal.insertText).toHaveBeenCalledExactlyOnceWith('On my way');
    });

    it('withdraws a removed account’s notifications, and everyone’s when quitting', async () => {
      const f = twoAccounts();
      await startApp(f);
      const show = (index: number, id: string) => {
        f.ipcListeners.get('whatsapp:notification-show')?.(
          { sender: f.hosts[index]?.webContents, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } },
          { id, title: 'Alice' },
        );
      };
      show(0, '1');
      show(1, '2');
      void accountMenu(f).remove(ACCOUNT);
      expect(f.natives[0]?.close).toHaveBeenCalledOnce();
      expect(f.natives[1]?.close).not.toHaveBeenCalled();
      f.listeners.get('will-quit')?.();
      expect(f.natives[1]?.close).toHaveBeenCalledOnce();
    });

    const showFrom = (f: ReturnType<typeof twoAccounts>, index: number) => {
      f.ipcListeners.get('whatsapp:notification-show')?.(
        { sender: f.hosts[index]?.webContents, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } },
        { id: String(index), title: 'Alice' },
      );
    };
    const audioMuted = (f: ReturnType<typeof twoAccounts>) =>
      f.hosts.map((host) => host.page.contents.setAudioMuted.mock.calls.at(-1)?.[0] as boolean);

    const withMuted = (f: ReturnType<typeof twoAccounts>, index: number) => {
      f.accounts = {
        ...f.accounts,
        accounts: f.accounts.accounts.map((entry, at) =>
          at === index ? { ...entry, muted: true } : entry,
        ),
      };
    };
    const titled = (f: ReturnType<typeof twoAccounts>, index: number, title: string) => {
      f.hosts[index]?.page.fire('page-title-updated', {}, title);
    };

    it('shows the running accounts in the sidebar, with unread chats unless muted', async () => {
      const f = twoAccounts();
      withMuted(f, 1);
      await startApp(f);
      titled(f, 0, '(2) WhatsApp');
      titled(f, 1, '(5) WhatsApp');
      const last = sidebar(f);
      expect(last.state).toEqual({
        accounts: [
          {
            id: ACCOUNT,
            name: 'Personal',
            color: 'green',
            muted: false,
            unread: 2,
            active: false,
            sharing: false,
          },
          {
            id: SECOND,
            name: 'Work',
            color: 'blue',
            muted: true,
            unread: 0,
            active: true,
            sharing: false,
          },
        ],
        compact: false,
        doNotDisturb: false,
      });
      last.switchTo(ACCOUNT);
      expect(f.hosts[0]?.show).toHaveBeenCalledOnce();
    });

    it('shows an account’s profile photo in the sidebar once its page names one', async () => {
      const f = twoAccounts();
      await startApp(f);
      f.hosts[1]?.webContents.executeJavaScriptInIsolatedWorld.mockResolvedValue(
        `${WHATSAPP_ORIGIN}/avatar.png`,
      );
      titled(f, 1, '(1) WhatsApp');
      await vi.waitFor(() => {
        expect(sidebar(f).state.accounts.map((account) => account.avatar)).toEqual([
          undefined,
          'data:image/png;base64,avatar',
        ]);
      });
    });

    it('covers every account with the privacy screen from the tray, and the menu follows', async () => {
      const f = twoAccounts();
      await startApp(f);
      clickTray(f, 'Privacy Screen');
      for (const host of f.hosts) {
        expect(host.page.contents.insertCSS).toHaveBeenCalledWith(expect.stringContaining('blur('));
      }
      expect(trayItem(f, 'Privacy Screen')).toMatchObject({ checked: true });
      expect(accountMenu(f).privacyScreen).toBe(true);
    });

    it('shows a screen share in the tray and the sidebar, and stops it from either', async () => {
      const f = twoAccounts();
      await startApp(f);
      const [, workHost] = f.hosts;
      if (workHost === undefined) {
        throw new Error('Two accounts are expected.');
      }
      const work = workHost.webContents;
      const fromWork = { sender: work, senderFrame: { url: `${WHATSAPP_ORIGIN}/` } };
      const report = (channel: string) => f.ipcListeners.get(`whatsapp:share-${channel}`);
      const sidebarSharing = () => sidebar(f).state.accounts.map((entry) => entry.sharing);
      report('started')?.(fromWork, '1');
      const [stop] = trayMenu(f);
      expect(stop?.label).toBe('Stop Sharing Screen (Work)');
      expect(sidebarSharing()).toEqual([false, true]);
      stop?.click?.();
      expect(work.send).toHaveBeenCalledWith('whatsapp:share-stop', '1');
      report('ended')?.(fromWork, '1');
      expect(trayMenu(f)[0]?.label).toBe('Hide YapYap');
    });

    it('silences a muted account, and mutes its sound while it is out of sight', async () => {
      const f = twoAccounts();
      withMuted(f, 0);
      await startApp(f);
      showFrom(f, 0);
      showFrom(f, 1);
      expect(f.natives.map((native) => native.options.title)).toEqual(['Work: Alice']);
      expect(audioMuted(f)).toEqual([true, false]);
      accountMenu(f).switchTo(ACCOUNT);
      expect(audioMuted(f)).toEqual([false, false]);
      windowEvent(f, 'minimize');
      expect(audioMuted(f)).toEqual([true, false]);
      windowEvent(f, 'restore');
      expect(audioMuted(f)).toEqual([false, false]);
      // macOS still reports the window visible while its hide event runs.
      windowEvent(f, 'hide');
      expect(audioMuted(f)).toEqual([true, false]);
    });

    it('turns do not disturb on from the tray, silencing every account out of sight', async () => {
      const f = twoAccounts();
      let settings = defaultSettings();
      f.settings.current = () => settings;
      await startApp(f);
      clickTray(f, 'Do Not Disturb');
      const [change] = f.settings.update.mock.calls[0] as [(current: Settings) => Settings];
      settings = change(settings);
      for (const [listener] of f.settings.onChange.mock.calls as [(next: Settings) => void][]) {
        listener(settings);
      }
      expect(trayItem(f, 'Do Not Disturb')?.checked).toBe(true);
      expect(audioMuted(f)).toEqual([true, false]);
      showFrom(f, 0);
      showFrom(f, 1);
      expect(f.natives).toHaveLength(0);
    });

    it('sends chat links and focus to the active account', async () => {
      const f = twoAccounts();
      await startApp(f);
      const [[open]] = f.runtime.openChatsWith.mock.calls as [[(phone: string) => void]];
      open('447700900123');
      const work = f.hosts[1]?.webContents;
      expect(work?.loadURL).toHaveBeenLastCalledWith(`${WHATSAPP_ORIGIN}/send?phone=447700900123`);
      windowEvent(f, 'focus');
      expect(work?.focus).toHaveBeenCalledOnce();
    });

    it('reconnects every account when the system wakes', async () => {
      vi.useFakeTimers();
      const f = twoAccounts();
      const reconnects = [vi.fn(), vi.fn()];
      for (const reconnect of reconnects) {
        f.runtime.attachRecovery.mockReturnValueOnce({ reconnect });
      }
      f.isOnline.mockReturnValue(false);
      await startApp(f);
      const [[resume]] = f.onResume.mock.calls as [[() => void]];
      resume();
      vi.runOnlyPendingTimers();
      expect(reconnects[0]).toHaveBeenCalled();
      expect(reconnects[1]).toHaveBeenCalled();
    });

    it('sizes the chat list of the account on screen, and keeps each account’s own width', async () => {
      vi.useFakeTimers();
      const f = twoAccounts();
      f.chatListWidths.get.mockImplementation((id) => (id === ACCOUNT ? 320 : undefined));
      await startApp(f);
      const pageOf = (index: number) => {
        const host = f.hosts[index];
        if (host === undefined) {
          throw new Error('No such account.');
        }
        return host.webContents;
      };
      const [personal, work] = [pageOf(0), pageOf(1)];
      const sized = (width: string) => [
        1000,
        [{ code: expect.stringContaining(`globalThis, {"width":${width},`) as unknown }],
      ];
      expect(work.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(...sized('null'));
      accountMenu(f).switchTo(ACCOUNT);
      expect(personal.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(...sized('320'));
      personal.executeJavaScriptInIsolatedWorld.mockClear();
      f.window.isVisible.mockReturnValue(false);
      vi.advanceTimersByTime(1000);
      expect(personal.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalledWith(...sized('320'));
      f.window.isVisible.mockReturnValue(true);
      vi.advanceTimersByTime(1000);
      expect(personal.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(...sized('320'));
    });

    it('keeps a width for the account whose page sent it, and forgets a removed account’s', async () => {
      const f = twoAccounts();
      await startApp(f);
      const send = (channel: string, event: object, ...args: unknown[]): void => {
        f.ipcListeners.get(`whatsapp:chat-list-${channel}`)?.(event, ...args);
      };
      const fromWork = {
        sender: f.hosts[1]?.webContents,
        senderFrame: { url: `${WHATSAPP_ORIGIN}/` },
      };
      send('resize', fromWork, 400);
      expect(f.chatListWidths.set).toHaveBeenLastCalledWith(SECOND, 400);
      send('reset', fromWork);
      expect(f.chatListWidths.set).toHaveBeenLastCalledWith(SECOND, undefined);
      send('resize', { ...fromWork, sender: {} }, 400);
      expect(f.warn).toHaveBeenCalledWith('Ignored a message on whatsapp:chat-list-resize.');
      expect(f.chatListWidths.set).toHaveBeenCalledTimes(2);
      void accountMenu(f).remove(ACCOUNT);
      await vi.waitFor(() => {
        expect(f.chatListWidths.forget).toHaveBeenCalledExactlyOnceWith(ACCOUNT);
      });
    });

    it('adds an account in its own session and shows it', async () => {
      const f = twoAccounts();
      await startApp(f);
      accountMenu(f).add();
      expect(f.createAccountHost).toHaveBeenLastCalledWith(f.window, {
        partition: `persist:account-${THIRD}`,
        preload: '/out/preload/whatsapp.cjs',
        spellcheck: true,
      });
      expect(f.hosts[2]?.show).toHaveBeenCalledOnce();
      // The page loads once its session has the proxy setting.
      await vi.advanceTimersByTimeAsync(0);
      expect(f.hosts[2]?.webContents.loadURL).toHaveBeenCalledWith(WHATSAPP_ORIGIN);
    });

    it('removes an account: closes it and deletes its data, warning if that fails', async () => {
      const f = twoAccounts();
      await startApp(f);
      void accountMenu(f).remove(ACCOUNT);
      await vi.advanceTimersByTimeAsync(0);
      expect(f.hosts[0]?.close).toHaveBeenCalledOnce();
      expect(f.accountSession.clearStorageData).toHaveBeenCalledOnce();
      expect(f.accountSession.clearCache).toHaveBeenCalledOnce();
      f.accountSession.clearStorageData.mockRejectedValueOnce(new Error('busy'));
      accountMenu(f).add();
      void accountMenu(f).remove(SECOND);
      await vi.advanceTimersByTimeAsync(0);
      expect(f.warn).toHaveBeenCalledWith('Could not delete the data of a removed account.');
    });
  });

  it('keeps spell checking off, and fetches no dictionary, until the user turns it on', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.accountSession.setSpellCheckerLanguages).toHaveBeenLastCalledWith([]);
    expect(f.accountSession.setSpellCheckerEnabled).toHaveBeenLastCalledWith(false);
  });

  describe('the context menu', () => {
    const misspelled: ContextMenuParams = {
      x: 10,
      y: 20,
      isEditable: true,
      selectionText: '',
      misspelledWord: 'helo',
      dictionarySuggestions: ['hello'],
      editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
    };

    async function rightClick(f: ReturnType<typeof fakes>): Promise<ContextMenuItem[]> {
      await startApp(f);
      f.web.fire('context-menu', {}, misspelled);
      await vi.waitFor(() => {
        expect(f.contextMenu).toHaveBeenCalled();
      });
      const [items] = f.contextMenu.mock.lastCall as [ContextMenuItem[]];
      return items;
    }

    it('replaces a misspelling, learns a word, and leads to Settings to turn spelling on', async () => {
      const f = fakes();
      const items = await rightClick(f);
      items[0]?.click?.();
      expect(f.web.contents.replaceMisspelling).toHaveBeenCalledExactlyOnceWith('hello');
      items[1]?.click?.();
      expect(f.accountSession.addWordToSpellCheckerDictionary).toHaveBeenCalledExactlyOnceWith(
        'helo',
      );
      items.at(-1)?.click?.();
      expect(f.runtime.openSettings).toHaveBeenCalledOnce();
    });

    it('adds the running extensions’ items for where the user clicked, and runs the one picked', async () => {
      const f = fakes();
      f.runtime.extensionActions.mockReturnValue([
        {
          extension: 'org.example.hello',
          extensionName: 'Hello',
          command: 'fix',
          title: 'Fix',
          on: 'composer',
        },
      ]);
      f.web.contents.executeJavaScriptInIsolatedWorld.mockResolvedValue('composer');
      const items = await rightClick(f);
      expect(items.at(-1)?.label).toBe('Hello: Fix');
      items.at(-1)?.click?.();
      expect(f.runtime.runExtensionCommand).toHaveBeenCalledExactlyOnceWith(
        'org.example.hello',
        'fix',
      );
    });

    it('turns spell checking off at once, and opens the languages', async () => {
      const f = fakes();
      const on = { ...defaultSettings(), spelling: { enabled: true, languages: [] } };
      f.settings.current = () => on;
      const items = await rightClick(f);
      items.at(-2)?.click?.();
      const [change] = f.settings.update.mock.lastCall as [(settings: Settings) => Settings];
      expect(change(on).spelling).toEqual({ enabled: false, languages: [] });
      items.at(-1)?.click?.();
      expect(f.runtime.openSpellingLanguages).toHaveBeenCalledOnce();
    });
  });

  it('opens WhatsApp in the active account’s own session', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.createAccountHost).toHaveBeenCalledWith(f.window, {
      partition: `persist:account-${ACCOUNT}`,
      preload: '/out/preload/whatsapp.cjs',
      spellcheck: true,
    });
    expect(f.sessionOf).toHaveBeenCalledWith(`persist:account-${ACCOUNT}`);
  });

  it('stays hidden when started minimized', async () => {
    const f = fakes();
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      general: { ...settings.general, startMinimized: true },
    });
    await startApp(f);
    f.web.fire('dom-ready');
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.window.show).not.toHaveBeenCalled();
  });

  it('leaves the launch to the running YapYap when another one holds the lock', async () => {
    const f = fakes();
    f.app.requestSingleInstanceLock.mockReturnValueOnce(false);
    await startApp(f);
    expect(f.app.quit).toHaveBeenCalledOnce();
    expect(f.app.whenReady).not.toHaveBeenCalled();
    expect(f.createWindow).not.toHaveBeenCalled();
    expect(f.crashes.files.write).not.toHaveBeenCalled();
  });

  it('marks the session as running until a clean quit', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.stored.get('running.json')).toMatch(/^\{"version":"0\.1\.0","startedAt":\d+\}$/);
    f.listeners.get('will-quit')?.();
    expect(f.stored.has('running.json')).toBe(false);
    expect(f.crashes.review).not.toHaveBeenCalled();
  });

  it('offers to review a crash report after an unclean exit when asked to', async () => {
    const f = fakes();
    f.stored.set('running.json', '{"version":"0.0.9","startedAt":1000}');
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      privacy: { ...settings.privacy, crashReports: 'ask' },
    });
    await startApp(f);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.crashes.review).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/YapYap 0\.0\.9[\s\S]*YapYap 0\.1\.0 \(deb\)[\s\S]*last line$/),
    );
  });

  it('logs a crash review it could not offer', async () => {
    const f = fakes();
    f.stored.set('running.json', '{"version":"0.0.9","startedAt":1000}');
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      privacy: { ...settings.privacy, crashReports: 'ask' },
    });
    f.crashes.review.mockRejectedValueOnce(new Error('no display'));
    await startApp(f);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.warn).toHaveBeenCalledWith('Could not offer the crash report.');
  });

  it('opens a chat link it was launched with', async () => {
    const f = fakes({}, ['/opt/YapYap/yapyap', 'https://wa.me/351912345678']);
    await startApp(f);
    expect(f.web.contents.loadURL).toHaveBeenCalledExactlyOnceWith(
      `${WHATSAPP_ORIGIN}/send?phone=351912345678`,
    );
  });

  it('focuses the window and opens the chat link when YapYap is launched again', async () => {
    const f = fakes();
    await startApp(f);
    const secondInstance = f.listeners.get('second-instance') as unknown as (
      event: unknown,
      argv: readonly string[],
    ) => void;
    secondInstance({}, ['/opt/YapYap/yapyap', 'whatsapp://send?text=Hi']);
    expect(f.window.focus).toHaveBeenCalledOnce();
    expect(f.web.contents.loadURL).toHaveBeenLastCalledWith(`${WHATSAPP_ORIGIN}/send?text=Hi`);
  });

  it('installs from an extension link, whether it started YapYap or came with a later launch', async () => {
    const f = fakes({}, ['/opt/YapYap/yapyap', 'yapyap://extensions/install/org.example.hello']);
    await startApp(f);
    expect(f.runtime.installExtensionFromLink).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    const secondInstance = f.listeners.get('second-instance') as unknown as (
      event: unknown,
      argv: readonly string[],
    ) => void;
    secondInstance({}, ['/opt/YapYap/yapyap', 'yapyap://extensions/install/org.example.other']);
    expect(f.runtime.installExtensionFromLink).toHaveBeenLastCalledWith('org.example.other');
  });

  it('keeps a call recording in progress when YapYap quits', async () => {
    const f = fakes();
    await startApp(f);
    const beforeQuit = f.listeners.get('before-quit') as unknown as () => void;
    beforeQuit();
    expect(f.runtime.recorder.stop).toHaveBeenCalledOnce();
  });

  it('reopens the window where it was left and quits on termination signals', async () => {
    const f = fakes();
    const bounds = { x: 10, y: 20, width: 900, height: 600 };
    f.windowState.read.mockReturnValueOnce(
      JSON.stringify({ bounds, maximized: true, fullScreen: false }),
    );
    await startApp(f);
    expect(f.createWindow).toHaveBeenCalledWith(expect.objectContaining(bounds));
    expect(f.window.maximize).toHaveBeenCalledOnce();
    const [[, quitOnSignal]] = f.shutdown.onSignal.mock.calls as unknown as [[string, () => void]];
    quitOnSignal();
    expect(f.app.quit).toHaveBeenCalledOnce();
  });

  it('refuses to start without the sandbox, explaining why, and opens nothing', async () => {
    const f = { ...fakes(), sandboxDisabled: true };
    await startApp(f);
    expect(f.logError).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/cannot start safely/),
    );
    expect(f.explainUnsafeStart).toHaveBeenCalledOnce();
    expect(f.app.quit).toHaveBeenCalledOnce();
    expect(f.app.requestSingleInstanceLock).not.toHaveBeenCalled();
    expect(f.app.enableSandbox).not.toHaveBeenCalled();
    expect(f.createWindow).not.toHaveBeenCalled();
  });

  it('takes over WhatsApp downloads in the account’s session once ready', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.accountSession.on).toHaveBeenCalledWith('will-download', expect.any(Function));
    expect(f.session.on).not.toHaveBeenCalledWith('will-download', expect.any(Function));
    const [, willDownload] = f.accountSession.on.mock.calls.find(
      ([event]) => event === 'will-download',
    ) as unknown as [string, (event: unknown, item: object) => void];
    // The settings' download options apply: the default saves straight away.
    const item = {
      getFilename: () => 'a.pdf',
      getSavePath: () => '',
      setSavePath: vi.fn(),
      setSaveDialogOptions: vi.fn(),
      once: vi.fn(),
    };
    willDownload({}, item);
    expect(item.setSavePath).toHaveBeenCalledWith(expect.stringMatching(/a\.pdf$/));
  });

  it('gives back the keys of shortcuts that work from any app when YapYap quits', async () => {
    const f = fakes();
    await startApp(f);
    f.listeners.get('will-quit')?.(...([] as never[]));
    expect(f.globalShortcuts.unregisterAll).toHaveBeenCalled();
    expect(f.globalShortcuts.register).not.toHaveBeenCalled();
  });

  it('shows or hides the window with the keys the user gave it', async () => {
    const f = fakes();
    const base = defaultSettings();
    f.settings.current = () => ({
      ...base,
      shortcuts: { ...base.shortcuts, global: { toggleWindow: 'CmdOrCtrl+Alt+Y' } },
    });
    await startApp(f);
    const [keys, press] = f.globalShortcuts.register.mock.lastCall as unknown as [
      string,
      () => void,
    ];
    expect(keys).toBe('CmdOrCtrl+Alt+Y');
    f.window.isVisible.mockReturnValue(true);
    f.window.isFocused.mockReturnValue(true);
    press();
    expect(f.window.hide).toHaveBeenCalled();
  });

  it('follows the theme setting once ready', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.nativeTheme.themeSource).toBe('system');
    expect(f.settings.onChange).toHaveBeenCalled();
  });

  it('starts without hardware acceleration in safe mode and says so', async () => {
    const f = fakes({}, ['/opt/YapYap/yapyap', '--safe-mode']);
    await startApp(f);
    expect(f.app.disableHardwareAcceleration).toHaveBeenCalledOnce();
    expect(f.app.commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      'disable-accelerated-video-decode',
    );
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(
      'YapYap started in safe mode, without hardware acceleration.',
    );
  });

  it('tells the user when repeated GPU crashes turned acceleration off', async () => {
    const f = fakes();
    const now = Date.now();
    f.gpuCrashLog.read = () => JSON.stringify([now - 3, now - 2, now - 1]);
    await startApp(f);
    expect(f.app.disableHardwareAcceleration).toHaveBeenCalledOnce();
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(
      'Graphics kept crashing, so YapYap started without hardware acceleration this time.',
    );
  });

  it('keeps running when WhatsApp fails to load, leaving it to the recovery screen', async () => {
    const f = fakes();
    f.web.contents.loadURL.mockRejectedValueOnce(new Error('ERR_CONNECTION_REFUSED'));
    await expect(startApp(f)).resolves.toBeUndefined();
  });

  it('loads a loopback test origin when one is configured', async () => {
    const f = fakes({ YAPYAP_TEST_WHATSAPP_ORIGIN: 'http://127.0.0.1:4321' });
    await startApp(f);
    expect(f.web.contents.loadURL).toHaveBeenCalledWith('http://127.0.0.1:4321');
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('warns and loads the real origin when the test origin is not loopback', async () => {
    const f = fakes({ YAPYAP_TEST_WHATSAPP_ORIGIN: 'https://evil.example' });
    await startApp(f);
    expect(f.web.contents.loadURL).toHaveBeenCalledWith(WHATSAPP_ORIGIN);
    expect(f.warn).toHaveBeenCalledWith(expect.stringContaining('only loopback'));
  });
});
