import { unreadInTitle } from '../../adapter/page-state.ts';
import { accountAvatars, type AccountAvatars } from '../accounts/avatars.ts';
import type { AccountSummary } from '../../shared/chrome-api.ts';
import type { AccountMenu } from '../chrome/feature.ts';
import { listenToAssistantBar } from '../assistant/bar-ipc.ts';
import { suggestAsMessagesArrive } from '../assistant/auto-suggest.ts';
import { inPageAssistantBar } from '../assistant/bar-page.ts';
import { listenToChatList } from '../chat-list/chat-list-ipc.ts';
import { inPageChatList, type InPageChatList } from '../chat-list/chat-list-page.ts';
import { watchConnectivity } from '../connectivity/connectivity.ts';
import { PRODUCT_NAME } from '../identity/product.ts';
import { followThemeSetting } from '../appearance/theme.ts';
import { followZoomSetting } from '../appearance/zoom.ts';
import { chromeUserAgent } from '../identity/user-agent.ts';
import { describeGraphics } from '../recovery/gpu-safe-mode.ts';
import { trackVisibility, type Visibility } from '../window/visibility.ts';
import { type ProxyController } from '../network/proxy.ts';
import { trackShares, type ScreenShares } from '../capture/shares.ts';
import { createPrivacyScreen, type PrivacyScreen } from '../privacy/privacy-screen.ts';
import { isSilenced, quietAudio, setDoNotDisturb } from '../notifications/quiet.ts';
import { followHiddenReadsSetting } from '../privacy/hidden-reads.ts';
import { describeDisplayBackend } from '../display/backend.ts';
import { watchMemory } from '../recovery/memory-watchdog.ts';
import { secureSession, type SecurityDependencies } from '../security/security.ts';
import type { ViewRegistry } from '../security/views.ts';
import { accountSignals, type AccountSignals } from '../accounts/account-signals.ts';
import { partitionOf, type Account } from '../accounts/accounts.ts';
import { contextMenuFor, followProxy, guardAccountSession } from './account-session.ts';
import { runAccounts, type RunningAccounts } from '../accounts/running.ts';
import { NOTIFICATION_CHANNELS } from '../../shared/notification-api.ts';
import { listenForNotifications } from '../notifications/notification-ipc.ts';
import {
  accountNotifier,
  type AccountNotifier,
  type NotifierAccount,
} from '../notifications/notifier.ts';
import {
  draftReply,
  insertDraft,
  pressEnter,
  readDraft,
  replaceDraft,
  supportsInlineReply,
} from '../notifications/reply.ts';
import { readOpenChat, readUnreadChats } from '../assistant/chat-reading.ts';
import { agentPageOf } from '../agents/agent-page.ts';
import { bringToFront, claimSingleInstance, type Instances, type LinkPage } from '../instances.ts';
import { chatLinkInArguments } from '../navigation/deep-link.ts';
import { quitOnShutdown } from '../shutdown.ts';
import { showWhenPageReady } from '../window/show-when-ready.ts';
import { focusPageWithWindow } from '../window/focus-page.ts';
import { unreadBadge } from '../badge/unread-badge.ts';
import { setUpTray, type TrayDependencies } from '../tray/tray.ts';
import { followTrayIconSetting } from '../tray/tray-icon.ts';
import { syncAutostartSetting } from '../autostart/autostart.ts';
import { followSpellingSetting } from '../spelling/spelling.ts';
import { sidebarSource } from '../accounts/sidebar-source.ts';
import {
  beforeReady,
  applyDisplayBackend,
  watchCrashes,
  announceStartup,
  whatsAppOrigin,
  signInToProxies,
  takeGlobalShortcuts,
  openMainWindow,
  refuseWithoutSandbox,
} from './startup.ts';
import type {
  AccountContents,
  AccountWiring,
  Notifiers,
  OpenedAccount,
  OpeningWiring,
  PickInApp,
  StartDependencies,
  WindowPort,
} from './types.ts';

