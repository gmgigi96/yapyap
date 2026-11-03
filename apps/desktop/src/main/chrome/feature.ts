import type { MenuItemConstructorOptions } from 'electron';
import { describePageState } from '../../adapter/page-state.ts';
import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import {
  buildAboutInfo,
  formatDiagnostics,
  formatTechnicalDetails,
  summarizeGpu,
  type RuntimeFacts,
} from '../about/about-info.ts';
import { readPageState } from '../about/page-state.ts';
import type { AdapterPage } from '../../adapter/world.ts';
import type { ReadChat } from '../../adapter/active-chat.ts';
import type { UnreadSummaryChat } from '../../adapter/unread-summary.ts';
import { newChatHandlers, type ChatTarget } from '../navigation/new-chat-handlers.ts';
import { folderChoiceHandlers } from '../settings/folder-choice.ts';
import { shortcutHandlers } from '../shortcuts/shortcuts-handlers.ts';
import { CUSTOM_CODE_PAGE, customCodeHandlers } from '../custom-code/custom-code-handlers.ts';
import type { CustomCodeController } from '../custom-code/custom-code.ts';
import { spellingHandlers, type SpellingSources } from '../spelling/spelling-languages-handlers.ts';
import { DOWNLOADS_PAGE, downloadsHandlers } from '../downloads/downloads-handlers.ts';
import type { DownloadList } from '../downloads/download-list.ts';
import {
  createProxyLoginPrompt,
  PROXY_LOGIN_PAGE,
  type ProxyLoginPrompt,
} from '../network/proxy-login-handlers.ts';
import {
  decideUpdatePolicy,
  describeUpdatePolicy,
  type InstallEvidence,
} from '../updates/update-policy.ts';
import {
  createSourcePicker,
  type DesktopSource,
  type SourceKind,
  type SourcePicker,
} from '../capture/picker.ts';
import { changeZoom } from '../appearance/zoom.ts';
import { buildMenuTemplate, type MenuActions } from '../menu.ts';
import { pause } from '../pause.ts';
import { accountsHandlers, type AccountManager } from '../accounts/accounts-handlers.ts';
import { problemReportHandlers } from '../crash/problem-report-handlers.ts';
import {
  attachSidebar,
  sidebarHandlers,
  type SidebarPort,
  type SidebarSlot,
  type SidebarSource,
} from '../accounts/sidebar-handlers.ts';
import {
  createRecovery,
  type Overlay,
  type RecoverableContents,
  type Recovery,
} from '../recovery/controller.ts';
import { guardCrashes, type CrashableContents } from '../recovery/crash-guard.ts';
import { monitorPage, type MonitoredContents } from '../recovery/monitor.ts';
import { isAccountColor } from '../accounts/accounts.ts';
import {
  createAssistantChrome,
  type AssistantChrome,
  type AssistantSources,
} from '../assistant/assistant-chrome.ts';
import { serveEngineFiles } from '../assistant/private/engine-files.ts';
import { agentServer, type AgentSources } from '../agents/server.ts';
import { agentsHandlers } from '../agents/settings-handlers.ts';
import type { AgentAccounts, AgentPage } from '../agents/tool-steps.ts';
import { engineWindowOpener } from '../assistant/private/engine-window.ts';
import { setDoNotDisturb } from '../notifications/quiet.ts';
import { settingsHandlers, type SettingEffect } from '../settings/handlers.ts';
import type { SettingsService } from '../settings/service.ts';
import type { Settings } from '../settings/schema.ts';
import { settingsTransferHandlers, type SettingsFiles } from '../settings/transfer-handlers.ts';
import type { ViewRegistry } from '../security/views.ts';
import type { RendererOptions } from '../window/web-preferences.ts';
import type { WindowOptions } from '../window/windows.ts';
import { CHROME_SCHEME, createChromeHandler } from './assets.ts';
import { noArguments } from '../ipc/arguments.ts';
import {
  registerChromeHandlers,
  type ChromeCall,
  type ChromeHandler,
  type IpcMainPort,
} from '../ipc/chrome.ts';
import {
  chromeWindowOpener,
  openPromptWindow,
  type ChromePage,
  type ChromeWindowDependencies,
  type ChromeWindowPort,
} from './window-opener.ts';
import { en } from '../../shared/messages/en.ts';

