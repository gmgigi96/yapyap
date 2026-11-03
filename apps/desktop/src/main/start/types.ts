import type { AccountAvatars, AvatarPage } from '../accounts/avatars.ts';
import type { ChromeFeature, ChromeRuntime, WhatsAppContents } from '../chrome/feature.ts';
import type { SidebarPort } from '../chrome/sidebar.ts';
import type { InPageChatList } from '../chat-list/chat-list-page.ts';
import type { ChatListWidths } from '../chat-list/widths.ts';
import type {
  CaptureChoice,
  DisplayCapturePort,
  MediaType,
  PermissionMemory,
} from '../permissions/session-guard.ts';
import type { ThemePort } from '../appearance/theme.ts';
import type { ZoomableContents } from '../appearance/zoom.ts';
import type { SettingsService } from '../settings/service.ts';
import type {
  ProxySwitches,
  ProxiedSession,
  ProxyController,
  WebRtcPage,
} from '../network/proxy.ts';
import type { ShareSender } from '../capture/shares.ts';
import type { CoverablePage } from '../privacy/privacy-screen.ts';
import type { AudioPage } from '../notifications/quiet.ts';
import type { ThrottledContents } from '../privacy/hidden-reads.ts';
import type { UpdateNoticeDependencies } from '../updates/update-notice.ts';
import type { SelfUpdateDependencies, Updater } from '../updates/self-update.ts';
import type { ProcessMemory, WatchedRenderer } from '../recovery/memory-watchdog.ts';
import type { CrashFiles, CrashReviewDependencies } from '../crash/crash-reports.ts';
import type { secureSession, GuardedContents, GuardedSession } from '../security/security.ts';
import type { ViewInfo } from '../security/views.ts';
import type { Overlay } from '../recovery/controller.ts';
import type { RendererOptions } from '../window/web-preferences.ts';
import type { AccountSignals } from '../accounts/account-signals.ts';
import type { Account, Accounts } from '../accounts/accounts.ts';
import type { AccountPage, RunningAccounts } from '../accounts/running.ts';
import type { WhatsAppIpc } from '../ipc/whatsapp.ts';
import type { AccountNotifier, NotifierDependencies } from '../notifications/notifier.ts';
import type { KeyContents, ReplyContents } from '../notifications/reply.ts';
import type { MainWindowOptions } from '../window/windows.ts';
import type { LinkWindow } from '../instances.ts';
import type { UnsafeStartDependencies } from '../security/sandbox-check.ts';
import type { DownloadDependencies, DownloadingSession } from '../downloads/downloads.ts';
import type { ShutdownSources } from '../shutdown.ts';
import type { ReadyPage } from '../window/show-when-ready.ts';
import type { FocusablePage, FocusableWindow } from '../window/focus-page.ts';
import type { BadgeDrawing } from '../badge/badge-image.ts';
import type { TrayDependencies, TrayPort } from '../tray/tray.ts';
import type { SchemeSource, TrayIconDependencies } from '../tray/tray-icon.ts';
import type { AutostartPort } from '../autostart/autostart.ts';
import type { ManagedWindow } from '../window/main-window.ts';
import type { Rect } from '../window/window-state.ts';
import type { GlobalShortcutPort } from '../shortcuts/global-shortcuts.ts';
import type { ContextMenuItem, MenuPage } from '../spelling/context-menu.ts';
import type { SpellingController, SpellingSession } from '../spelling/spelling.ts';
import type { AuthInfo, LoginCallback } from '../network/proxy-login.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import type { CodePage, CustomCodeController } from '../custom-code/custom-code.ts';
import type { TextFile } from '../atomic-write.ts';
import type { Environment } from '../environment.ts';

export interface AppPort {
  disableHardwareAcceleration(): void;
  readonly commandLine: ProxySwitches & { appendSwitch(name: string, value?: string): void };
  userAgentFallback: string;
  enableSandbox(): void;
  whenReady(): Promise<unknown>;
  setAppUserModelId(id: string): void;
  on(
    event: 'window-all-closed' | 'before-quit' | 'will-quit' | 'activate',
    listener: () => void,
  ): unknown;
  on(
    event: 'child-process-gone',
    listener: (
      event: unknown,
      details: { readonly type: string; readonly reason: string; readonly exitCode: number },
    ) => void,
  ): unknown;
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: GuardedContents) => void,
  ): unknown;
  on(
    event: 'login',
    listener: (
      event: { preventDefault(): void },
      contents: { readonly session: object } | null | undefined,
      details: unknown,
      info: AuthInfo,
      callback: LoginCallback,
    ) => void,
  ): unknown;
  on(
    event: 'session-created',
    listener: (session: GuardedSession & ProxiedSession) => void,
  ): unknown;
  on(
    event: 'second-instance',
    listener: (event: unknown, argv: readonly string[]) => void,
  ): unknown;
  on(
    event: 'open-url',
    listener: (event: { preventDefault(): void }, url: string) => void,
  ): unknown;
  requestSingleInstanceLock(): boolean;
  quit(): void;
}