/**
 * Sessions are guarded before the app is ready, but YapYap's picker only
 * exists once chrome is up: until then, requests are denied.
 */
function latePicker(): { readonly pick: PickInApp; readonly bind: (pick: PickInApp) => void } {
  let bound: PickInApp | undefined;
  return {
    pick: (contents) => bound?.(contents) ?? Promise.resolve(undefined),
    bind: (pick) => {
      bound = pick;
    },
  };
}

/** The account's name, to head its notifications when several accounts run. */
function headingOf(running: RunningAccounts<OpenedAccount>, id: string): string | undefined {
  const names = new Map(running.list().map((entry) => [entry.id, entry.name]));
  return running.opened().length > 1 ? names.get(id) : undefined;
}

/**
 * What an account's notifications do: a click brings its window forward,
 * switches to it and lets WhatsApp open the chat; a reply does the same,
 * then waits in the chat's message box for the user to send it (#60).
 */
function notifierAccount<Window extends WindowPort>(
  { deps, window, running, avatars }: AccountWiring<Window>,
  account: Account,
  contents: AccountContents,
): NotifierAccount {
  const open = (id: string): void => {
    bringToFront(window);
    running().switchTo(account.id);
    contents.send(NOTIFICATION_CHANNELS.click, id);
  };
  return {
    heading: () => headingOf(running(), account.id),
    silenced: () => {
      const { doNotDisturb } = deps.settings.current().general;
      return running()
        .list()
        .some((entry) => entry.id === account.id && isSilenced(doNotDisturb, entry));
    },
    onClick: open,
    onReply: (id, text) => {
      open(id);
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        });
      void draftReply(contents, text, { wait, warn: deps.warn });
    },
    picture: (url) => avatars.picture(contents, url),
  };
}

/**
 * Shows an account's WhatsApp notifications, and finds them by the page
 * that showed them.
 */
function notifyFor<Window extends WindowPort>(
  wiring: AccountWiring<Window>,
  account: Account,
  contents: AccountContents,
): AccountNotifier {
  const { deps } = wiring;
  const notifier = accountNotifier(
    {
      ...deps.notifications,
      privacy: () => {
        const { notificationSender, notificationText } = deps.settings.current().privacy;
        return { sender: notificationSender, text: notificationText };
      },
      inlineReply: supportsInlineReply(deps.platform),
      now: Date.now,
      wait: (ms) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        }),
      warn: deps.warn,
    },
    notifierAccount(wiring, account, contents),
  );
  wiring.notifiers.byPage.set(contents, notifier);
  wiring.notifiers.all.add(notifier);
  return notifier;
}

/** Its memory, its zoom and hidden reads, and its title, which carries the unread count. */
function watchAccountPage<Window extends WindowPort>(
  { deps, window, signals, avatars, notifiers }: AccountWiring<Window>,
  contents: AccountContents,
  account: Account,
): void {
  watchMemory(contents, {
    metrics: deps.appMetrics,
    limitMb: () => deps.settings.current().reliability.memoryWatchdogMb,
    focused: () => window.isFocused(),
    idleSeconds: deps.idleSeconds,
    every: setInterval,
    stop: clearInterval,
    warn: deps.warn,
  });
  followZoomSetting(contents, deps.settings);
  followHiddenReadsSetting(contents, deps.settings);
  deps.customCode.attach(contents, account.id);
  contents.on('page-title-updated', (_event, title) => {
    signals.pageTitle(account.id, title);
    // WhatsApp never withdraws its notifications once their chats are read (#398),
    // and docks such as GNOME's count what is left in the notification list.
    if (unreadInTitle(title) === 0) {
      notifiers.byPage.get(contents)?.closeAll();
    }
    // WhatsApp retitles its page as chats come and go, a cheap moment to look again.
    void avatars.refresh(account.id, contents);
  });
}