/** In memory only: app chrome never shares storage with WhatsApp or keeps any. */
export const CHROME_PARTITION = 'yapyap-chrome';

const ABOUT_PAGE: ChromePage = {
  path: 'about.html',
  window: {
    title: en.windows.about,
    width: 480,
    height: 640,
    resizable: false,
    minimizable: false,
    maximizable: false,
  },
};

const PICKER_PAGE: ChromePage = {
  path: 'picker.html',
  window: {
    title: en.windows.picker,
    width: 760,
    height: 580,
    minWidth: 480,
    minHeight: 400,
    minimizable: false,
    modal: true,
  },
};

const NEW_CHAT_PAGE: ChromePage = {
  path: 'new-chat.html',
  window: {
    title: en.windows.newChat,
    width: 440,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
  },
};

const SHORTCUTS_PAGE: ChromePage = {
  path: 'shortcuts.html',
  window: {
    title: en.windows.shortcuts,
    width: 520,
    height: 640,
    minWidth: 400,
    minHeight: 360,
    minimizable: false,
  },
};

const SPELLING_LANGUAGES_PAGE: ChromePage = {
  path: 'spelling-languages.html',
  window: {
    title: en.windows.spellingLanguages,
    width: 460,
    height: 560,
    minWidth: 360,
    minHeight: 360,
    minimizable: false,
    maximizable: false,
  },
};

const ACCOUNTS_PAGE: ChromePage = {
  path: 'accounts.html',
  window: {
    title: en.windows.accounts,
    width: 560,
    height: 520,
    minWidth: 440,
    minHeight: 360,
    minimizable: false,
    maximizable: false,
  },
};

const WELCOME_PAGE: ChromePage = {
  path: 'welcome.html',
  window: {
    title: en.windows.welcome,
    width: 560,
    height: 640,
    minWidth: 420,
    minHeight: 420,
    minimizable: false,
    maximizable: false,
  },
};

const REPORT_PAGE: ChromePage = {
  path: 'report.html',
  window: {
    title: en.windows.report,
    width: 600,
    height: 640,
    minWidth: 440,
    minHeight: 420,
    minimizable: false,
  },
};

const SETTINGS_PAGE: ChromePage = {
  path: 'settings.html',
  window: {
    title: en.windows.settings,
    width: 640,
    height: 680,
    minWidth: 420,
    minHeight: 360,
  },
};

interface PrivilegedScheme {
  readonly scheme: string;
  readonly privileges: {
    readonly standard: boolean;
    readonly secure: boolean;
    readonly supportFetchAPI?: boolean;
  };
}

