import { shrinkAvatar } from './accounts/avatars.ts';
import { notificationIcon } from './notifications/notifier.ts';
import {
  app,
  BrowserWindow,
  clipboard,
  contentTracing,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  Tray,
  globalShortcut,
  nativeImage,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  type WebContents,
} from 'electron';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { textFileAt, writeTextAtomically } from './atomic-write.ts';
import { chatListWidths } from './chat-list/widths.ts';
import { createCustomCode } from './custom-code/custom-code.ts';
import { availableParallelism, homedir, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { createDownloadList } from './downloads/download-list.ts';
import { downloadsFolder } from './downloads/downloads.ts';
import { lastFolderIn } from './downloads/last-folder.ts';
import { openSecretStore, secretFileAt } from './secrets/secret-store.ts';
import { readInstallChannel } from './about/about-info.ts';
import { loadAccounts, saveAccounts } from './accounts/accounts-file.ts';
import { applyAutostart, chooseAutostart, portalAutostart } from './autostart/autostart.ts';
import { backgroundAsker } from './autostart/background-portal.ts';
import { en } from '../shared/messages/en.ts';
import { xdgAutostart } from './autostart/xdg-autostart.ts';
import { CHROME_PARTITION, createChromeFeature } from './chrome/feature.ts';
import { profileCrashFiles, readPreviousLog } from './crash/crash-files.ts';
import { recordTrace } from './crash/trace.ts';
import trayIcon from '../../build/icons/32x32.png?asset';
import { PRODUCT_NAME } from './identity/product.ts';
import { createLogger } from './logging/logger.ts';
import { logProcessErrors } from './process-errors.ts';
import { readInstallEvidence } from './updates/install-evidence.ts';
import { releaseFetcher } from './updates/update-notice.ts';
import { decideUpdatePolicy, settingsIgnoredBy } from './updates/update-policy.ts';
import { chooseFolder, electronSettingsFiles } from './settings/transfer-dialogs.ts';
import { openSettings } from './settings/service.ts';
import { electronCapture } from './permissions/electron-capture.ts';
import { askMediaWithDialog } from './permissions/media-prompt.ts';
import { sandboxDisabled } from './security/sandbox-check.ts';
import {
  askToInstallUpdateWithDialog,
  confirmRemoveAccountWithDialog,
  confirmResetWithDialog,
  explainUnsafeStartWithDialog,
  reviewCrashWithDialog,
} from './dialogs/prompts.ts';
import { startApp } from './start/start.ts';
import { findLocalModels, loopbackRequest, modelServerPorts } from './assistant/local-servers.ts';
import { ENGINE_CHANNELS } from '../shared/engine-api.ts';
import { assistantState } from './assistant/state.ts';
import { allowedChats } from './assistant/chats.ts';
import { assistantKeys } from './assistant/keys.ts';
import { catalogOf } from './assistant/private/catalog.ts';
import { diskModelFiles } from './assistant/private/files.ts';
import { ENGINE_PARTITION } from './assistant/private/engine-window.ts';
import { engineListener } from './assistant/private/engine-host.ts';
import { assistantMayReach, confinedFetch, guardedAssistantSession } from './assistant/net.ts';
import { translationLanguages } from './assistant/rewrites.ts';
import { agentTokens } from './agents/tokens.ts';
import { listenForAgents } from './agents/listener.ts';
import { headlessRequested, headlessSay, type Terminal } from './headless/headless.ts';
import { trayImage } from './tray/tray-icon.ts';
import {
  createAccountHost,
  createMainWindow,
  createSecureWindow,
  createSidebarView,
} from './window/windows.ts';

const PICKER_THUMBNAIL = { width: 320, height: 180 };

const GPU_CRASH_LOG = join(app.getPath('userData'), 'gpu-crashes.json');
const WINDOW_STATE = join(app.getPath('userData'), 'window-state.json');
const DOWNLOADS_STATE = join(app.getPath('userData'), 'downloads.json');
// Kept apart from settings, so importing a settings file can never bring code that runs in WhatsApp.
const CUSTOM_CODE = join(app.getPath('userData'), 'custom-code.json');
const CHAT_LIST_STATE = join(app.getPath('userData'), 'chat-list.json');
// The assistant's state and allowed chats are no preferences, so they live apart from settings (ADR 0017).
const ASSISTANT_STATE = join(app.getPath('userData'), 'assistant.json');
const ASSISTANT_CHATS = join(app.getPath('userData'), 'assistant-chats.json');
// The agents' tokens are state, kept apart from settings and never exported (ADR 0019).
const AGENT_TOKENS = join(app.getPath('userData'), 'agent-tokens.json');

// Holds the tray for the app's lifetime; a collected Tray disappears from the panel.
let tray: Tray | undefined;

const LOG_DIR = join(app.getPath('userData'), 'logs');

const logger = createLogger({
  dir: LOG_DIR,
  home: app.getPath('home'),
  now: Date.now,
  // Terminal output is redacted like the file, for people who start YapYap from one.
  mirror: (line) => process.stderr.write(`${line}\n`),
});

logProcessErrors(process, (message) => {
  logger.log('error', message);
});

const warn = (message: string): void => {
  logger.log('warn', message);
};

const headless = headlessRequested(process.argv);

const terminal: Terminal = {
  isTTY: process.stdout.isTTY,
  write: (text) => {
    process.stdout.write(text);
  },
};

const sayHeadless = headlessSay(headless, terminal);

const notify = (body: string): void => {
  new Notification({ title: PRODUCT_NAME, body }).show();
};

const settings = openSettings(app.getPath('userData'), Date.now());

const installChannel = (): string =>
  readInstallChannel(() => readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'));

const installEvidence = () =>
  readInstallEvidence({
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    // The executable sits in YapYap.app/Contents/MacOS.
    codesign: () =>
      spawnSync('/usr/bin/codesign', ['-dv', join(process.execPath, '..', '..', '..')], {
        encoding: 'utf8',
      }).stderr,
  });

const updatePolicy = decideUpdatePolicy(installChannel(), installEvidence()).policy;

const autostart = chooseAutostart({
  platform: process.platform,
  flatpak: existsSync('/.flatpak-info'),
  loginItems: app,
  portal: () =>
    portalAutostart(
      backgroundAsker(process, en.settings.autostartReason),
      settings.current().general.autostart,
    ),
  xdg: () =>
    xdgAutostart({
      env: process.env,
      home: homedir(),
      execPath: process.execPath,
      files: {
        exists: existsSync,
        read: (path) => readFileSync(path, 'utf8'),
        mkdir: (path) => {
          mkdirSync(path, { recursive: true });
        },
        write: (path, text) => {
          writeTextAtomically(path, text);
        },
        remove: (path) => {
          rmSync(path);
        },
      },
    }),
});

/** Shared by the download handling and the Downloads window. */
const downloadList = createDownloadList((path) => {
  shell.showItemInFolder(path);
});

const customCode = createCustomCode(textFileAt(CUSTOM_CODE), warn);

const secrets = openSecretStore(
  secretFileAt(join(app.getPath('userData'), 'secrets.json')),
  safeStorage,
  process.platform,
);

/** The private model's catalog, or in an unpackaged build under E2E tests, a test model (#457). */
const catalog = catalogOf(process.env, app.isPackaged);
const testModel = catalog.standard.id === 'test' ? catalog.standard.url : undefined;

/** Read and write for the user alone: the assistant's state names chats by fingerprint. */
const OWNER_ONLY = 0o600;

const assistantStore = assistantState(textFileAt(ASSISTANT_STATE, OWNER_ONLY), warn);
const assistantChats = allowedChats(textFileAt(ASSISTANT_CHATS, OWNER_ONLY), secrets, warn);
const keys = assistantKeys(secrets);

/**
 * The assistant's requests go through Electron's network stack on a session
 * of its own, in memory, so system proxies apply and no cookie or cache is
 * kept, and only to the providers, Hugging Face and the chosen model server
 * on this computer (ADR 0017).
 */
const assistantReach = (address: string): boolean =>
  assistantMayReach(address, {
    localServer: () => settings.current().assistant.localServer,
    testModel,
  });
const assistantSession = guardedAssistantSession(
  () => session.fromPartition('yapyap-assistant'),
  assistantReach,
);
const assistantFetch = confinedFetch(
  (input, init) => assistantSession().fetch(input, init),
  assistantReach,
);

const chrome = createChromeFeature({
  notify,
  customCode,
  settings,
  chooseFolder,
  installEvidence,
  settingEffects: { 'general.autostart': applyAutostart(autostart, warn) },
  hiddenSettings: settingsIgnoredBy(updatePolicy),
  registerSchemesAsPrivileged: (schemes) => {
    protocol.registerSchemesAsPrivileged([...schemes]);
  },
  chromeProtocol: () => session.fromPartition(CHROME_PARTITION).protocol,
  ipc: ipcMain,
  createWindow: (options, renderer) => createSecureWindow(options, renderer),
  setMenu: (template) => {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  },
  writeClipboard: (text) => clipboard.writeText(text),
  recordTrace: () => {
    void recordTrace({
      ask: (question) => dialog.showMessageBox(question),
      chooseFile: () => dialog.showSaveDialog({ defaultPath: 'yapyap.perfetto-trace' }),
      start: (categories) =>
        contentTracing.startRecording({ included_categories: [...categories] }),
      stop: (path) => contentTracing.stopRecording(path),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      tell: (message) => {
        void dialog.showMessageBox(message);
      },
      warn,
    });
  },
  openExternal: (url) => shell.openExternal(url),
  facts: () => ({
    version: app.getVersion(),
    channel: installChannel(),
    versions: process.versions,
    platform: process.platform,
    release: release(),
    arch: process.arch,
  }),
  platform: process.platform,
  rendererRoot: join(import.meta.dirname, '..', 'renderer'),
  preloadPath: join(import.meta.dirname, '..', 'preload', 'chrome.cjs'),
  readFile: (path) => readFile(path),
  // Electron types the status as a fixed interface of string fields.
  gpuStatus: () => app.getGPUFeatureStatus() as unknown as Record<string, string>,
  recentLog: () => logger.recent(),
  settingsFiles: electronSettingsFiles,
  spelling: {
    available: () => session.defaultSession.availableSpellCheckerLanguages,
    system: () => app.getPreferredSystemLanguages(),
  },
  assistant: {
    catalog,
    keys,
    fetch: assistantFetch,
    hardware: () => ({ memory: totalmem(), cores: availableParallelism() }),
    files: diskModelFiles(join(app.getPath('userData'), 'models')),
    state: assistantStore,
    chats: assistantChats,
    languages: translationLanguages(app.getPreferredSystemLanguages()),
    // YapYap looks only on the user's click, at a few fixed ports on loopback (#456).
    findServers: () =>
      findLocalModels({
        ports: modelServerPorts(process.env, app.isPackaged),
        request: loopbackRequest(fetch),
      }),
    listenToEngine: (hear) => {
      ipcMain.on(ENGINE_CHANNELS.event, engineListener(hear));
    },
    now: Date.now,
    enginePreload: join(import.meta.dirname, '..', 'preload', 'engine.cjs'),
    engineProtocol: () => session.fromPartition(ENGINE_PARTITION).protocol,
  },
  restart: () => {
    app.relaunch();
    app.quit();
  },
  confirmReset: confirmResetWithDialog,
  confirmRemoveAccount: confirmRemoveAccountWithDialog,
  captureSources: (kind) =>
    desktopCapturer.getSources({ types: [kind], thumbnailSize: PICKER_THUMBNAIL }),
  // The picker's owner is a web contents Electron itself handed to the capture handler.
  windowOf: (contents) => BrowserWindow.fromWebContents(contents as WebContents),
  downloads: downloadList,
  isGlobalShortcutRegistered: (accelerator) => globalShortcut.isRegistered(accelerator),
  agents: {
    tokens: agentTokens({
      file: textFileAt(AGENT_TOKENS, OWNER_ONLY),
      names: secrets,
      randomHex: (bytes) => randomBytes(bytes).toString('hex'),
      now: Date.now,
      warn,
    }),
    serve: (port, answer) => listenForAgents(port, answer, warn),
    now: Date.now,
    version: app.getVersion(),
    alwaysOn: headless,
    onListening: (address) => {
      sayHeadless(en.headless.agents({ address }));
    },
  },
});

// No top-level await: test harnesses hold back the `ready` event until the
// entry module has finished evaluating.
startApp({
  app,
  autostart,
  chrome,
  settings,
  nativeTheme,
  notify,
  warn,
  customCode,
  secrets,
  createWindow: (options) => createMainWindow(options),
  createAccountHost: (window, renderer) => createAccountHost(window, renderer),
  createSidebar: (window, renderer) => createSidebarView(window, renderer),
  defaultSession: () => session.defaultSession,
  sessionOf: (partition) => session.fromPartition(partition),
  accounts: loadAccounts(app.getPath('userData')),
  whatsAppPreload: join(import.meta.dirname, '..', 'preload', 'whatsapp.cjs'),
  notifications: {
    create: (options) =>
      new Notification({
        ...options,
        icon: notificationIcon<string | Electron.NativeImage>(options.icon, trayIcon, (url) =>
          nativeImage.createFromDataURL(url),
        ),
      }),
    isSupported: () => Notification.isSupported(),
  },
  ipc: ipcMain,
  chatListWidths: chatListWidths(textFileAt(CHAT_LIST_STATE), warn),
  saveAccounts: (accounts) => {
    saveAccounts(app.getPath('userData'), accounts);
  },
  newAccountId: randomUUID,
  askMedia: askMediaWithDialog,
  capture: (pickInApp, wayland) =>
    electronCapture(process.platform, wayland, process.getSystemVersion(), pickInApp),
  chromeVersion: process.versions.chrome,
  platform: process.platform,
  env: process.env,
  argv: process.argv,
  terminal,
  openExternal: (url) => shell.openExternal(url),
  isOnline: () => net.isOnline(),
  avatarImage: (bytes) => shrinkAvatar(nativeImage.createFromBuffer(Buffer.from(bytes))),
  gpuCrashLog: textFileAt(GPU_CRASH_LOG),
  appMetrics: () => app.getAppMetrics(),
  idleSeconds: () => powerMonitor.getSystemIdleTime(),
  globalShortcuts: globalShortcut,
  systemLanguages: () => app.getPreferredSystemLanguages(),
  contextMenu: (items) => {
    Menu.buildFromTemplate(items).popup();
  },
  onResume: (listener) => {
    powerMonitor.on('resume', listener);
  },
  windowState: textFileAt(WINDOW_STATE),
  workAreas: () => screen.getAllDisplays().map((display) => display.workArea),
  downloads: {
    folder: () =>
      downloadsFolder(settings.current().downloads.folder, () => app.getPath('downloads'), {
        realpath: (path) => realpathSync(path),
        isFolder: (path) => statSync(path).isDirectory(),
      }),
    taken: (path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined,
    lastFolder: lastFolderIn(textFileAt(DOWNLOADS_STATE)),
    openPath: (path) => shell.openPath(path),
    track: downloadList.add,
  },
  shutdown: {
    onSignal: (signal, listener) => {
      process.on(signal, listener);
    },
    onSystemShutdown: (listener) => {
      powerMonitor.on('shutdown', listener);
    },
  },
  sandboxDisabled: sandboxDisabled(app.commandLine, process.env),
  explainUnsafeStart: explainUnsafeStartWithDialog,
  selfUpdate: {
    updater: async () => {
      const { default: electronUpdater } = await import('electron-updater');
      return electronUpdater.autoUpdater;
    },
    askToInstall: askToInstallUpdateWithDialog,
  },
  badge: {
    setBadgeCount: (count) => app.setBadgeCount(count),
    createImage: ({ bitmap, width, height, scaleFactor }) =>
      nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor }),
  },
  tray: {
    create: () => {
      tray = new Tray(trayIcon);
      return tray;
    },
    buildMenu: (template) => Menu.buildFromTemplate(template),
    image: (choice) =>
      trayImage(
        choice,
        {
          fromPath: (path) => nativeImage.createFromPath(path),
          fromBitmap: (bitmap, size) => nativeImage.createFromBitmap(bitmap, size),
        },
        trayIcon,
      ),
    scheme: nativeTheme,
  },
  releases: {
    policy: updatePolicy,
    currentVersion: app.getVersion(),
    fetchJson: releaseFetcher((url, init) => net.fetch(url, init)),
    showNotice: (body, url) => {
      const notice = new Notification({ title: PRODUCT_NAME, body });
      notice.on('click', () => {
        void shell.openExternal(url);
      });
      notice.show();
    },
  },
  crashes: {
    files: profileCrashFiles(app.getPath('userData'), app.getPath('crashDumps')),
    version: app.getVersion(),
    previousLog: () => readPreviousLog(LOG_DIR),
    review: reviewCrashWithDialog,
    writeClipboard: (text) => clipboard.writeText(text),
  },
  logError: (message) => {
    logger.log('error', message);
  },
}).catch((error: unknown) => {
  logger.log('error', `Startup failed: ${String(error)}`);
  app.exit(1);
});