/** An account's WhatsApp, in its own view and partition (ADR 0001). */
export type AccountContents = WhatsAppContents &
  ZoomableContents &
  WatchedRenderer &
  ThrottledContents &
  AudioPage &
  WebRtcPage &
  ReplyContents &
  KeyContents &
  CoverablePage &
  ReadyPage &
  FocusablePage &
  MenuPage &
  CodePage &
  AvatarPage & {
    replaceMisspelling(word: string): void;
    loadURL(url: string): Promise<unknown>;
    on(event: 'page-title-updated', listener: (event: unknown, title: string) => void): unknown;
    send(channel: string, ...args: unknown[]): void;
  };

/** An account's views in the main window, from `createAccountHost`. */
interface AccountHostPort extends AccountPage {
  readonly webContents: AccountContents;
  readonly createOverlay: (renderer: RendererOptions) => Overlay;
}

/** A session's own word list, which spelling suggestions leave alone. */
export interface DictionarySession extends SpellingSession {
  addWordToSpellCheckerDictionary(word: string): boolean;
}

/** What deleting a removed account's WhatsApp data needs. */
interface ClearableSession {
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
}

export interface WindowPort extends LinkWindow, Omit<ManagedWindow, 'on' | 'once'> {
  on: ManagedWindow['on'] &
    FocusableWindow['on'] &
    ((event: 'show', listener: () => void) => unknown) &
    ((event: 'hide', listener: () => void) => unknown) &
    ((event: 'minimize', listener: () => void) => unknown) &
    ((event: 'restore', listener: () => void) => unknown) &
    ((event: 'blur', listener: () => void) => unknown);
  isVisible(): boolean;
  /** Shows the active account's page title, as a browser would. */
  setTitle(title: string): void;
  isFocused(): boolean;
  /** The Windows taskbar overlay, an image from `badge.createImage`. */
  setOverlayIcon(overlay: object | null, description: string): void;
  once: ManagedWindow['once'];
  show(): void;
}