export interface ChromeFeatureDependencies {
  readonly registerSchemesAsPrivileged: (schemes: readonly PrivilegedScheme[]) => void;
  readonly chromeProtocol: () => {
    handle(scheme: string, handler: (request: { readonly url: string }) => Promise<Response>): void;
  };
  readonly ipc: IpcMainPort;
  readonly createWindow: (options: WindowOptions, renderer: RendererOptions) => ChromeWindowPort;
  readonly setMenu: (template: MenuItemConstructorOptions[]) => void;
  readonly writeClipboard: (text: string) => Promise<unknown>;
  /** Records a performance trace, if the user agrees, and saves it (#113). */
  readonly recordTrace: () => void;
  /** Opens a web page in the user's browser, such as GitHub's bug form. */
  readonly openExternal: (url: string) => Promise<unknown>;
  /** A system notification, for things the user should know but need not act on. */
  readonly notify: (message: string) => void;
  /** `app.getGPUFeatureStatus()`, summarized for diagnostics. */
  readonly gpuStatus: () => Readonly<Record<string, string>>;
  /** What YapYap observes about how it was installed, for the update policy. */
  readonly installEvidence: () => InstallEvidence;
  /** The recent, already redacted log lines. */
  readonly recentLog: () => readonly string[];
  /** Everything but the graphics mode, which is only settled at startup. */
  readonly facts: () => Omit<RuntimeFacts, 'graphics'>;
  readonly platform: string;
  readonly rendererRoot: string;
  readonly preloadPath: string;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly settings: SettingsService;
  /** Carries changes of these fields out in the system before saving them. */
  readonly settingEffects: Readonly<Record<string, SettingEffect>>;
  /** Settings this build ignores, so the settings window leaves them out. */
  readonly hiddenSettings: readonly string[];
  readonly settingsFiles: SettingsFiles;
  /** The system's folder dialog over the given window; undefined when cancelled. */
  readonly chooseFolder: (owner: object) => Promise<string | undefined>;
  /** `globalShortcut.isRegistered`: whether the system granted YapYap these keys. */
  readonly isGlobalShortcutRegistered: (accelerator: string) => boolean;
  readonly spelling: SpellingSources;
  /** The user's own CSS and JavaScript (#72). */
  readonly customCode: CustomCodeController;
  /** This session's downloads, for the Downloads window. */
  readonly downloads: DownloadList;
  /** Quits and starts YapYap again, to apply settings that need a restart. */
  readonly restart: () => void;
  /** Asks before logging the account out; true when the user agrees. */
  readonly confirmReset: () => Promise<boolean>;
  /** Asks before removing the account named `name`; true when the user agrees. */
  readonly confirmRemoveAccount: (name: string) => Promise<boolean>;
  /** The AI assistant, part of YapYap (ADR 0017). */
  readonly assistant: AssistantSources & {
    /** The engine page's preload. */
    readonly enginePreload: string;
    /** The engine's own session's protocol, where `app://engine` is served. */
    readonly engineProtocol: () => {
      handle(
        scheme: string,
        handler: (request: {
          readonly url: string;
          readonly headers: Headers;
        }) => Promise<Response>,
      ): void;
    };
  };
  /** The MCP server for AI agents (ADR 0019). */
  readonly agents: AgentSources;
  readonly captureSources: (kind: SourceKind) => Promise<readonly DesktopSource[]>;
  /** The window showing `contents`, so the picker can sit on top of it. */
  readonly windowOf: (contents: object) => WindowOptions['parent'] | null;
}

export type WhatsAppContents = MonitoredContents & RecoverableContents & CrashableContents;

export interface ChromeRuntime {
  /** Watches a WhatsApp view and shows the recovery screen over it when it fails. */
  readonly attachRecovery: (
    contents: WhatsAppContents,
    origin: string,
    createOverlay: (renderer: RendererOptions) => Overlay,
  ) => Pick<Recovery, 'reconnect'>;
  /** YapYap's screen-sharing picker, for platforms without a system one. */
  readonly pickCaptureSource: SourcePicker['pick'];
  /** The About window's technical details, for crash reports. */
  readonly technicalDetails: () => string;
  /** Where the New Chat window opens chats: WhatsApp's window, once it exists. */
  readonly openChatsWith: (open: (phone: string) => void) => void;
  /** Lists the accounts in the Account menu, whose actions apply to the active one. */
  readonly setAccountMenu: (menu: AccountMenu) => void;
  readonly openSettings: () => void;
  /** The first launch's welcome (#84). */
  readonly openWelcome: () => void;
  readonly openSpellingLanguages: () => void;
  /** Asks the user to sign in to a proxy, one proxy at a time (#76). */
  readonly askProxyLogin: ProxyLoginPrompt['ask'];
  /** Docks the account sidebar; returns how to show it the accounts. */
  readonly attachSidebar: (
    create: (renderer: RendererOptions) => SidebarPort,
  ) => (source: SidebarSource) => void;
  /** Gives the assistant bar its view in the active account's WhatsApp (ADR 0013). */
  readonly attachAssistantBar: AssistantChrome['attachBar'];
}

