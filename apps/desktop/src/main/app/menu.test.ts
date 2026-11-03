import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { AccountSummary } from '../../shared/api/chrome-api.ts';
import { buildMenuTemplate } from './menu.ts';

function actions(accounts: AccountSummary[] = []) {
  return {
    accounts,
    switchAccount: vi.fn(),
    addAccount: vi.fn(),
    openAccounts: vi.fn(),
    removeAccount: vi.fn(),
    doNotDisturb: false,
    setDoNotDisturb: vi.fn(),
    setMuted: vi.fn(),
    openAbout: vi.fn(),
    openSettings: vi.fn(),
    openCustomCode: vi.fn(),
    openNewChat: vi.fn(),
    clearCache: vi.fn(),
    resetSession: vi.fn(),
    zoom: vi.fn(),
    privacyScreen: false,
    togglePrivacyScreen: vi.fn(),
    copyDiagnostics: vi.fn(),
    openShortcuts: vi.fn(),
    openDownloads: vi.fn(),
    openReport: vi.fn(),
    recordTrace: vi.fn(),
    assistant: { suggest: vi.fn(), summarize: vi.fn(), catchUp: vi.fn() },
  };
}

const ACCOUNT = (a: ReturnType<typeof actions>) => ({
  label: '&Account',
  submenu: [
    { type: 'separator' },
    { label: 'Add Account', click: a.addAccount },
    { label: 'Manage Accounts…', click: a.openAccounts },
    { label: 'Remove Account…', enabled: false, click: a.removeAccount },
    { type: 'separator' },
    expect.objectContaining({ label: 'Do Not Disturb', type: 'checkbox', checked: false }),
    expect.objectContaining({
      label: 'Mute This Account',
      type: 'checkbox',
      checked: false,
      enabled: false,
    }),
    { type: 'separator' },
    { label: 'New Chat with Number…', click: a.openNewChat },
    { type: 'separator' },
    { label: 'Clear Cache and Reload', click: a.clearCache },
    { type: 'separator' },
    { label: 'Reset Session…', click: a.resetSession },
  ],
});

const items = (menu: MenuItemConstructorOptions | undefined) =>
  Array.isArray(menu?.submenu) ? menu.submenu : [];