/** Opens an account's views, hidden, and everything that watches or serves its WhatsApp. */
function openAccount<Window extends WindowPort>(
  wiring: AccountWiring<Window>,
  account: Account,
): OpenedAccount {
  const { deps, chrome, window, origin } = wiring;
  const { session, proxied, permissions } = guardAccountSession(deps, wiring, account);
  const host = deps.createAccountHost(window, {
    partition: partitionOf(account),
    preload: deps.whatsAppPreload,
    // The session's setting decides whether anything is checked (#73).
    spellcheck: true,
  });
  const contents = host.webContents;
  contextMenuFor(wiring, contents, session);
  const notifier = notifyFor(wiring, account, contents);
  const view = {
    zone: 'whatsapp',
    home: origin,
    label: account.name,
    account: account.id,
  } as const;
  wiring.security.views.set(contents, view);
  const recovery = chrome.attachRecovery(contents, origin, host.createOverlay);
  watchAccountPage(wiring, contents, account);
  wiring.proxy.guardCalls(contents, account.id);
  // Nothing loads before the proxy is set; a failed load is reported by the recovery monitor.
  const loaded = proxied
    .then(() => contents.loadURL(wiring.firstUrl(account)))
    .then(reportedElsewhere, reportedElsewhere);
  const close = (): void => {
    notifier.closeAll();
    wiring.notifiers.all.delete(notifier);
    host.close();
  };
  return { ...host, close, contents, reconnect: recovery.reconnect, loaded, permissions };
}

/** Deletes a removed account's WhatsApp data; its folder goes at the next start. */
async function forgetAccount<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  signals: AccountSignals,
  avatars: AccountAvatars,
  account: Account,
): Promise<void> {
  signals.forget(account.id);
  avatars.forget(account.id);
  deps.chatListWidths.forget(account.id);
  const session = deps.sessionOf(partitionOf(account));
  await session.clearStorageData();
  await session.clearCache();
}

/** A failed page load needs no handling here: the recovery monitor reports it. */
const reportedElsewhere = (): undefined => undefined;

/** Every account, marking the one on screen. */
function summaries(running: RunningAccounts<OpenedAccount>): AccountSummary[] {
  const active = running.active().account.id;
  return running.list().map((account) => ({
    ...account,
    muted: account.muted === true,
    proxy: account.proxy ?? '',
    active: account.id === active,
  }));
}

function pageOf(running: RunningAccounts<OpenedAccount>, id: string): OpenedAccount | undefined {
  return running.opened().find(({ account }) => account.id === id)?.page;
}

/** What the Account menu shows and does. */
function accountMenu(
  running: RunningAccounts<OpenedAccount>,
  warn: (message: string) => void,
  privacy: PrivacyScreen,
  origin: string,
): AccountMenu {
  return {
    privacyScreen: privacy.covered(),
    togglePrivacyScreen: privacy.toggle,
    entries: summaries(running),
    activeContents: () => running.active().page.contents,
    insertDraft: (text) => insertDraft(running.active().page.contents, text),
    readActiveChat: (messages) => readOpenChat(running.active().page.contents, messages),
    readUnreadSummary: () => readUnreadChats(running.active().page.contents),
    replaceDraft: (text) => replaceDraft(running.active().page.contents, text),
    readDraft: () => readDraft(running.active().page.contents),
    pressEnter: () => pressEnter(running.active().page.contents),
    agentPage: (id) => {
      const page = pageOf(running, id);
      return page && agentPageOf(page.contents, origin);
    },
    switchTo: running.switchTo,
    add: running.add,
    update: running.update,
    permissions: (id) => pageOf(running, id)?.permissions.allowed(),
    forgetPermissions: (id) => {
      pageOf(running, id)?.permissions.forget();
    },
    remove: (id) =>
      running.remove(id).catch(() => {
        warn('Could not delete the data of a removed account.');
        return true;
      }),
  };
}