/** The accounts as the menu and the Accounts window need them. */
export interface AccountMenu extends AccountManager {
  /** The active account's WhatsApp, which Clear Cache and Reset Session act on. */
  readonly activeContents: () => object;
  /** Puts the assistant's draft in the active account's open chat; false when none is open. */
  readonly insertDraft: (text: string) => Promise<boolean>;
  /** The active account's open chat, with its last `messages` messages; null when none is open. */
  readonly readActiveChat: (messages: number) => Promise<ReadChat | null>;
  /** The active account's unread chats, from its chat list. */
  readonly readUnreadSummary: () => Promise<readonly UnreadSummaryChat[]>;
  /** Replaces the active account's draft; false when no chat is open. */
  readonly replaceDraft: (text: string) => Promise<boolean>;
  /** The active account's draft; null when no chat is open. */
  readonly readDraft: () => Promise<string | null>;
  /** Presses Enter in the active account's message box, for the assistant bar's Send (ADR 0013). */
  readonly pressEnter: () => Promise<boolean>;
  /** An account's WhatsApp as AI agents reach it (ADR 0019); undefined while it is off. */
  readonly agentPage: (id: string) => AgentPage | undefined;
  readonly switchTo: (id: string) => void;
  readonly add: () => void;
  readonly privacyScreen: boolean;
  readonly togglePrivacyScreen: () => void;
}

/** Until the accounts are open, their menu items do nothing. */
const ignore = (): void => undefined;

/** The accounts once they are open; replaced whenever they change. */
interface AccountsSlot {
  current?: AccountMenu;
}

export interface ChromeFeature {
  /** Must run before the app is ready, when custom schemes can still be registered. */
  readonly beforeReady: () => void;
  /** `graphics` describes the rendering mode startup settled on, for diagnostics. */
  readonly afterReady: (
    views: ViewRegistry,
    warn: (message: string) => void,
    graphics: string,
  ) => ChromeRuntime;
}

/** The dependencies, with the facts completed by the graphics mode startup settled on. */
type ChromeDependencies = Omit<ChromeFeatureDependencies, 'facts'> & {
  readonly facts: () => RuntimeFacts;
};

function aboutHandlers(deps: ChromeDependencies): ChromeHandler[] {
  const info = () => buildAboutInfo(deps.facts());
  return [
    { channel: CHROME_CHANNELS.aboutInfo, accepts: noArguments, handle: info },
    {
      channel: CHROME_CHANNELS.copyTechnicalDetails,
      accepts: noArguments,
      handle: () => deps.writeClipboard(formatTechnicalDetails(info())),
    },
  ];
}

function recoveryHandlers(recoveries: ReadonlyMap<object, Recovery>): ChromeHandler[] {
  const of = ({ sender }: ChromeCall): Recovery => {
    const recovery = [...recoveries.values()].find((candidate) => candidate.owns(sender));
    if (recovery === undefined) {
      throw new Error('No recovery screen belongs to this window.');
    }
    return recovery;
  };
  const operation = (channel: string, run: (recovery: Recovery) => unknown): ChromeHandler => ({
    channel,
    accepts: noArguments,
    handle: (call) => run(of(call)),
  });
  return [
    operation(CHROME_CHANNELS.recoveryProblem, (recovery) => recovery.problem()),
    operation(CHROME_CHANNELS.recoveryRetry, (recovery) => recovery.retry()),
    operation(CHROME_CHANNELS.recoveryClearCache, (recovery) => recovery.clearCacheAndRetry()),
    operation(CHROME_CHANNELS.recoveryCopyDiagnostics, (recovery) => recovery.copyDiagnostics()),
  ];
}

function recoveryAttacher(
  deps: ChromeDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
  recoveries: Map<object, Recovery>,
  pages: AdapterPage[],
): ChromeRuntime['attachRecovery'] {
  const technicalDetails = () => diagnostics(deps);
  return (contents, origin, createOverlay) => {
    pages.push(contents);
    const recovery = createRecovery({
      contents,
      origin,
      views,
      technicalDetails,
      warn,
      createOverlay: () => createOverlay(renderer),
      writeClipboard: deps.writeClipboard,
    });
    recoveries.set(contents, recovery);
    monitorPage(contents, { onFailure: recovery.show, schedule: setTimeout, warn });
    guardCrashes(contents, {
      now: Date.now,
      schedule: setTimeout,
      notify: deps.notify,
      showFailure: recovery.show,
      warn,
    });
    return recovery;
  };
}

