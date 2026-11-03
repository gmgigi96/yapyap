import { Type, type Static, type TString } from 'typebox';
import { MAX_SPELLING_LANGUAGES } from '../../shared/api/chrome-api.ts';
import { MAX_PROXY_ADDRESS, PROXY_ADDRESS } from '../../shared/proxy-address.ts';
import { SHORTCUT_IDS, type ShortcutId } from '../../shared/shortcuts.ts';
import { LOCAL_SERVER } from '../../shared/local-server.ts';

/**
 * The settings file's shape (ADR 0006). The TypeScript type is derived from
 * it, so the schema is the only source of truth. Every value has a default,
 * which is what an invalid or missing value falls back to.
 */
export const SETTINGS_VERSION = 1;

export const SettingsSchema = Type.Object(
  {
    schemaVersion: Type.Literal(SETTINGS_VERSION),
    general: Type.Object(
      {
        language: Type.String({ default: 'system', maxLength: 35 }),
        startMinimized: Type.Boolean({ default: false }),
        autostart: Type.Boolean({ default: false }),
        closeToTray: Type.Boolean({ default: false }),
        betaUpdates: Type.Boolean({ default: false }),
        doNotDisturb: Type.Boolean({ default: false }),
      },
      { default: {}, additionalProperties: false },
    ),
    spelling: Type.Object(
      {
        enabled: Type.Boolean({ default: false }),
        // Empty means the system language. Codes such as en-GB are only ever
        // used when Chromium has a dictionary of that name, so the schema
        // checks no pattern: a pattern would leave a bad code unrepairable.
        languages: Type.Array(Type.String({ maxLength: 35 }), {
          maxItems: MAX_SPELLING_LANGUAGES,
          uniqueItems: true,
          default: [],
        }),
      },
      { default: {}, additionalProperties: false },
    ),
    appearance: Type.Object(
      {
        theme: Type.Union([Type.Literal('system'), Type.Literal('light'), Type.Literal('dark')], {
          default: 'system',
        }),
        zoom: Type.Number({ minimum: 0.5, maximum: 3, default: 1 }),
        pinchZoom: Type.Boolean({ default: true }),
        autoHideMenuBar: Type.Boolean({ default: false }),
        compactSidebar: Type.Boolean({ default: false }),
        trayIcon: Type.Union(
          [
            Type.Literal('color'),
            Type.Literal('auto'),
            Type.Literal('light'),
            Type.Literal('dark'),
          ],
          { default: 'color' },
        ),
      },
      { default: {}, additionalProperties: false },
    ),
    reliability: Type.Object(
      {
        hardwareAcceleration: Type.Boolean({ default: true }),
        hardwareVideoDecoding: Type.Boolean({ default: true }),
        memoryWatchdogMb: Type.Integer({ minimum: 512, maximum: 16_384, default: 2048 }),
        diskCacheMb: Type.Union(
          [
            Type.Literal('auto'),
            Type.Literal('128'),
            Type.Literal('256'),
            Type.Literal('512'),
            Type.Literal('1024'),
          ],
          { default: 'auto' },
        ),
        jsHeapMb: Type.Union(
          [Type.Literal('auto'), Type.Literal('2048'), Type.Literal('4096'), Type.Literal('8192')],
          { default: 'auto' },
        ),
        displayBackend: Type.Union(
          [Type.Literal('auto'), Type.Literal('wayland'), Type.Literal('x11')],
          { default: 'auto' },
        ),
      },
      { default: {}, additionalProperties: false },
    ),
    downloads: Type.Object(
      {
        askWhere: Type.Boolean({ default: false }),
        openWhenDone: Type.Boolean({ default: false }),
        // Empty means the system's Downloads folder; set only through the folder picker.
        folder: Type.String({ maxLength: 4096, default: '' }),
      },
      { default: {}, additionalProperties: false },
    ),
    privacy: Type.Object(
      {
        crashReports: Type.Union(
          [Type.Literal('off'), Type.Literal('local'), Type.Literal('ask')],
          {
            default: 'off',
          },
        ),
        unreadWhileHidden: Type.Boolean({ default: true }),
        notificationSender: Type.Boolean({ default: true }),
        notificationText: Type.Boolean({ default: true }),
        blurWhenUnfocused: Type.Boolean({ default: false }),
        blurWhenIdle: Type.Boolean({ default: false }),
      },
      { default: {}, additionalProperties: false },
    ),
    network: Type.Object(
      {
        proxyMode: Type.Union(
          [Type.Literal('system'), Type.Literal('direct'), Type.Literal('manual')],
          { default: 'system' },
        ),
        // A scheme, a host and an optional port; credentials never go here (#76).
        proxyServer: Type.String({
          default: '',
          maxLength: MAX_PROXY_ADDRESS,
          pattern: PROXY_ADDRESS,
        }),
      },
      { default: {}, additionalProperties: false },
    ),
    shortcuts: Type.Object(
      {
        // Keys the user chose, by shortcut; YapYap's own apply to the rest.
        custom: Type.Partial(
          Type.Object(
            Object.fromEntries(
              SHORTCUT_IDS.map((id) => [id, Type.String({ maxLength: 64 })]),
            ) as Record<ShortcutId, TString>,
            { additionalProperties: false },
          ),
          { default: {} },
        ),
        // Shortcuts that work from any app; empty means none.
        global: Type.Object(
          { toggleWindow: Type.String({ maxLength: 64, default: '' }) },
          { default: {}, additionalProperties: false },
        ),
      },
      { default: {}, additionalProperties: false },
    ),
    // The AI assistant, part of YapYap (ADR 0017).
    assistant: Type.Object(
      {
        enabled: Type.Boolean({ default: true }),
        // Who answers; `auto` takes the first that is set up (ADR 0017).
        provider: Type.Union(
          [
            Type.Literal('auto'),
            Type.Literal('built-in'),
            Type.Literal('anthropic'),
            Type.Literal('openai'),
            Type.Literal('local'),
          ],
          { default: 'auto' },
        ),
        // `auto`, or a model's ID from the provider's own list.
        model: Type.String({ default: 'auto', minLength: 1, maxLength: 200 }),
        // Suggest replies when a message arrives in the open chat, as the maintainer chose (#468).
        autoSuggest: Type.Boolean({ default: true }),
        // How many of the open chat's latest messages the assistant sends.
        messages: Type.Union([Type.Literal('5'), Type.Literal('10'), Type.Literal('20')], {
          default: '10',
        }),
        // A model server on this computer; loopback only, so nothing else can be named here.
        localServer: Type.String({ default: '', maxLength: 100, pattern: LOCAL_SERVER }),
      },
      { default: {}, additionalProperties: false },
    ),
    // The MCP server for AI agents (ADR 0019): off until the user turns it on.
    agents: Type.Object(
      {
        enabled: Type.Boolean({ default: false }),
        // 0 until YapYap picks one, the first time the server is turned on; then kept.
        port: Type.Integer({ minimum: 0, maximum: 65_535, default: 0 }),
      },
      { default: {}, additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type Settings = Static<typeof SettingsSchema>;