/** The window's title and the app badge, from every account's page title. */
function windowSignals<Window extends WindowPort>(
  deps: Pick<StartDependencies<Window>, 'badge' | 'platform'>,
  window: Window,
  tray: (unread: number) => void,
): AccountSignals {
  const badge = unreadBadge({
    ...deps.badge,
    platform: deps.platform,
    setOverlayIcon: window.setOverlayIcon.bind(window),
  });
  return accountSignals({
    setTitle: (title) => {
      window.setTitle(title);
    },
    showUnread: (total) => {
      badge(total);
      tray(total);
    },
    initialTitle: PRODUCT_NAME,
  });
}

/**
 * The tray: the running accounts, the unread count of all of them, and
 * whether the window is out of sight. Returns how to refresh it and how to
 * give it a new unread count.
 */
/** What the tray menu does. */
/** What the tray and the menu show besides the accounts: shares and the privacy screen. */
interface Screens {
  readonly shares: ScreenShares;
  readonly privacy: PrivacyScreen;
}

function trayActions<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  chrome: AccountWiring<Window>['chrome'],
  running: () => RunningAccounts<OpenedAccount>,
  { shares, privacy }: Screens,
): TrayDependencies {
  return {
    platform: deps.platform,
    buildMenu: deps.tray.buildMenu,
    switchAccount: (id) => {
      running().switchTo(id);
    },
    openSettings: chrome.openSettings,
    setDoNotDisturb: (on) => {
      setDoNotDisturb(deps.settings, on);
    },
    stopSharing: shares.stop,
    togglePrivacyScreen: privacy.toggle,
    stopAgents: () => {
      deps.settings.update((settings) => ({
        ...settings,
        agents: { ...settings.agents, enabled: false },
      }));
    },
    quit: () => {
      deps.app.quit();
    },
  };
}

function accountsTray<Window extends WindowPort>(
  { deps, chrome, window }: OpeningWiring<Window>,
  running: () => RunningAccounts<OpenedAccount>,
  visibility: Visibility,
  screens: Screens,
): { readonly refresh: () => void; readonly setUnread: (unread: number) => void } {
  let unread = 0;
  const port = deps.tray.create();
  followTrayIconSetting(port, { ...deps.tray, platform: deps.platform, settings: deps.settings });
  const update = setUpTray(port, window, trayActions(deps, chrome, running, screens));
  const refresh = (): void => {
    update({
      unread,
      accounts: summaries(running()),
      windowShown: visibility.visible(),
      doNotDisturb: deps.settings.current().general.doNotDisturb,
      sharing: [...screens.shares.sharing()],
      privacyScreen: screens.privacy.covered(),
      agents: deps.settings.current().agents.enabled,
    });
  };
  return {
    refresh,
    setUnread: (total) => {
      unread = total;
      refresh();
    },
  };
}

/** Mutes the sound of silenced accounts out of sight; run again on every change. */
function keepQuiet<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  running: RunningAccounts<OpenedAccount>,
  visibility: Visibility,
): void {
  quietAudio(
    running.opened().map(({ account, page }) => ({ account, page: page.contents })),
    deps.settings.current().general.doNotDisturb,
    visibility.onScreen() ? running.active().account.id : undefined,
  );
}

interface AccountIndicators {
  readonly visibility: Visibility;
  /** Shows the accounts, their shares and do not disturb anew. */
  readonly refresh: () => void;
  readonly setUnread: (total: number) => void;
  readonly privacy: PrivacyScreen;
}

/**
 * What shows the accounts outside their pages: the tray and the sidebar,
 * with their unread counts and running screen shares (#161).
 */