function sourcePicker(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
): SourcePicker {
  return createSourcePicker({
    getSources: deps.captureSources,
    offerAudio: deps.platform === 'win32',
    wait: pause,
    openPicker: (owner) => {
      const parent = deps.windowOf(owner);
      return openPromptWindow(windows, PICKER_PAGE, parent == null ? {} : { parent });
    },
  });
}

/** Acts on the account on screen. */
function accountActions(
  deps: ChromeFeatureDependencies,
  recoveries: ReadonlyMap<object, Recovery>,
  menu: AccountMenu | undefined,
  warn: (message: string) => void,
): Pick<MenuActions, 'clearCache' | 'resetSession' | 'removeAccount'> {
  const failed = (): void => {
    warn('Could not finish an account maintenance action.');
  };
  const active = (): Recovery | undefined =>
    menu === undefined ? undefined : recoveries.get(menu.activeContents());
  return {
    clearCache: () => {
      active()?.clearCacheAndRetry().catch(failed);
    },
    resetSession: () => {
      deps
        .confirmReset()
        .then((confirmed) => (confirmed ? active()?.resetSession() : undefined))
        .catch(failed);
    },
    removeAccount: () => {
      const entry = menu?.entries.find((candidate) => candidate.active);
      if (menu === undefined || entry === undefined) {
        return;
      }
      deps
        .confirmRemoveAccount(entry.name)
        .then((confirmed) => (confirmed ? menu.remove(entry.id) : false))
        .catch(failed);
    },
  };
}

/** Do not disturb, kept in the settings, and muting the account on screen. */
function quietActions(
  settings: SettingsService,
  menu: AccountMenu | undefined,
): Pick<MenuActions, 'doNotDisturb' | 'setDoNotDisturb' | 'setMuted'> {
  return {
    doNotDisturb: settings.current().general.doNotDisturb,
    setDoNotDisturb: (on) => {
      setDoNotDisturb(settings, on);
    },
    setMuted: (muted) => {
      const entry = menu?.entries.find((candidate) => candidate.active);
      if (menu !== undefined && entry !== undefined && isAccountColor(entry.color)) {
        const { name, color, enabled, proxy } = entry;
        menu.update(entry.id, { name, color, enabled, muted, proxy });
      }
    },
  };
}

function diagnostics(deps: ChromeDependencies, page?: string): string {
  const info = buildAboutInfo(deps.facts());
  const updates = decideUpdatePolicy(info.channel, deps.installEvidence());
  const runtime = [`GPU ${summarizeGpu(deps.gpuStatus())}`, describeUpdatePolicy(updates)];
  return formatDiagnostics(
    info,
    page === undefined ? runtime : [...runtime, page],
    deps.recentLog(),
  );
}

/** The first WhatsApp view is the one diagnostics describe until accounts arrive. */
async function currentDiagnostics(
  deps: ChromeDependencies,
  pages: readonly AdapterPage[],
): Promise<string> {
  const page = pages[0];
  const state = page === undefined ? undefined : await readPageState(page);
  return diagnostics(deps, describePageState(state));
}

/** Report a Problem's operations, describing the WhatsApp views open now. */
function reportHandlers(deps: ChromeDependencies, pages: readonly AdapterPage[]): ChromeHandler[] {
  return problemReportHandlers({
    diagnostics: () => currentDiagnostics(deps, pages),
    writeClipboard: deps.writeClipboard,
    openExternal: deps.openExternal,
  });
}

function chromeWindows(
  deps: ChromeFeatureDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
): ChromeWindowDependencies {
  return { createWindow: (options) => deps.createWindow(options, renderer), views, warn };
}

/** YapYap's own windows, one each: opening one again focuses it. */
type ChromeOpeners = Pick<
  MenuActions,
  | 'openAccounts'
  | 'openAbout'
  | 'openSettings'
  | 'openNewChat'
  | 'openShortcuts'
  | 'openCustomCode'
  | 'openDownloads'
  | 'openReport'