describe('buildMenuTemplate', () => {
  it('lists the accounts by position, marks the active one and switches on click', () => {
    const accounts = Array.from({ length: 10 }, (_, index) => ({
      id: `id-${String(index)}`,
      name: `Account ${String(index + 1)}`,
      color: 'green',
      enabled: true,
      muted: false,
      proxy: '',
      active: index === 1,
    }));
    accounts.push({
      id: 'off',
      name: 'Switched off',
      color: 'red',
      enabled: false,
      muted: false,
      proxy: '',
      active: false,
    });
    const a = actions(accounts);
    const menu = buildMenuTemplate('linux', a).find((entry) => entry.label === '&Account');
    const entries = items(menu);
    expect(entries.slice(0, 2)).toEqual([
      expect.objectContaining({
        label: 'Account 1',
        type: 'radio',
        checked: false,
        accelerator: 'CmdOrCtrl+1',
      }),
      expect.objectContaining({ label: 'Account 2', checked: true, accelerator: 'CmdOrCtrl+2' }),
    ]);
    expect(entries[8]).toHaveProperty('accelerator', 'CmdOrCtrl+9');
    expect(entries[9]).not.toHaveProperty('accelerator');
    expect(entries.find((entry) => entry.label === 'Switched off')).toBeUndefined();
    entries[0]?.click?.(undefined as never, undefined, undefined as never);
    expect(a.switchAccount).toHaveBeenCalledWith('id-0');
    expect(entries.find((entry) => entry.label === 'Remove Account…')).toHaveProperty(
      'enabled',
      true,
    );
  });

  it('turns the privacy screen on and off from the View menu', () => {
    const a = { ...actions(), privacyScreen: true };
    const view = buildMenuTemplate('linux', a).find((menu) => menu.label === '&View');
    const screen = items(view).find((item) => item.label === 'Privacy Screen');
    expect(screen).toMatchObject({
      type: 'checkbox',
      checked: true,
      accelerator: 'CmdOrCtrl+Shift+H',
    });
    expect(screen?.click).toBe(a.togglePrivacyScreen);
  });

  it('zooms the WhatsApp view in 5% steps from the View menu', () => {
    const a = actions();
    const view = buildMenuTemplate('linux', a).find((menu) => menu.label === '&View');
    const entries = items(view);
    expect(entries.map((item) => item.role ?? item.label ?? item.type)).toEqual([
      'reload',
      'forceReload',
      'toggleDevTools',
      'separator',
      'Actual Size',
      'Zoom In',
      'Zoom Out',
      'separator',
      'Privacy Screen',
      'togglefullscreen',
    ]);
    const zoomItems = entries.slice(4, 7);
    expect(zoomItems.map((item) => item.accelerator)).toEqual([
      'CmdOrCtrl+0',
      'CmdOrCtrl+=',
      'CmdOrCtrl+-',
    ]);
    for (const item of zoomItems) {
      (item.click as () => void)();
    }
    expect(a.zoom.mock.calls).toEqual([['reset'], ['in'], ['out']]);
  });

  it('puts Settings in the File menu and About in the Help menu on Windows and Linux', () => {
    const a = actions();
    const template = buildMenuTemplate('linux', a);
    expect(template.map((item) => item.role ?? item.label)).toEqual([
      '&File',
      '&Account',
      'A&ssistant',
      '&Edit',
      '&View',
      '&Window',
      'help',
    ]);
    expect(items(template[0])).toEqual([
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: a.openSettings },
      { label: 'Custom CSS and JavaScript…', click: a.openCustomCode },
      { type: 'separator' },
      { role: 'quit', accelerator: 'CmdOrCtrl+Q' },
    ]);
    expect(items(template.at(-1))).toEqual([
      { label: 'About YapYap', click: a.openAbout },
      { type: 'separator' },
      { label: 'Keyboard Shortcuts…', accelerator: 'CmdOrCtrl+/', click: a.openShortcuts },
      { label: 'Report a Problem…', click: a.openReport },
      { label: 'Copy Diagnostics', click: a.copyDiagnostics },
      { label: 'Record a Performance Trace…', click: a.recordTrace },
    ]);
    expect(template[1]).toEqual(ACCOUNT(a));
  });

  it('gives the assistant a menu of its own, with its actions’ keys and its settings', () => {
    const a = actions();
    const menu = buildMenuTemplate('linux', a).find((entry) => entry.label === 'A&ssistant');
    expect(items(menu)).toEqual([
      { label: 'Suggest Replies', accelerator: 'CmdOrCtrl+Shift+Y', click: a.assistant.suggest },
      {
        label: 'Summarize This Chat',
        accelerator: 'CmdOrCtrl+Shift+L',
        click: a.assistant.summarize,
      },
      {
        label: 'Catch Up on Unread Chats',
        accelerator: 'CmdOrCtrl+Shift+U',
        click: a.assistant.catchUp,
      },
      { type: 'separator' },
      { label: 'Assistant Settings…', click: a.openSettings },
    ]);
  });

  it('turns do not disturb on and off, and mutes or unmutes the account on screen', () => {
    const entry = { id: 'a', name: 'Work', color: 'blue', enabled: true, proxy: '', active: true };
    const item = (a: ReturnType<typeof actions>, label: string) => {
      const found = items(buildMenuTemplate('linux', a)[1]).find((each) => each.label === label);
      if (found?.click === undefined) {
        throw new Error(`No ${label} item.`);
      }
      return { ...found, click: found.click as () => void };
    };
    const off = actions([{ ...entry, muted: false }]);
    item(off, 'Do Not Disturb').click();
    item(off, 'Mute This Account').click();
    expect(off.setDoNotDisturb).toHaveBeenCalledWith(true);
    expect(off.setMuted).toHaveBeenCalledWith(true);
    const on = { ...actions([{ ...entry, muted: true }]), doNotDisturb: true };
    const dnd = item(on, 'Do Not Disturb');
    const mute = item(on, 'Mute This Account');
    expect(dnd.checked).toBe(true);
    expect(mute).toMatchObject({ checked: true, enabled: true });
    dnd.click();
    mute.click();
    expect(on.setDoNotDisturb).toHaveBeenCalledWith(false);
    expect(on.setMuted).toHaveBeenCalledWith(false);
  });

  it('puts About, Settings and custom code in the app menu on macOS', () => {
    const a = actions();
    const [appMenu, ...rest] = buildMenuTemplate('darwin', a);
    expect(appMenu?.label).toBe('YapYap');
    const entries = items(appMenu);
    expect(entries[0]).toEqual({ label: 'About YapYap', click: a.openAbout });
    expect(entries[2]).toEqual({
      label: 'Settings…',
      accelerator: 'CmdOrCtrl+,',
      click: a.openSettings,
    });
    expect(entries[3]).toEqual({ label: 'Custom CSS and JavaScript…', click: a.openCustomCode });
    expect(entries.map((item) => item.role ?? item.type)).toEqual([
      undefined,
      'separator',
      undefined,
      undefined,
      'separator',
      'services',
      'separator',
      'hide',
      'hideOthers',
      'unhide',
      'separator',
      'quit',
    ]);
    expect(entries.find((item) => item.role === 'hide')?.accelerator).toBe('Cmd+H');
    expect(rest.map((item) => item.role ?? item.label)).toEqual([
      'fileMenu',
      '&Account',
      'A&ssistant',
      '&Edit',
      '&View',
      'windowMenu',
      'help',
    ]);
    expect(items(rest.at(-1))).toEqual([
      { label: 'Keyboard Shortcuts…', accelerator: 'CmdOrCtrl+/', click: a.openShortcuts },
      { label: 'Report a Problem…', click: a.openReport },
      { label: 'Copy Diagnostics', click: a.copyDiagnostics },
      { label: 'Record a Performance Trace…', click: a.recordTrace },
    ]);
    expect(rest[1]).toEqual(ACCOUNT(a));
  });
});