function accountIndicators<Window extends WindowPort>(
  wiring: OpeningWiring<Window>,
  running: () => RunningAccounts<OpenedAccount>,
  signals: () => AccountSignals,
  avatars: () => AccountAvatars,
  menuChanged: () => void,
): AccountIndicators {
  const { deps, chrome, window } = wiring;
  const privacy = privacyScreenOf(deps, window, running, () => {
    refresh();
    menuChanged();
  });
  const shares = trackShares(deps.ipc, {
    views: wiring.security.views,
    origin: wiring.origin,
    onChange: () => {
      refresh();
    },
    warn: deps.warn,
  });
  const visibility = trackVisibility(window, () => {
    // The tray's Show or Hide follows the window.
    refresh();
    keepQuiet(deps, running(), visibility);
  });
  const tray = accountsTray(wiring, running, visibility, { shares, privacy });
  const sidebar = chrome.attachSidebar((renderer) => deps.createSidebar(window, renderer));
  const refresh = (): void => {
    tray.refresh();
    const source = sidebarSource(deps.settings.current(), running(), signals(), shares, avatars());
    sidebar(source);
  };
  const setUnread = (total: number): void => {
    tray.setUnread(total);
    refresh();
  };
  return { visibility, refresh, setUnread, privacy };
}

/** The privacy screen over every account's WhatsApp, which looks again on focus changes. */
function privacyScreenOf<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  window: Window,
  running: () => RunningAccounts<OpenedAccount>,
  onChange: () => void,
): PrivacyScreen {
  const privacy = createPrivacyScreen({
    settings: deps.settings,
    pages: () =>
      running()
        .opened()
        .map(({ page }) => page.contents),
    focused: () => window.isFocused(),
    idleSeconds: deps.idleSeconds,
    every: setInterval,
    onChange,
  });
  window.on('focus', privacy.update);
  window.on('blur', privacy.update);
  return privacy;
}

/** Each account's profile photo, which refreshes the sidebar when one changes (#87). */
function avatarsFor<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  origin: string,
  indicators: Pick<AccountIndicators, 'refresh'>,
): AccountAvatars {
  return accountAvatars({
    home: origin,
    toDataUrl: deps.avatarImage,
    now: Date.now,
    onChange: () => {
      indicators.refresh();
    },
    schedule: setTimeout,
    cancel: clearTimeout,
  });
}

/** Every enabled account, in its own view of the main window; the active one shows. */
function openAccounts<Window extends WindowPort>(
  wiring: OpeningWiring<Window>,
): RunningAccounts<OpenedAccount> {
  const { deps, chrome, window } = wiring;
  const menuChanged = (): void => {
    chrome.setAccountMenu(accountMenu(running, deps.warn, indicators.privacy, wiring.origin));
  };
  const indicators: AccountIndicators = accountIndicators(
    wiring,
    () => running,
    () => signals,
    () => avatars,
    menuChanged,
  );
  const signals: AccountSignals = windowSignals(deps, window, indicators.setUnread);
  const avatars: AccountAvatars = avatarsFor(deps, wiring.origin, indicators);
  const changed = (): void => {
    signals.activate(running.active().account.id);
    wiring.chatList.refresh();
    menuChanged();
    indicators.refresh();
    keepQuiet(deps, running, indicators.visibility);
  };
  wiring.proxy.useAccounts(deps.accounts.accounts);
  const running: RunningAccounts<OpenedAccount> = runAccounts({
    accounts: deps.accounts,
    open: (account) =>
      openAccount({ ...wiring, signals, avatars, running: () => running }, account),
    save: (accounts) => {
      deps.saveAccounts(accounts);
      wiring.proxy.useAccounts(accounts.accounts);
    },
    forget: (account) => forgetAccount(deps, signals, avatars, account),
    newId: deps.newAccountId,
    onChange: changed,
  });
  changed();
  followChanges(deps, signals, running, changed);
  return running;
}

/** Shows the accounts anew when settings change, and reconnects them when the network returns. */
function followChanges<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  signals: AccountSignals,
  running: RunningAccounts<OpenedAccount>,
  changed: () => void,
): void {
  // The menu and the tray show do not disturb, and it decides what is muted.
  deps.settings.onChange(changed);
  reconnectWhenOnline(deps, signals, running);
}

