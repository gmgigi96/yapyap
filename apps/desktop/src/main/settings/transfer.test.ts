import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from './decode.ts';
import { SettingsSchema, SETTINGS_VERSION } from './schema.ts';
import {
  EXPORTED_SECTIONS,
  exportSettings,
  MAX_IMPORT_BYTES,
  readImport,
  SETTINGS_EXPORT_FORMAT,
  keepLocal,
  LOCAL_SECTIONS,
} from './transfer.ts';

const NOT_SETTINGS = { kind: 'rejected', reason: 'That file is not a YapYap settings file.' };

const wrap = (settings: unknown): string =>
  JSON.stringify({ format: SETTINGS_EXPORT_FORMAT, settings });

describe('exportSettings', () => {
  it('has decided, for every section of the schema, that it is safe to export', () => {
    // A failure here means a new section: list it in EXPORTED_SECTIONS only
    // if it holds nothing private, and otherwise keep it out of exports and
    // keep its current values on import.
    expect(Object.keys(SettingsSchema.properties)).toEqual([
      'schemaVersion',
      ...EXPORTED_SECTIONS,
      ...LOCAL_SECTIONS,
    ]);
  });

  it('writes the settings under a format marker, readable by people', () => {
    const settings = defaultSettings();
    const text = exportSettings(settings);
    const { assistant, agents, ...exported } = settings;
    expect(assistant).toMatchObject({ provider: 'auto' });
    expect(agents).toEqual({ enabled: false, port: 0 });
    expect(JSON.parse(text)).toEqual({ format: 'yapyap-settings', settings: exported });
    expect(text).toMatch(/^\{\n {2}"format": "yapyap-settings",\n/);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('leaves out anything the schema does not define, whatever got into memory', () => {
    const settings = { ...defaultSettings(), session: 'cookie=secret' };
    const exported = JSON.parse(exportSettings(settings)) as { settings: Record<string, unknown> };
    const { assistant, agents, ...expected } = defaultSettings();
    expect(assistant).toBeDefined();
    expect(agents).toBeDefined();
    expect(exported.settings).toEqual(expected);
    expect(settings.session).toBe('cookie=secret');
  });
});

describe('readImport', () => {
  it('reads back what was exported', () => {
    const settings = defaultSettings();
    settings.appearance.theme = 'dark';
    settings.reliability.hardwareAcceleration = false;
    expect(readImport(exportSettings(settings))).toEqual({ kind: 'ok', settings, reset: [] });
  });

  it('round-trips any valid theme, zoom and switches', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('system', 'light', 'dark' as const),
        fc.double({ min: 0.5, max: 3, noNaN: true }),
        fc.boolean(),
        (theme, zoom, menu) => {
          const settings = defaultSettings();
          settings.appearance = { ...settings.appearance, theme, zoom, autoHideMenuBar: menu };
          expect(readImport(exportSettings(settings))).toEqual({ kind: 'ok', settings, reset: [] });
        },
      ),
      // Each run checks the whole settings file against its schema, about 10 ms,
      // and six theme and menu pairs need far fewer than the default 100 runs.
      { numRuns: 30 },
    );
  });

  it('resets invalid values to their defaults and lists them', () => {
    const settings = { ...defaultSettings(), appearance: { theme: 'neon', zoom: 9 } };
    const result = readImport(wrap(settings));
    expect(result).toEqual({
      kind: 'ok',
      settings: defaultSettings(),
      reset: ['/appearance/theme', '/appearance/zoom'],
    });
  });

  it('fills in settings the file does not have', () => {
    expect(readImport(wrap({ schemaVersion: SETTINGS_VERSION }))).toEqual({
      kind: 'ok',
      settings: defaultSettings(),
      reset: [],
    });
  });

  it.each([SETTINGS_VERSION - 1, SETTINGS_VERSION + 1])(
    'refuses settings of another version: %i',
    (schemaVersion) => {
      expect(readImport(wrap({ ...defaultSettings(), schemaVersion }))).toEqual({
        kind: 'rejected',
        reason: 'That file is not a YapYap settings file.',
      });
    },
  );

  it('says when a file cannot even be read', () => {
    expect(readImport('{')).toEqual({
      kind: 'rejected',
      reason: 'YapYap could not read that file. It may be damaged.',
    });
  });

  it.each([
    ['JSON that is not an object', '[]'],
    ['null', 'null'],
    ['a number', '5'],
    ['a string', '"yapyap-settings"'],
    ['a plain settings file without the marker', JSON.stringify(defaultSettings())],
    ['another format', JSON.stringify({ format: 'other', settings: defaultSettings() })],
    ['a marker without settings', JSON.stringify({ format: SETTINGS_EXPORT_FORMAT })],
    ['settings that are not an object', wrap(5)],
    ['settings without a version', wrap({ appearance: { theme: 'dark' } })],
  ])('refuses %s', (_name, text) => {
    expect(readImport(text)).toEqual(NOT_SETTINGS);
  });

  it('refuses a file over the size limit, counted in bytes', () => {
    const withNote = (note: string): string =>
      JSON.stringify({ format: SETTINGS_EXPORT_FORMAT, settings: defaultSettings(), note });
    const room = MAX_IMPORT_BYTES - withNote('').length;
    expect(readImport(withNote('e'.repeat(room))).kind).toBe('ok');
    expect(readImport(withNote('e'.repeat(room + 1)))).toEqual(NOT_SETTINGS);
    // As many characters as fit, but each takes two bytes.
    expect(readImport(withNote('é'.repeat(room)))).toEqual(NOT_SETTINGS);
  });
});

describe('keepLocal', () => {
  it('keeps the assistant settings as they are, whatever the imported file says', () => {
    const local = { ...defaultSettings().assistant, provider: 'local', localServer: '' } as const;
    const current = { ...defaultSettings(), assistant: local };
    const imported = {
      ...defaultSettings(),
      general: { ...defaultSettings().general, autostart: true },
      assistant: { ...defaultSettings().assistant, provider: 'openai' } as const,
    };
    expect(keepLocal(imported, current)).toEqual({ ...imported, assistant: local });
    expect(keepLocal(current, imported).assistant).toEqual(imported.assistant);
  });

  it('never lets an imported file turn on the MCP server for agents (ADR 0019)', () => {
    const current = defaultSettings();
    const imported = { ...defaultSettings(), agents: { enabled: true, port: 50_000 } };
    expect(keepLocal(imported, current).agents).toEqual({ enabled: false, port: 0 });
  });
});