>;

function chromeOpeners(
  windows: ChromeWindowDependencies,
  { openSettings }: { openSettings: () => void },
): ChromeOpeners {
  const opener = (page: ChromePage) => chromeWindowOpener(windows, page);
  return {
    openSettings,
    openAccounts: opener(ACCOUNTS_PAGE),
    openAbout: opener(ABOUT_PAGE),
    openNewChat: opener(NEW_CHAT_PAGE),
    openShortcuts: opener(SHORTCUTS_PAGE),
    openCustomCode: opener(CUSTOM_CODE_PAGE),
    openDownloads: opener(DOWNLOADS_PAGE),
    openReport: opener(REPORT_PAGE),
  };
}

/** The accounts and the privacy screen, which do nothing until the accounts are open. */
function menuAccounts(
  menu: AccountMenu | undefined,
): Pick<
  MenuActions,
  'accounts' | 'switchAccount' | 'addAccount' | 'privacyScreen' | 'togglePrivacyScreen'
> {
  if (menu === undefined) {
    return {
      accounts: [],
      switchAccount: ignore,
      addAccount: ignore,
      privacyScreen: false,
      togglePrivacyScreen: ignore,
    };
  }
  return {
    accounts: menu.entries,
    switchAccount: menu.switchTo,
    addAccount: menu.add,
    privacyScreen: menu.privacyScreen,
    togglePrivacyScreen: menu.togglePrivacyScreen,
  };
}

type MenuAssistant = Pick<AssistantChrome, 'actions' | 'refreshBar'>;

/** The menu's actions for the accounts as they are. */
function menuActionsOf(
  deps: ChromeDependencies,
  slots: Pick<ChromeSlots, 'recoveries' | 'pages'>,
  openers: ChromeOpeners,
  assistant: MenuAssistant,
  warn: (message: string) => void,
): (menu: AccountMenu | undefined) => MenuActions {
  const copyDiagnostics = diagnosticsCopier(deps, slots.pages, warn);
  const act = (run: () => Promise<void>) => () => {
    run().catch(() => {
      warn('An assistant action failed.');
    });
  };
  return (menu) => ({
    ...menuAccounts(menu),
    ...openers,
    ...accountActions(deps, slots.recoveries, menu, warn),
    ...quietActions(deps.settings, menu),
    zoom: (step) => {
      changeZoom(deps.settings, step);
    },
    copyDiagnostics,
    recordTrace: deps.recordTrace,
    assistant: {
      suggest: act(assistant.actions.suggest),
      summarize: act(assistant.actions.summarize),
      catchUp: act(assistant.actions.catchUp),
    },
  });
}

/** Calls `rebuild` when the user changes an in-app shortcut, whose keys the menu shows. */
function onShortcutChange(settings: SettingsService, rebuild: () => void): void {
  const keysOf = ({ shortcuts }: Settings): string => JSON.stringify(shortcuts.custom);
  let keys = keysOf(settings.current());
  settings.onChange((current) => {
    const changed = keysOf(current);
    if (changed !== keys) {
      keys = changed;
      rebuild();
    }
  });
}

/**
 * Sets the application menu now, without accounts, and again whenever the
 * accounts or a shortcut change; returns how to give it the accounts.
 */
function accountMenuSetter(
  deps: ChromeDependencies,
  slots: Pick<ChromeSlots, 'recoveries' | 'pages' | 'accounts'>,
  openers: ChromeOpeners,
  assistant: MenuAssistant,
  warn: (message: string) => void,
): (menu: AccountMenu) => void {
  const actions = menuActionsOf(deps, slots, openers, assistant, warn);
  const set = (menu: AccountMenu | undefined): void => {
    deps.setMenu(
      buildMenuTemplate(deps.platform, actions(menu), deps.settings.current().shortcuts.custom),
    );
  };
  const rebuild = (): void => {
    set(slots.accounts.current);
  };
  set(undefined);
  onShortcutChange(deps.settings, rebuild);
  return (menu) => {
    slots.accounts.current = menu;
    set(menu);
    // Each account has its own allowed chats and its own open chat.
    assistant.refreshBar();
  };
}