type BarWiring<Window extends WindowPort> = Pick<
  OpeningWiring<Window>,
  'deps' | 'chrome' | 'window' | 'security' | 'origin'
>;

/** The assistant bar in the active account's WhatsApp, heard from there alone (ADR 0013). */
function attachAssistantBar<Window extends WindowPort>(
  { deps, chrome, window, security, origin }: BarWiring<Window>,
  running: RunningAccounts<OpenedAccount>,
): void {
  const activePage = (): AccountContents => running.active().page.contents;
  chrome.attachAssistantBar((bar) => {
    listenToAssistantBar(deps.ipc, bar, {
      origin,
      activePage,
      openSettings: chrome.openSettings,
      views: security.views,
      warn: deps.warn,
    });
    const onScreen = (): boolean => window.isVisible() && window.isFocused();
    suggestAsMessagesArrive({
      activePage,
      active: () => {
        const { enabled, autoSuggest } = deps.settings.current().assistant;
        return enabled && autoSuggest && !bar.state().working && onScreen();
      },
      suggest: () => bar.suggestOnArrival(),
      every: setInterval,
    });
    return inPageAssistantBar(bar.state, {
      activePage,
      onScreen,
      redrawn: () => void bar.chatRedrawn(),
    });
  });
}

/** Each account's chat list width, heard from its own WhatsApp view alone (#79). */
function attachChatList<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  window: Window,
  security: Parameters<typeof secureSession>[1],
  origin: string,
): InPageChatList {
  listenToChatList(deps.ipc, deps.chatListWidths, {
    origin,
    views: security.views,
    warn: deps.warn,
  });
  return inPageChatList({
    widths: deps.chatListWidths,
    visible: () => window.isVisible(),
    every: setInterval,
  });
}

/** Marks the title while offline, and reloads every account when the network returns. */
function reconnectWhenOnline<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  signals: AccountSignals,
  running: RunningAccounts<OpenedAccount>,
): void {
  watchConnectivity({
    isOnline: deps.isOnline,
    onResume: deps.onResume,
    every: setInterval,
    schedule: setTimeout,
    onChange: signals.setOnline,
    reconnect: () => {
      for (const { page } of running.opened()) {
        page.reconnect();
      }
    },
  });
}

/** The window-wide parts: chat links, focus, and showing the window. */
function wireMainWindow<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  chrome: ReturnType<StartDependencies<Window>['chrome']['afterReady']>,
  window: Window,
  running: RunningAccounts<OpenedAccount>,
  origin: string,
): LinkPage {
  const activePage = (): AccountContents => running.active().page.contents;
  const page: LinkPage = { loadURL: (url) => activePage().loadURL(url) };
  chrome.openChatsWith((phone) => {
    const target = new URL('/send', origin);
    target.searchParams.set('phone', phone);
    bringToFront(window);
    // A failed load is reported by the recovery monitor.
    page.loadURL(target.href).catch(() => undefined);
  });
  focusPageWithWindow(window, {
    focus: () => {
      activePage().focus();
    },
  });
  showWhenPageReady(window, deps.settings.current().general.startMinimized, activePage());
  return page;
}

/**
 * Opens a chat link from the command line in the account YapYap starts on,
 * and only the first time that account loads.
 */
function chatLinkOnce(
  link: string | undefined,
  startsOn: string,
  origin: string,
): (account: Account) => string {
  let pending = link;
  return (account) => {
    if (account.id !== startsOn || pending === undefined) {
      return origin;
    }
    const target = pending;
    pending = undefined;
    return target;
  };
}