describe('the standard menus', () => {
  const keys = (menu: MenuItemConstructorOptions | undefined) =>
    items(menu).map((item) => [item.role ?? item.type, item.accelerator]);

  it('edits with the usual keys, plain-text paste included', () => {
    const linux = buildMenuTemplate('linux', actions());
    expect(keys(linux.find((menu) => menu.label === '&Edit'))).toEqual([
      ['undo', 'CmdOrCtrl+Z'],
      ['redo', 'CmdOrCtrl+Y'],
      ['separator', undefined],
      ['cut', 'CmdOrCtrl+X'],
      ['copy', 'CmdOrCtrl+C'],
      ['paste', 'CmdOrCtrl+V'],
      ['pasteAndMatchStyle', 'CmdOrCtrl+Shift+V'],
      ['selectAll', 'CmdOrCtrl+A'],
    ]);
    const mac = buildMenuTemplate('darwin', actions()).find((menu) => menu.label === '&Edit');
    expect(keys(mac)[1]).toEqual(['redo', 'Shift+Cmd+Z']);
  });

  it('keeps the window list in the Window menu on macOS only, and Downloads in every one', () => {
    const a = actions();
    const linux = buildMenuTemplate('linux', a).find((menu) => menu.label === '&Window');
    expect(linux?.role).toBeUndefined();
    expect(keys(linux)).toEqual([
      ['minimize', 'CmdOrCtrl+M'],
      ['close', 'CmdOrCtrl+W'],
      ['separator', undefined],
      [undefined, 'CmdOrCtrl+J'],
    ]);
    expect(items(linux).at(-1)).toMatchObject({ label: 'Downloads…', click: a.openDownloads });
    const mac = buildMenuTemplate('darwin', actions()).find((menu) => menu.label === '&Window');
    expect(mac?.role).toBe('windowMenu');
    expect(keys(mac)).toEqual([
      ['minimize', 'CmdOrCtrl+M'],
      ['close', 'CmdOrCtrl+W'],
      ['zoom', undefined],
      ['separator', undefined],
      ['front', undefined],
      ['separator', undefined],
      [undefined, 'Shift+Cmd+J'],
    ]);
  });

  it('quits with a key on Linux and macOS, and leaves Windows its own Alt+F4', () => {
    const windows = buildMenuTemplate('win32', actions())[0];
    expect(items(windows).at(-1)).toEqual({ role: 'quit' });
  });
});

describe('custom shortcuts in the menus', () => {
  it('puts the keys the user chose on the menu items, switching accounts included', () => {
    const accounts = [
      {
        id: 'a',
        name: 'Work',
        color: 'blue',
        enabled: true,
        muted: false,
        proxy: '',
        active: true,
      },
      {
        id: 'b',
        name: 'Home',
        color: 'red',
        enabled: true,
        muted: false,
        proxy: '',
        active: false,
      },
    ];
    const template = buildMenuTemplate('linux', actions(accounts), {
      settings: 'Alt+S',
      switchAccount: 'Alt+1',
      quit: 'Ctrl+Alt+Q',
    });
    const file = items(template[0]);
    expect(file[0]).toMatchObject({ label: 'Settings…', accelerator: 'Alt+S' });
    expect(file.at(-1)).toEqual({ role: 'quit', accelerator: 'Ctrl+Alt+Q' });
    expect(
      items(template[1])
        .slice(0, 2)
        .map((item) => item.accelerator),
    ).toEqual(['Alt+1', 'Alt+2']);
  });
});