/** YapYap's own pages, served from the chrome scheme. */
function serveChromePages(deps: ChromeFeatureDependencies): void {
  const handler = createChromeHandler(deps.rendererRoot, deps.readFile);
  deps.chromeProtocol().handle(CHROME_SCHEME, handler);
}

function allHandlers(
  deps: ChromeDependencies,
  { recoveries, pages, picker, chats, accounts, sidebar }: ChromeSlots,
): ChromeHandler[] {
  return [
    ...aboutHandlers(deps),
    ...recoveryHandlers(recoveries),
    ...reportHandlers(deps, pages),
    ...settingsHandlers(
      deps.settings,
      deps.restart,
      deps.platform,
      deps.settingEffects,
      deps.hiddenSettings,
    ),
    ...settingsTransferHandlers(deps.settings, deps.settingsFiles),
    ...folderChoiceHandlers(deps.settings, deps.chooseFolder),
    ...newChatHandlers(chats),
    ...spellingHandlers(deps.settings, deps.spelling),
    ...downloadsHandlers(deps.downloads),
    ...accountsHandlers(() => accounts.current, deps.confirmRemoveAccount),
    ...customCodeHandlers(deps.customCode, () => accounts.current?.entries ?? []),
    ...sidebarHandlers(sidebar, deps.settings),
    ...picker.handlers,
  ];
}

/** Copies the diagnostics, telling the log when it cannot. */
function diagnosticsCopier(
  deps: ChromeDependencies,
  pages: readonly AdapterPage[],
  warn: (message: string) => void,
): () => void {
  return () => {
    currentDiagnostics(deps, pages)
      .then((text) => deps.writeClipboard(text))
      .then(
        () => {
          deps.notify(en.recovery.diagnosticsCopied);
        },
        () => {
          warn('Could not copy the diagnostics.');
          deps.notify(en.recovery.diagnosticsNotCopied);
        },
      );
  };
}

/** What YapYap's pages share with the main process: the pages it watches and what they act on. */
interface ChromeSlots {
  readonly recoveries: Map<object, Recovery>;
  readonly pages: AdapterPage[];
  readonly picker: SourcePicker;
  readonly chats: ChatTarget;
  readonly accounts: AccountsSlot;
  readonly sidebar: SidebarSlot;
}

function chromeSlots(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
): ChromeSlots {
  return {
    recoveries: new Map(),
    pages: [],
    picker: sourcePicker(deps, windows),
    chats: {},
    accounts: {},
    sidebar: {},
  };
}

/**
 * The AI assistant (ADR 0017), and `app://engine` on the engine's own
 * session, which serves its page and the downloaded model.
 */
function assistantOf(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
  accounts: AccountsSlot,
  openSettings: () => void,
): AssistantChrome {
  const { assistant } = deps;
  const chrome = createAssistantChrome({
    openSettings,
    sources: assistant,
    settings: deps.settings,
    openEngine: engineWindowOpener({
      createWindow: deps.createWindow,
      views: windows.views,
      preload: assistant.enginePreload,
      warn: windows.warn,
    }),
    accounts: () => accounts.current,
    writeClipboard: deps.writeClipboard,
    notify: deps.notify,
    warn: windows.warn,
  });
  assistant.engineProtocol().handle(
    CHROME_SCHEME,
    serveEngineFiles({
      root: deps.rendererRoot,
      readFile: deps.readFile,
      model: chrome.modelFile,
    }),
  );
  return chrome;
}

/** The accounts as AI agents reach them, once they are open. */
function agentAccounts(accounts: AccountsSlot): AgentAccounts | undefined {
  const menu = accounts.current;
  return (
    menu && {
      list: () => menu.entries.map(({ id, name }) => ({ id, name })),
      page: menu.agentPage,
    }
  );
}