export interface StartDependencies<Window extends WindowPort> {
  readonly app: AppPort;
  readonly createWindow: (options: MainWindowOptions) => Window;
  /** The account sidebar, docked in the main window. */
  readonly createSidebar: (window: Window, renderer: RendererOptions) => SidebarPort;
  /** An account's views in the window, hidden until it is the active one. */
  readonly createAccountHost: (window: Window, renderer: RendererOptions) => AccountHostPort;
  /** Nothing loads in the default session, but it is guarded all the same. */
  readonly defaultSession: () => GuardedSession & ProxiedSession;
  /** The session behind a partition, such as an account's (ADR 0001). */
  readonly sessionOf: (
    partition: string,
  ) => GuardedSession & DownloadingSession & ClearableSession & DictionarySession & ProxiedSession;
  readonly accounts: Accounts;
  readonly saveAccounts: (accounts: Accounts) => void;
  readonly newAccountId: () => string;
  /** The preload of WhatsApp's views, which hands its notifications to YapYap (ADR 0011). */
  readonly whatsAppPreload: string;
  /** The user's own CSS and JavaScript, applied to every account's WhatsApp (#72). */
  readonly customCode: Pick<CustomCodeController, 'attach'>;
  readonly notifications: Pick<NotifierDependencies, 'create' | 'isSupported'>;
  readonly ipc: WhatsAppIpc<ShareSender>;
  /** Each account's chat list width, apart from settings and `accounts.json` (#79). */
  readonly chatListWidths: ChatListWidths;
  /** `process.versions.chrome`: the identity must match the bundled engine. */
  readonly chromeVersion: string;
  readonly platform: string;
  readonly askMedia: (view: ViewInfo, mediaTypes: readonly MediaType[]) => Promise<boolean>;
  /**
   * Builds screen capture around YapYap's own picker, which only exists once
   * chrome is ready. `wayland` says whether Chromium runs natively on Wayland.
   */
  readonly capture: (pickInApp: PickInApp, wayland: boolean) => DisplayCapturePort;
  readonly chrome: ChromeFeature;
  readonly env: Environment;
  /** The command line, for `--safe-mode`. */
  readonly argv: readonly string[];
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly isOnline: () => boolean;
  readonly onResume: (listener: () => void) => void;
  /** A profile photo as a small square PNG data URL, or undefined when it is no image (#87). */
  readonly avatarImage: (bytes: Uint8Array) => string | undefined;
  readonly gpuCrashLog: TextFile;
  readonly settings: SettingsService;
  readonly nativeTheme: ThemePort;
  readonly windowState: TextFile;
  /** The usable area of each connected display, once the app is ready. */
  readonly workAreas: () => readonly Rect[];
  readonly shutdown: ShutdownSources;
  /** Whether Chromium's sandbox was turned off on the command line or in the environment. */
  readonly sandboxDisabled: boolean;
  readonly explainUnsafeStart: UnsafeStartDependencies['explain'];
  readonly downloads: Pick<
    DownloadDependencies,
    'folder' | 'taken' | 'lastFolder' | 'openPath' | 'track'
  >;
  /** `app.getAppMetrics()`: memory per process, for the memory watchdog. */
  readonly appMetrics: () => readonly ProcessMemory[];
  /** Seconds since the last keyboard or mouse input. */
  readonly idleSeconds: () => number;
  /** Electron's `globalShortcut`, for the shortcuts that work from any app. */
  readonly globalShortcuts: GlobalShortcutPort;
  /** `app.getPreferredSystemLanguages()`, which picks the spelling language until the user does. */
  readonly systemLanguages: () => readonly string[];
  /** Shows a context menu where the pointer is. */
  readonly contextMenu: (items: ContextMenuItem[]) => void;
  /** Passwords and other secrets, encrypted by the system's keychain. */
  readonly secrets: Pick<SecretStore, 'canKeep' | 'get' | 'set'>;
  /** What tells the user about new releases, for builds that cannot update themselves. */
  readonly releases: Pick<
    UpdateNoticeDependencies,
    'policy' | 'currentVersion' | 'fetchJson' | 'showNotice'
  >;
  /** electron-updater and the restart prompt, for builds that update themselves. */
  readonly selfUpdate: {
    /** Creates electron-updater's updater; called only for builds that update themselves. */
    readonly updater: () => Promise<Updater>;
    readonly askToInstall: SelfUpdateDependencies['askToInstall'];
  };
  readonly badge: {
    readonly setBadgeCount: (count: number) => boolean;
    readonly createImage: (drawing: BadgeDrawing) => object;
  };
  /** Login items; the setting follows them at startup. */
  readonly autostart: AutostartPort;
  readonly tray: {
    /** Creates the tray icon; the caller keeps it alive. */
    readonly create: () => TrayPort;
    readonly buildMenu: TrayDependencies['buildMenu'];
    readonly image: TrayIconDependencies['image'];
    readonly scheme: SchemeSource;
  };
  readonly notify: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly logError: (message: string) => void;
  readonly crashes: {
    readonly files: CrashFiles;
    readonly version: string;
    /** The previous session's log lines, already redacted. */
    readonly previousLog: () => readonly string[];
    readonly review: CrashReviewDependencies['review'];
    readonly writeClipboard: (text: string) => Promise<unknown>;
  };
}

export type PickInApp = (contents: object) => Promise<CaptureChoice | undefined>;

/** What every session's guards share: the view registry, capture and the identity. */
export type SessionSecurity = Parameters<typeof secureSession>[1];

/** An open account's views, and how to bring its WhatsApp back after an outage. */
export interface OpenedAccount extends AccountPage {
  readonly contents: AccountContents;
  readonly reconnect: () => void;
  /** Camera and microphone answers for this account, kept until YapYap quits (#77). */
  readonly permissions: PermissionMemory;
  /** Settles once its first load ends, however it ends. */
  readonly loaded: Promise<void>;
}

export interface AccountWiring<Window extends WindowPort> {
  readonly deps: StartDependencies<Window>;
  readonly chrome: ChromeRuntime;
  readonly security: SessionSecurity;
  readonly window: Window;
  readonly signals: AccountSignals;
  /** Each account's profile photo, for the sidebar (#87). */
  readonly avatars: AccountAvatars;
  readonly origin: string;
  /** The accounts once they run; read on use, after they all opened. */
  readonly running: () => RunningAccounts<OpenedAccount>;
  /** Where an account first loads: a chat link from the command line, once, or WhatsApp. */
  readonly firstUrl: (account: Account) => string;
  readonly notifiers: Notifiers;
  readonly spelling: SpellingController;
  readonly proxy: ProxyController;
  /** Sizes the chat list of the account on screen (#79). */
  readonly chatList: Pick<InPageChatList, 'refresh'>;
}

/** The wiring while the accounts open, before what they build exists. */
export type OpeningWiring<Window extends WindowPort> = Omit<
  AccountWiring<Window>,
  'signals' | 'running' | 'avatars'
>;

/** Each account's notifier, found by its page, and all of them for quitting. */
export interface Notifiers {
  readonly byPage: WeakMap<object, AccountNotifier>;
  readonly all: Set<AccountNotifier>;
}
