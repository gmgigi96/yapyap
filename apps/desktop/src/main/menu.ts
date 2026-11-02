import type { MenuItemConstructorOptions } from 'electron';
import type { ZoomStep } from './appearance/zoom.ts';
import { PRODUCT_NAME } from './identity/product.ts';
import type { AccountSummary } from '../shared/chrome-api.ts';
import { en } from '../shared/messages/en.ts';
import { acceleratorOf, type CustomShortcuts, type ShortcutId } from '../shared/shortcuts.ts';

/** The platform the menu is for, and the keys the user chose instead of YapYap's. */
interface Keys {
  readonly platform: string;
  readonly custom: CustomShortcuts;
}

/** Positions with a shortcut: the digits 1 to 9. */
const SHORTCUT_POSITIONS = 9;

/** The accelerator a platform gives `id`, ready to spread into a menu item. */
function keyed(id: ShortcutId, keys: Keys): Pick<MenuItemConstructorOptions, 'accelerator'> {
  const accelerator = acceleratorOf(id, keys.platform, keys.custom);
  return accelerator === undefined ? {} : { accelerator };
}

export interface MenuActions {
  /** Every account; only those that are on can be switched to. */
  readonly accounts: readonly AccountSummary[];
  readonly switchAccount: (id: string) => void;
  readonly addAccount: () => void;
  readonly openAccounts: () => void;
  /** Asks first, since it deletes the active account's WhatsApp data. */
  readonly removeAccount: () => void;
  readonly doNotDisturb: boolean;
  readonly setDoNotDisturb: (on: boolean) => void;
  /** Mutes or unmutes the active account. */
  readonly setMuted: (muted: boolean) => void;
  readonly openAbout: () => void;
  readonly openSettings: () => void;
  readonly openCustomCode: () => void;
  readonly openNewChat: () => void;
  readonly clearCache: () => void;
  readonly resetSession: () => void;
  readonly zoom: (step: ZoomStep) => void;
  readonly privacyScreen: boolean;
  readonly togglePrivacyScreen: () => void;
  /** Copies versions, platform, GPU summary and recent redacted log lines for bug reports. */
  readonly copyDiagnostics: () => void;
  readonly openShortcuts: () => void;
  readonly openDownloads: () => void;
  /** Help → Report a Problem: the guided report (#82). */
  readonly openReport: () => void;
  /** Help → Record a Performance Trace, for slow-downs a log cannot explain (#113). */
  readonly recordTrace: () => void;
  /** The assistant's actions, which its bar in the open chat answers (ADR 0017). */
  readonly assistant: {
    readonly suggest: () => void;
    readonly summarize: () => void;
    readonly catchUp: () => void;
  };
}

/** Zoom in YapYap's own 5% steps, kept per account. */
function zoomItems(actions: MenuActions, keys: Keys): MenuItemConstructorOptions[] {
  const step = (label: string, id: ShortcutId, zoom: ZoomStep) => ({
    label,
    ...keyed(id, keys),
    click: () => {
      actions.zoom(zoom);
    },
  });
  return [
    step(en.menu.actualSize, 'actualSize', 'reset'),
    step(en.menu.zoomIn, 'zoomIn', 'in'),
    step(en.menu.zoomOut, 'zoomOut', 'out'),
  ];
}

/** The standard View menu, with YapYap's zoom and its privacy screen. */
function viewMenu(actions: MenuActions, keys: Keys): MenuItemConstructorOptions {
  return {
    label: en.menu.view,
    submenu: [
      { role: 'reload', ...keyed('reload', keys) },
      { role: 'forceReload', ...keyed('forceReload', keys) },
      { role: 'toggleDevTools', ...keyed('devTools', keys) },
      { type: 'separator' },
      ...zoomItems(actions, keys),
      { type: 'separator' },
      {
        label: en.menu.privacyScreen,
        type: 'checkbox',
        checked: actions.privacyScreen,
        ...keyed('privacyScreen', keys),
        click: actions.togglePrivacyScreen,
      },
      { role: 'togglefullscreen', ...keyed('fullScreen', keys) },
    ],
  };
}