/** The MCP server for AI agents and Settings › Agents' operations (ADR 0019). */
function agentsOf(
  deps: ChromeFeatureDependencies,
  accounts: AccountsSlot,
  warn: (message: string) => void,
): ChromeHandler[] {
  const { agents } = deps;
  const reach = (): AgentAccounts | undefined => agentAccounts(accounts);
  const server = agentServer({
    ...agents,
    settings: deps.settings,
    accounts: reach,
    notify: deps.notify,
    warn,
  });
  return agentsHandlers({
    server,
    tokens: agents.tokens,
    accounts: reach,
    writeClipboard: deps.writeClipboard,
  });
}

/** Windows that ask or stand by: the assistant's, Settings and proxy sign-in. */
function standbyWindows(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
  accounts: AccountsSlot,
): {
  assistant: AssistantChrome;
  /** One Settings window, which the menu and the assistant's bar both open. */
  openSettings: () => void;
  proxyLogin: ProxyLoginPrompt;
} {
  const settingsOpener = chromeWindowOpener(windows, SETTINGS_PAGE);
  return {
    openSettings: settingsOpener,
    assistant: assistantOf(deps, windows, accounts, settingsOpener),
    proxyLogin: createProxyLoginPrompt(() => openPromptWindow(windows, PROXY_LOGIN_PAGE)),
  };
}

/** The operations of the windows that wait in the background until needed. */
function standbyHandlers(
  standby: ReturnType<typeof standbyWindows>,
  deps: ChromeFeatureDependencies,
): ChromeHandler[] {
  return [
    ...shortcutHandlers(deps.settings, deps.platform, deps.isGlobalShortcutRegistered),
    ...standby.assistant.handlers,
    ...standby.proxyLogin.handlers,
  ];
}

/** Sets up YapYap's own pages, their operations and the menu once the app is ready. */
function startChrome(
  deps: ChromeFeatureDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
  graphics: string,
): ChromeRuntime {
  const withGraphics = { ...deps, facts: () => ({ ...deps.facts(), graphics }) };
  const windows = chromeWindows(deps, renderer, views, warn);
  const slots = chromeSlots(deps, windows);
  const { recoveries, pages, picker, chats, sidebar } = slots;
  const standby = standbyWindows(deps, windows, slots.accounts);
  const handlers = [
    ...allHandlers(withGraphics, slots),
    ...standbyHandlers(standby, deps),
    ...agentsOf(deps, slots.accounts, warn),
  ];
  registerChromeHandlers(deps.ipc, views, handlers, warn);
  const openers = chromeOpeners(windows, standby);
  return {
    attachRecovery: recoveryAttacher(withGraphics, renderer, views, warn, recoveries, pages),
    pickCaptureSource: picker.pick,
    technicalDetails: () => formatTechnicalDetails(buildAboutInfo(withGraphics.facts())),
    openChatsWith: (open) => {
      chats.open = open;
    },
    setAccountMenu: accountMenuSetter(withGraphics, slots, openers, standby.assistant, warn),
    openSettings: openers.openSettings,
    openWelcome: chromeWindowOpener(windows, WELCOME_PAGE),
    openSpellingLanguages: chromeWindowOpener(windows, SPELLING_LANGUAGES_PAGE),
    askProxyLogin: standby.proxyLogin.ask,
    attachSidebar: (create) => attachSidebar(create(renderer), views, sidebar, warn),
    attachAssistantBar: standby.assistant.attachBar,
  };
}

export function createChromeFeature(deps: ChromeFeatureDependencies): ChromeFeature {
  const renderer = { preload: deps.preloadPath, partition: CHROME_PARTITION };
  return {
    beforeReady: () => {
      deps.registerSchemesAsPrivileged([
        // The private model's engine page fetches its `.wasm` and the model
        // from `app://engine` (ADR 0017). The CSP still decides: chrome
        // pages allow no `connect-src`, so they fetch nothing.
        {
          scheme: CHROME_SCHEME,
          privileges: { standard: true, secure: true, supportFetchAPI: true },
        },
      ]);
    },
    afterReady: (views, warn, graphics) => {
      serveChromePages(deps);
      return startChrome(deps, renderer, views, warn, graphics);
    },
  };
}
