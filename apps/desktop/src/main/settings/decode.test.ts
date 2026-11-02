import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeSettings, defaultSettings } from './decode.ts';

const DEFAULTS = {
  schemaVersion: 1,
  general: {
    language: 'system',
    startMinimized: false,
    autostart: false,
    closeToTray: false,
    betaUpdates: false,
    doNotDisturb: false,
  },
  appearance: {
    theme: 'system',
    zoom: 1,
    pinchZoom: true,
    autoHideMenuBar: false,
    compactSidebar: false,
    trayIcon: 'color',
  },
  reliability: {
    hardwareAcceleration: true,
    hardwareVideoDecoding: true,
    memoryWatchdogMb: 2048,
    diskCacheMb: 'auto',
    jsHeapMb: 'auto',
    displayBackend: 'auto',
  },
  privacy: {
    crashReports: 'off',
    unreadWhileHidden: true,
    notificationSender: true,
    notificationText: true,
    blurWhenUnfocused: false,
    blurWhenIdle: false,
  },
  network: { proxyMode: 'system', proxyServer: '' },
  assistant: {
    enabled: true,
    provider: 'auto',
    model: 'auto',
    autoSuggest: true,
    messages: '10',
    localServer: '',
  },
  agents: { enabled: false, port: 0 },
  shortcuts: { custom: {}, global: { toggleWindow: '' } },
  downloads: { askWhere: false, openWhenDone: false, folder: '' },
  spelling: { enabled: false, languages: [] },
};

/**
 * Every value each choice accepts, written out rather than read from the
 * schema, so dropping or misspelling one there fails here.
 */
const CHOICES: Readonly<Record<string, readonly string[]>> = {
  'appearance.theme': ['system', 'light', 'dark'],
  'appearance.trayIcon': ['color', 'auto', 'light', 'dark'],
  'reliability.diskCacheMb': ['auto', '128', '256', '512', '1024'],
  'reliability.jsHeapMb': ['auto', '2048', '4096', '8192'],
  'reliability.displayBackend': ['auto', 'wayland', 'x11'],
  'privacy.crashReports': ['off', 'local', 'ask'],
  'network.proxyMode': ['system', 'direct', 'manual'],
  'assistant.provider': ['auto', 'built-in', 'anthropic', 'openai', 'local'],
  'assistant.messages': ['5', '10', '20'],
};

/** The defaults with one setting changed. */
function withValue(id: string, value: unknown): Record<string, unknown> {
  const [section = '', key = ''] = id.split('.');
  const defaults = DEFAULTS as unknown as Record<string, Record<string, unknown>>;
  return { ...DEFAULTS, [section]: { ...defaults[section], [key]: value } };
}

describe('defaultSettings', () => {
  it('gives every setting its default', () => {
    expect(defaultSettings()).toEqual(DEFAULTS);
  });
});