/** Editing, with each shortcut from the shared table, plain-text paste included. */
function editMenu(keys: Keys): MenuItemConstructorOptions {
  return {
    label: en.menu.edit,
    submenu: [
      { role: 'undo', ...keyed('undo', keys) },
      { role: 'redo', ...keyed('redo', keys) },
      { type: 'separator' },
      { role: 'cut', ...keyed('cut', keys) },
      { role: 'copy', ...keyed('copy', keys) },
      { role: 'paste', ...keyed('paste', keys) },
      { role: 'pasteAndMatchStyle', ...keyed('pastePlain', keys) },
      { role: 'selectAll', ...keyed('selectAll', keys) },
    ],
  };
}

/** The window, and the Downloads window YapYap keeps for this session (#74). */
function windowMenu(actions: MenuActions, keys: Keys): MenuItemConstructorOptions {
  const mac: MenuItemConstructorOptions[] =
    keys.platform === 'darwin' ? [{ role: 'zoom' }, { type: 'separator' }, { role: 'front' }] : [];
  return {
    label: en.menu.window,
    // On macOS this role adds the open windows to the menu.
    ...(keys.platform === 'darwin' ? { role: 'windowMenu' as const } : {}),
    submenu: [
      { role: 'minimize', ...keyed('minimize', keys) },
      { role: 'close', ...keyed('close', keys) },
      ...mac,
      { type: 'separator' },
      { label: en.menu.downloads, ...keyed('downloads', keys), click: actions.openDownloads },
    ],
  };
}

function running(actions: MenuActions): readonly AccountSummary[] {
  return actions.accounts.filter((entry) => entry.enabled);
}

/** The accounts, switched by position with Ctrl or Cmd and a digit. */
function accountItems(actions: MenuActions, keys: Keys): MenuItemConstructorOptions[] {
  const first = String(acceleratorOf('switchAccount', keys.platform, keys.custom));
  return running(actions).map((entry, index) => ({
    label: entry.name,
    type: 'radio',
    checked: entry.active,
    ...(index < SHORTCUT_POSITIONS ? { accelerator: first.replace(/1$/, String(index + 1)) } : {}),
    click: () => {
      actions.switchAccount(entry.id);
    },
  }));
}

/** Do not disturb for every account, and muting for the one on screen (#61). */
function quietItems(actions: MenuActions): MenuItemConstructorOptions[] {
  const active = actions.accounts.find((entry) => entry.active);
  const muted = active?.muted === true;
  return [
    {
      label: en.menu.doNotDisturb,
      type: 'checkbox',
      checked: actions.doNotDisturb,
      click: () => {
        actions.setDoNotDisturb(!actions.doNotDisturb);
      },
    },
    {
      label: en.menu.muteAccount,
      type: 'checkbox',
      checked: muted,
      enabled: active !== undefined,
      click: () => {
        actions.setMuted(!muted);
      },
    },
  ];
}

/** The accounts, and maintenance for the active one, for when it misbehaves. */
function accountMenu(actions: MenuActions, keys: Keys): MenuItemConstructorOptions {
  return {
    label: en.menu.account,
    submenu: [
      ...accountItems(actions, keys),
      { type: 'separator' },
      { label: en.menu.addAccount, click: actions.addAccount },
      { label: en.menu.manageAccounts, click: actions.openAccounts },
      {
        label: en.menu.removeAccount,
        enabled: running(actions).length > 1,
        click: actions.removeAccount,
      },
      { type: 'separator' },
      ...quietItems(actions),
      { type: 'separator' },
      { label: en.menu.newChat, click: actions.openNewChat },
      { type: 'separator' },
      { label: en.menu.clearCache, click: actions.clearCache },
      { type: 'separator' },
      { label: en.menu.resetSession, click: actions.resetSession },
    ],
  };
}

