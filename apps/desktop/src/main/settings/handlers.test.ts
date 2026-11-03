import { describe, expect, it, vi } from 'vitest';
import { SETTING_FIELDS } from '../../shared/settings-fields.ts';
import { defaultSettings } from './decode.ts';
import { settingsHandlers, type SettingEffect } from './handlers.ts';
import type { Settings } from './schema.ts';

const HARDWARE = 'reliability.hardwareAcceleration';
const VIDEO = 'reliability.hardwareVideoDecoding';
const THEME = 'appearance.theme';
const MENU_BAR = 'appearance.autoHideMenuBar';
const COMPACT = 'appearance.compactSidebar';
const ZOOM = 'appearance.zoom';
const DISK_CACHE = 'reliability.diskCacheMb';
const JS_HEAP = 'reliability.jsHeapMb';
const PINCH = 'appearance.pinchZoom';
const TRAY_ICON = 'appearance.trayIcon';
const ASK_WHERE = 'downloads.askWhere';
const OPEN_DONE = 'downloads.openWhenDone';
const FOLDER = 'downloads.folder';
const SPELLING = 'spelling.enabled';
const PROXY = 'network.proxyMode';
const PROXY_SERVER = 'network.proxyServer';
const BLUR_UNFOCUSED = 'privacy.blurWhenUnfocused';
const BLUR_IDLE = 'privacy.blurWhenIdle';
const BACKEND = 'reliability.displayBackend';
const CRASH = 'privacy.crashReports';
const UNREAD = 'privacy.unreadWhileHidden';
const SENDER = 'privacy.notificationSender';
const TEXT = 'privacy.notificationText';
const START_MINIMIZED = 'general.startMinimized';
const CLOSE_TO_TRAY = 'general.closeToTray';
const AUTOSTART = 'general.autostart';
const BETA = 'general.betaUpdates';
const DND = 'general.doNotDisturb';

function setup(effects: Readonly<Record<string, SettingEffect>> = {}) {
  let settings: Settings = defaultSettings();
  const service = {
    current: () => settings,
    notice: undefined,
    firstRun: false,
    update: vi.fn((change: (current: Settings) => Settings) => {
      settings = change(settings);
    }),
    onChange: vi.fn(),
  };
  const restart = vi.fn();
  const handlers = new Map(
    settingsHandlers(service, restart, 'linux', effects).map((handler) => [
      handler.channel,
      handler,
    ]),
  );
  const handler = (channel: string) => {
    const found = handlers.get(channel);
    if (found === undefined) {
      throw new Error(`No handler for ${channel}`);
    }
    return found;
  };
  const call = { sender: {} };
  return { service, restart, handler, call, settings: () => settings };
}