/** Hears every account's notifications, and withdraws them all when YapYap quits. */
function listenToNotifications<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  views: ViewRegistry,
  origin: string,
): Notifiers {
  const notifiers: Notifiers = { byPage: new WeakMap(), all: new Set() };
  listenForNotifications(deps.ipc, (sender) => notifiers.byPage.get(sender), {
    views,
    origin,
    warn: deps.warn,
  });
  deps.app.on('will-quit', () => {
    for (const notifier of notifiers.all) {
      notifier.closeAll();
    }
  });
  return notifiers;
}

/** Opens the main window with every account, and waits for their first loads. */
async function openWindow<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  chrome: ReturnType<StartDependencies<Window>['chrome']['afterReady']>,
  security: Parameters<typeof secureSession>[1],
  instances: Instances,
  origin: string,
  proxy: ProxyController,
): Promise<void> {
  const window = openMainWindow(deps);
  takeGlobalShortcuts(deps, window);
  const chatList = attachChatList(deps, window, security, origin);
  const running = openAccounts({
    deps,
    chrome,
    security,
    window,
    origin,
    proxy,
    chatList,
    firstUrl: chatLinkOnce(chatLinkInArguments(deps.argv, origin), deps.accounts.active, origin),
    notifiers: listenToNotifications(deps, security.views, origin),
    spelling: followSpellingSetting(deps.settings, deps.systemLanguages),
  });
  chatList.follow(() => ({
    account: running.active().account.id,
    page: running.active().page.contents,
  }));
  attachAssistantBar({ deps, chrome, window, security, origin }, running);
  instances.attach(window, wireMainWindow(deps, chrome, window, running, origin));
  // A failed load must not end startup: the monitor shows the recovery screen.
  await Promise.all(running.opened().map(({ page }) => page.loaded));
}

/**
 * The first launch opens the welcome over WhatsApp, and saves the default
 * settings, so the welcome never opens again (#84).
 */
function welcomeOnFirstRun<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  chrome: ReturnType<StartDependencies<Window>['chrome']['afterReady']>,
): void {
  if (!deps.settings.firstRun) {
    return;
  }
  deps.settings.update((settings) => settings);
  chrome.openWelcome();
}

/** How YapYap presents itself to WhatsApp: the bundled Chromium, as desktop Chrome. */
function browserIdentity<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): SecurityDependencies['identity'] {
  return {
    userAgent: chromeUserAgent(deps.platform, deps.chromeVersion),
    chromeVersion: deps.chromeVersion,
  };
}

export async function startApp<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): Promise<void> {
  const { app, warn } = deps;
  if (deps.sandboxDisabled) {
    await refuseWithoutSandbox(deps);
    return;
  }
  const origin = whatsAppOrigin(deps.env, warn);
  const instances = claimSingleInstance(app, origin, warn);
  if (instances === undefined) {
    return;
  }
  quitOnShutdown(deps.shutdown, () => {
    app.quit();
  });
  const reportCrash = watchCrashes(deps);
  const views: ViewRegistry = new WeakMap();
  const identity = browserIdentity(deps);
  const picker = latePicker();
  const display = applyDisplayBackend(deps);
  const capture = deps.capture(picker.pick, display.active === 'wayland');
  const security = { ...deps, capture, views, identity };
  const graphics = beforeReady(deps, security);

  await app.whenReady();
  secureSession(deps.defaultSession(), security);
  const proxy = await followProxy(deps);
  followThemeSetting(deps.nativeTheme, deps.settings);
  syncAutostartSetting(deps.autostart, deps.settings, warn);
  const rendering = `${describeGraphics(graphics)}, display ${describeDisplayBackend(display)}`;
  const chrome = deps.chrome.afterReady(views, warn, rendering);
  signInToProxies(deps, chrome);
  picker.bind(chrome.pickCaptureSource);
  announceStartup(deps, graphics);
  reportCrash(chrome.technicalDetails);
  await openWindow(deps, chrome, security, instances, origin, proxy);
  welcomeOnFirstRun(deps, chrome);
}