/** The assistant's actions and its settings, which open at the assistant (ADR 0017). */
function assistantMenu(actions: MenuActions, keys: Keys): MenuItemConstructorOptions {
  return {
    label: en.menu.assistant,
    submenu: [
      {
        label: en.menu.assistantSuggest,
        ...keyed('assistantSuggest', keys),
        click: actions.assistant.suggest,
      },
      {
        label: en.menu.assistantSummarize,
        ...keyed('assistantSummarize', keys),
        click: actions.assistant.summarize,
      },
      {
        label: en.menu.assistantCatchUp,
        ...keyed('assistantCatchUp', keys),
        click: actions.assistant.catchUp,
      },
      { type: 'separator' },
      { label: en.menu.assistantSettings, click: actions.openSettings },
    ],
  };
}

/**
 * The application menu: the platform's standard menus, with About opening
 * YapYap's own window instead of the stock panel. Settings sits where each
 * platform expects it, on the conventional shortcut.
 */
function commonItems(
  actions: MenuActions,
  keys: Keys,
): Record<'about' | 'settings' | 'help', MenuItemConstructorOptions[]> {
  const about: MenuItemConstructorOptions = {
    label: en.menu.about({ product: PRODUCT_NAME }),
    click: actions.openAbout,
  };
  const diagnostics: MenuItemConstructorOptions = {
    label: en.menu.copyDiagnostics,
    click: actions.copyDiagnostics,
  };
  const settings: MenuItemConstructorOptions = {
    label: en.menu.settings,
    ...keyed('settings', keys),
    click: actions.openSettings,
  };
  const shortcuts: MenuItemConstructorOptions = {
    label: en.menu.shortcuts,
    ...keyed('shortcuts', keys),
    click: actions.openShortcuts,
  };
  const report: MenuItemConstructorOptions = {
    label: en.menu.reportProblem,
    click: actions.openReport,
  };
  const trace: MenuItemConstructorOptions = {
    label: en.menu.recordTrace,
    click: actions.recordTrace,
  };
  return { about: [about], settings: [settings], help: [shortcuts, report, diagnostics, trace] };
}

/** The user's own code sits beside Settings, as Settings is where Developer Mode lives. */
function customCode(actions: MenuActions): MenuItemConstructorOptions {
  return { label: en.menu.customCode, click: actions.openCustomCode };
}

export function buildMenuTemplate(
  platform: string,
  actions: MenuActions,
  custom: CustomShortcuts = {},
): MenuItemConstructorOptions[] {
  const keys = { platform, custom };
  const { about, settings, help } = commonItems(actions, keys);
  const quit: MenuItemConstructorOptions = { role: 'quit', ...keyed('quit', keys) };
  const standard: MenuItemConstructorOptions[] = [
    editMenu(keys),
    viewMenu(actions, keys),
    windowMenu(actions, keys),
  ];
  if (platform !== 'darwin') {
    const file: MenuItemConstructorOptions = {
      label: en.menu.file,
      submenu: [...settings, customCode(actions), { type: 'separator' }, quit],
    };
    return [
      file,
      accountMenu(actions, keys),
      assistantMenu(actions, keys),
      ...standard,
      { role: 'help', submenu: [...about, { type: 'separator' }, ...help] },
    ];
  }
  return [
    macAppMenu([...about], [...settings, customCode(actions)], quit, keys),
    { role: 'fileMenu' },
    accountMenu(actions, keys),
    assistantMenu(actions, keys),
    ...standard,
    { role: 'help', submenu: help },
  ];
}

function macAppMenu(
  about: MenuItemConstructorOptions[],
  settings: MenuItemConstructorOptions[],
  quit: MenuItemConstructorOptions,
  keys: Keys,
): MenuItemConstructorOptions {
  return {
    label: PRODUCT_NAME,
    submenu: [
      ...about,
      { type: 'separator' },
      ...settings,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', ...keyed('hide', keys) },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      quit,
    ],
  };
}