describe('decodeSettings', () => {
  it('reads a valid file unchanged', () => {
    const settings = {
      ...DEFAULTS,
      appearance: {
        theme: 'dark',
        zoom: 1.25,
        pinchZoom: true,
        autoHideMenuBar: true,
        compactSidebar: true,
        trayIcon: 'auto',
      },
    };
    expect(decodeSettings(JSON.stringify(settings))).toEqual({ kind: 'ok', settings, reset: [] });
  });

  it('fills in missing sections and values with defaults', () => {
    expect(decodeSettings('{"schemaVersion":1,"general":{"language":"pt"}}')).toEqual({
      kind: 'ok',
      settings: { ...DEFAULTS, general: { ...DEFAULTS.general, language: 'pt' } },
      reset: [],
    });
  });

  it('resets only the invalid values and reports which', () => {
    const decoded = decodeSettings(
      JSON.stringify({
        ...DEFAULTS,
        general: { ...DEFAULTS.general, language: 'pt', startMinimized: 'yes' },
        appearance: { theme: 'neon', zoom: 9 },
      }),
    );
    expect(decoded).toEqual({
      kind: 'ok',
      settings: { ...DEFAULTS, general: { ...DEFAULTS.general, language: 'pt' } },
      reset: ['/general/startMinimized', '/appearance/theme', '/appearance/zoom'],
    });
  });

  it('drops unknown keys', () => {
    const decoded = decodeSettings(JSON.stringify({ ...DEFAULTS, secrets: { token: 'x' } }));
    expect(decoded.kind === 'ok' && 'secrets' in decoded.settings).toBe(false);
  });

  it.each([0, 2])('treats a complete file of version %i as corrupt', (schemaVersion) => {
    expect(decodeSettings(JSON.stringify({ ...DEFAULTS, schemaVersion }))).toEqual({
      kind: 'corrupt',
    });
  });

  it('accepts every option of each choice', () => {
    for (const theme of ['system', 'light', 'dark']) {
      for (const crashReports of ['off', 'local', 'ask']) {
        const settings = {
          ...DEFAULTS,
          appearance: {
            theme,
            zoom: 1,
            pinchZoom: true,
            autoHideMenuBar: false,
            compactSidebar: false,
            trayIcon: 'color',
          },
          privacy: {
            crashReports,
            unreadWhileHidden: true,
            notificationSender: true,
            notificationText: true,
            blurWhenUnfocused: false,
            blurWhenIdle: false,
          },
        };
        expect(decodeSettings(JSON.stringify(settings))).toEqual({
          kind: 'ok',
          settings,
          reset: [],
        });
      }
    }
  });

  it('keeps each spelling language once, and repairs a list that cannot be one', () => {
    const decode = (spelling: object) => decodeSettings(JSON.stringify({ ...DEFAULTS, spelling }));
    const valid = { enabled: true, languages: ['en-GB', 'pt-PT', 'de'] };
    expect(decode(valid)).toMatchObject({ settings: { spelling: valid }, reset: [] });
    expect(decode({ enabled: true, languages: ['en-GB', 'en-GB'] })).toMatchObject({
      settings: { spelling: { languages: ['en-GB'] } },
      reset: ['/spelling/languages'],
    });
    // Too long to be a language: emptied, which no dictionary is called.
    expect(decode({ enabled: true, languages: ['x'.repeat(36)] })).toMatchObject({
      settings: { spelling: { languages: [''] } },
      reset: ['/spelling/languages/0'],
    });
    expect(decode({ enabled: true, languages: 'en-GB' })).toMatchObject({
      settings: { spelling: { languages: [] } },
    });
    expect(decode({ ...valid, extra: 1 })).toMatchObject({ settings: { spelling: valid } });
  });

  it('keeps chosen keys only for shortcuts YapYap has, and only short ones', () => {
    const decode = (custom: object) =>
      decodeSettings(JSON.stringify({ ...DEFAULTS, shortcuts: { custom } }));
    expect(decode({ settings: 'Alt+S' })).toMatchObject({
      settings: { shortcuts: { custom: { settings: 'Alt+S' } } },
      reset: [],
    });
    expect(decode({ nothing: 'Alt+S' })).toMatchObject({ settings: { shortcuts: { custom: {} } } });
    expect(decode({ settings: 'K'.repeat(65) })).toMatchObject({
      reset: ['/shortcuts/custom/settings'],
    });
  });

  it('drops unknown keys inside every section', () => {
    const sections = Object.keys(DEFAULTS).filter((key) => key !== 'schemaVersion');
    for (const section of sections) {
      const decoded = decodeSettings(JSON.stringify(withValue(`${section}.extra`, 1)));
      expect(decoded.kind === 'ok' && decoded.settings, section).toEqual(DEFAULTS);
    }
  });

  it.each(Object.entries(CHOICES))(
    'keeps every value %s accepts, and nothing else',
    (id, values) => {
      for (const value of values) {
        expect(decodeSettings(JSON.stringify(withValue(id, value)))).toEqual({
          kind: 'ok',
          settings: withValue(id, value),
          reset: [],
        });
      }
      expect(decodeSettings(JSON.stringify(withValue(id, 'other')))).toMatchObject({
        reset: [`/${id.replace('.', '/')}`],
      });
    },
  );

  it.each([
    '',
    'not json',
    '[]',
    'null',
    '"text"',
    '{}',
    '{"schemaVersion":0}',
    '{"schemaVersion":"1"}',
  ])('treats %j as corrupt', (text) => {
    expect(decodeSettings(text)).toEqual({ kind: 'corrupt' });
  });

  it('never throws and always yields complete settings for any JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.boolean(), (value, versioned) => {
        const input =
          versioned && typeof value === 'object' && value !== null && !Array.isArray(value)
            ? { ...value, schemaVersion: 1 }
            : value;
        const decoded = decodeSettings(JSON.stringify(input));
        if (decoded.kind !== 'corrupt') {
          expect(Object.keys(decoded.settings).sort()).toEqual(Object.keys(DEFAULTS).sort());
        }
      }),
    );
  });
});