describe('settingsHandlers', () => {
  it('registers get, set and restart', () => {
    const t = setup();
    expect(['settings:get', 'settings:set', 'settings:restart'].map(t.handler)).toHaveLength(3);
  });

  it('finds every listed setting in the schema, with the kind of value its control expects', () => {
    const t = setup();
    const snapshot = t.handler('settings:get').handle(t.call) as { values: object };
    const values = Object.entries(snapshot.values);
    expect(values.map(([id]) => id)).toEqual(SETTING_FIELDS.map((field) => field.id));
    SETTING_FIELDS.forEach((field, index) => {
      const value: unknown = values[index]?.[1];
      if (field.options !== undefined) {
        expect(field.options.map((option) => option.value)).toContain(value);
      } else {
        const text = field.text !== undefined || field.folder !== undefined;
        expect(typeof value).toBe(text ? 'string' : 'boolean');
      }
    });
  });

  it('lets the page reset a folder, but never name one', () => {
    const set = setup().handler('settings:set');
    expect(set.accepts([FOLDER, ''])).toBe(true);
    expect(set.accepts([FOLDER, '/home/someone/Elsewhere'])).toBe(false);
  });

  it('saves a proxy address that fits, and refuses one that does not', () => {
    const t = setup();
    const set = t.handler('settings:set');
    expect(set.accepts([PROXY_SERVER, 'socks5://127.0.0.1:1080'])).toBe(true);
    expect(set.accepts([PROXY_SERVER, 'http://proxy.example.org:8080/'])).toBe(true);
    expect(set.accepts([PROXY_SERVER, ''])).toBe(true);
    expect(set.accepts([PROXY_SERVER, 'http://user:secret@proxy.example.org:8080'])).toBe(false);
    expect(set.accepts([PROXY_SERVER, 'ftp://proxy.example.org'])).toBe(false);
    expect(set.accepts([PROXY_SERVER, 'proxy.example.org:8080'])).toBe(false);
  });

  it('accepts each option of a choice and saves it without asking for a restart', async () => {
    const t = setup();
    const set = t.handler('settings:set');
    for (const theme of ['light', 'dark', 'system']) {
      expect(set.accepts([THEME, theme])).toBe(true);
    }
    expect(set.accepts([THEME, 'sepia'])).toBe(false);
    expect(await set.handle(t.call, THEME, 'dark')).toEqual(
      expect.objectContaining({ restartPending: false }),
    );
    expect(t.settings().appearance.theme).toBe('dark');
  });

  it('lists a setting only on the platforms where it does something', () => {
    const service = {
      current: defaultSettings,
      notice: undefined,
      firstRun: false,
      update: vi.fn(),
      onChange: vi.fn(),
    };
    const get = (platform: string) => {
      const handler = settingsHandlers(service, vi.fn(), platform).find(
        ({ channel }) => channel === 'settings:get',
      );
      return handler?.handle({ sender: {} }) as { values: object };
    };
    expect(get('linux').values).toHaveProperty(['appearance.autoHideMenuBar'], false);
    expect(get('darwin').values).not.toHaveProperty(['appearance.autoHideMenuBar']);
    const set = settingsHandlers(service, vi.fn(), 'darwin').find(
      ({ channel }) => channel === 'settings:set',
    );
    expect(set?.accepts(['appearance.autoHideMenuBar', true])).toBe(false);
  });

  it('shows the listed settings as they are', () => {
    const t = setup();
    const get = t.handler('settings:get');
    expect(get.accepts([])).toBe(true);
    expect(get.accepts([1])).toBe(false);
    expect(get.handle(t.call)).toEqual({
      values: {
        [THEME]: 'system',
        [MENU_BAR]: false,
        [ZOOM]: 1,
        [PINCH]: true,
        [COMPACT]: false,
        [TRAY_ICON]: 'color',
        [HARDWARE]: true,
        [BACKEND]: 'auto',
        [VIDEO]: true,
        [DISK_CACHE]: 'auto',
        [JS_HEAP]: 'auto',
        [CRASH]: 'off',
        [UNREAD]: true,
        [SENDER]: true,
        [TEXT]: true,
        [BLUR_UNFOCUSED]: false,
        [BLUR_IDLE]: false,
        [PROXY]: 'system',
        [PROXY_SERVER]: '',
        'assistant.enabled': true,
        'assistant.provider': 'auto',
        'assistant.model': 'auto',
        'assistant.autoSuggest': true,
        'assistant.messages': '10',
        'assistant.localServer': '',
        'agents.enabled': false,
        [ASK_WHERE]: false,
        [OPEN_DONE]: false,
        [FOLDER]: '',
        [SPELLING]: false,
        [AUTOSTART]: false,
        [START_MINIMIZED]: false,
        [BETA]: false,
        [DND]: false,
        [CLOSE_TO_TRAY]: false,
      },
      restartPending: false,
      problems: {},
    });
  });

  it('saves a change only once its effect took hold, and says why when not', async () => {
    const effect = vi.fn<SettingEffect>(() => 'The system refused.');
    const t = setup({ [AUTOSTART]: effect });
    const set = t.handler('settings:set');
    expect(await set.handle(t.call, AUTOSTART, true)).toMatchObject({
      values: { [AUTOSTART]: false },
      problems: { [AUTOSTART]: 'The system refused.' },
    });
    expect(effect).toHaveBeenCalledWith(true);
    expect(t.service.update).not.toHaveBeenCalled();
    effect.mockReturnValue(undefined);
    expect(await set.handle(t.call, AUTOSTART, true)).toMatchObject({
      values: { [AUTOSTART]: true },
      problems: {},
    });
  });

  it('leaves out and refuses the settings this build ignores', () => {
    let settings: Settings = defaultSettings();
    const service = {
      current: () => settings,
      notice: undefined,
      firstRun: false,
      update: vi.fn((change: (current: Settings) => Settings) => {
        settings = change(settings);
      }),
      onChange: vi.fn(),
    };
    const [get, set] = settingsHandlers(service, vi.fn(), 'linux', {}, [BETA]);
    expect(get?.handle({ sender: {} })).toHaveProperty(
      'values',
      expect.not.objectContaining({ [BETA]: false }),
    );
    expect(set?.accepts([BETA, true])).toBe(false);
  });

  it('saves a change and asks for a restart until the launch value is back', async () => {
    const t = setup();
    const set = t.handler('settings:set');
    expect(await set.handle(t.call, HARDWARE, false)).toEqual({
      values: {
        [THEME]: 'system',
        [MENU_BAR]: false,
        [ZOOM]: 1,
        [PINCH]: true,
        [COMPACT]: false,
        [TRAY_ICON]: 'color',
        [HARDWARE]: false,
        [BACKEND]: 'auto',
        [VIDEO]: true,
        [DISK_CACHE]: 'auto',
        [JS_HEAP]: 'auto',
        [CRASH]: 'off',
        [UNREAD]: true,
        [SENDER]: true,
        [TEXT]: true,
        [BLUR_UNFOCUSED]: false,
        [BLUR_IDLE]: false,
        [PROXY]: 'system',
        [PROXY_SERVER]: '',
        'assistant.enabled': true,
        'assistant.provider': 'auto',
        'assistant.model': 'auto',
        'assistant.autoSuggest': true,
        'assistant.messages': '10',
        'assistant.localServer': '',
        'agents.enabled': false,
        [ASK_WHERE]: false,
        [OPEN_DONE]: false,
        [FOLDER]: '',
        [SPELLING]: false,
        [AUTOSTART]: false,
        [START_MINIMIZED]: false,
        [BETA]: false,
        [DND]: false,
        [CLOSE_TO_TRAY]: false,
      },
      restartPending: true,
      problems: {},
    });
    expect(t.settings().reliability.hardwareAcceleration).toBe(false);
    expect(t.settings().reliability.memoryWatchdogMb).toBe(2048);
    expect(t.settings().general).toEqual(defaultSettings().general);
    expect(await set.handle(t.call, HARDWARE, true)).toEqual(
      expect.objectContaining({ restartPending: false }),
    );
  });

  it('accepts only a listed setting with a value its schema allows', () => {
    const set = setup().handler('settings:set');
    expect(set.accepts([HARDWARE, false])).toBe(true);
    expect(set.accepts([HARDWARE, 'no'])).toBe(false);
    expect(set.accepts([HARDWARE])).toBe(false);
    expect(set.accepts([HARDWARE, false, 1])).toBe(false);
    expect(set.accepts(['reliability.memoryWatchdogMb', 4096])).toBe(false);
    expect(set.accepts(['reliability.unknown', true])).toBe(false);
    expect(set.accepts([42, true])).toBe(false);
    expect(set.accepts(['__proto__.polluted', true])).toBe(false);
  });

  it('refuses to save an invalid value that reaches it directly', async () => {
    const t = setup();
    await expect(t.handler('settings:set').handle(t.call, HARDWARE, 'no')).rejects.toThrow(
      'Invalid setting.',
    );
    expect(t.service.update).not.toHaveBeenCalled();
  });

  it('restarts the app on request', () => {
    const t = setup();
    const restart = t.handler('settings:restart');
    expect(restart.accepts([])).toBe(true);
    expect(restart.accepts(['now'])).toBe(false);
    restart.handle(t.call);
    expect(t.restart).toHaveBeenCalledOnce();
  });
});
