import { en } from './messages/en.ts';

/** A value the settings window can show and change. */
export type SettingValue = boolean | string | number;

/** A settings file section, in the order the settings window lists them. */
export const SETTINGS_SECTIONS = [
  { id: 'assistant', title: en.settings.sections.assistant },
  { id: 'general', title: en.settings.sections.general },
  { id: 'spelling', title: en.settings.sections.spelling },
  { id: 'appearance', title: en.settings.sections.appearance },
  { id: 'reliability', title: en.settings.sections.reliability },
  { id: 'downloads', title: en.settings.sections.downloads },
  { id: 'privacy', title: en.settings.sections.privacy },
  { id: 'network', title: en.settings.sections.network },
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

export interface SettingField {
  /** `section.key` in the settings file. */
  readonly id: `${SettingsSection}.${string}`;
  readonly label: string;
  readonly description: string;
  /** Takes effect only at the next launch, so changing it offers a restart. */
  readonly restart: boolean;
  /** One of several values; without options, the setting is an on/off switch. */
  readonly options?: readonly { readonly value: string | number; readonly label: string }[];
  /** A line of text, such as an address, instead of a switch or a choice. */
  readonly text?: { readonly placeholder: string };
  /** A folder, picked in the system's folder dialog; empty is the default folder, named here. */
  readonly folder?: { readonly defaultName: string; readonly useDefault: string };
  /** The platforms (`process.platform`) where it does something; all of them when absent. */
  readonly platforms?: readonly string[];
}

const text = en.settings.fields;

type Texts = typeof text;

/**
 * Only settings with catalog text compile, so a field can never lack its
 * label. The catalog nests them by section, since translation tools read a
 * `.` in a key as nesting (#374).
 */
function described<S extends keyof Texts>(
  section: S,
  key: keyof Texts[S] & string,
): Pick<SettingField, 'id' | 'label' | 'description'> {
  const { label, description } = text[section][key] as { label: string; description: string };
  return { id: `${section}.${key}`, label, description };
}

/** Catalog option keys are the stored values, listed in catalog order. */
function choices(options: Readonly<Record<string, string>>): NonNullable<SettingField['options']> {
  return Object.entries(options).map(([value, label]) => ({ value, label }));
}

/** WhatsApp's zoom in Settings: common steps; the View menu goes finer and up to 300%. */
const INTERFACE_SCALES = [
  { factor: 0.5 },
  { factor: 0.75 },
  { factor: 0.9 },
  { factor: 1 },
  { factor: 1.1 },
  { factor: 1.25 },
  { factor: 1.5 },
  { factor: 1.75 },
  { factor: 2 },
].map(({ factor }) => factor);

/**
 * What the settings window shows. A setting appears here only once YapYap
 * acts on it, so the window never offers a switch that does nothing.
 */
export const SETTING_FIELDS: readonly SettingField[] = [
  { ...described('assistant', 'enabled'), restart: false },
  {
    ...described('assistant', 'provider'),
    restart: false,
    options: choices(text.assistant.provider.options),
  },
  {
    ...described('assistant', 'model'),
    restart: false,
    text: { placeholder: en.assistant.settings.model.auto },
  },
  { ...described('assistant', 'autoSuggest'), restart: false },
  {
    ...described('assistant', 'messages'),
    restart: false,
    options: choices(text.assistant.messages.options),
  },
  {
    ...described('assistant', 'localServer'),
    restart: false,
    text: { placeholder: en.assistant.settings.local.addressPlaceholder },
  },
  { ...described('general', 'autostart'), restart: false },
  { ...described('general', 'startMinimized'), restart: false },
  { ...described('general', 'betaUpdates'), restart: false },
  { ...described('general', 'doNotDisturb'), restart: false },
  // macOS always keeps YapYap in the Dock when the window closes.
  { ...described('general', 'closeToTray'), restart: false, platforms: ['linux', 'win32'] },
  { ...described('spelling', 'enabled'), restart: false },
  {
    ...described('appearance', 'theme'),
    restart: false,
    options: choices(text.appearance.theme.options),
  },
  { ...described('appearance', 'autoHideMenuBar'), restart: false, platforms: ['linux', 'win32'] },
  {
    ...described('appearance', 'zoom'),
    restart: false,
    options: INTERFACE_SCALES.map((value) => ({
      value,
      label: en.settings.scale({ percent: Math.round(value * 100) }),
    })),
  },
  { ...described('appearance', 'pinchZoom'), restart: false },
  { ...described('appearance', 'compactSidebar'), restart: false },
  {
    ...described('appearance', 'trayIcon'),
    restart: false,
    options: choices(text.appearance.trayIcon.options),
  },
  { ...described('reliability', 'hardwareAcceleration'), restart: true },
  {
    ...described('reliability', 'displayBackend'),
    restart: true,
    options: choices(text.reliability.displayBackend.options),
    platforms: ['linux'],
  },
  { ...described('reliability', 'hardwareVideoDecoding'), restart: true },
  {
    ...described('reliability', 'diskCacheMb'),
    restart: true,
    options: choices(text.reliability.diskCacheMb.options),
  },
  {
    ...described('reliability', 'jsHeapMb'),
    restart: true,
    options: choices(text.reliability.jsHeapMb.options),
  },
  {
    ...described('privacy', 'crashReports'),
    restart: false,
    options: choices(text.privacy.crashReports.options),
  },
  { ...described('privacy', 'unreadWhileHidden'), restart: false },
  { ...described('privacy', 'notificationSender'), restart: false },
  { ...described('privacy', 'notificationText'), restart: false },
  { ...described('privacy', 'blurWhenUnfocused'), restart: false },
  { ...described('privacy', 'blurWhenIdle'), restart: false },
  { ...described('downloads', 'askWhere'), restart: false },
  {
    ...described('downloads', 'folder'),
    restart: false,
    folder: { defaultName: en.settings.defaultFolder, useDefault: en.settings.useDefaultFolder },
  },
  { ...described('downloads', 'openWhenDone'), restart: false },
  {
    ...described('network', 'proxyMode'),
    restart: false,
    options: choices(text.network.proxyMode.options),
  },
  {
    ...described('network', 'proxyServer'),
    restart: false,
    text: { placeholder: en.settings.proxyPlaceholder },
  },
];
