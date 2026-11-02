import { en } from './messages/en.ts';
import { isValidShortcut } from './shortcut-keys.ts';

/** A keyboard shortcut YapYap's menus answer to. */
export interface Shortcut {
  readonly id: ShortcutId;
  readonly label: string;
  /** Electron's accelerator; `CmdOrCtrl` is ⌘ on macOS and Ctrl elsewhere. */
  readonly accelerator: string;
  /** Where macOS uses another key, as its own apps do. */
  readonly mac?: string;
  /** The platforms (`process.platform`) that have it; all of them when absent. */
  readonly platforms?: readonly string[];
}

const text = en.shortcuts.actions;

const TABLE = [
  { id: 'settings', label: text.settings, accelerator: 'CmdOrCtrl+,' },
  { id: 'shortcuts', label: text.shortcuts, accelerator: 'CmdOrCtrl+/' },
  { id: 'switchAccount', label: text.switchAccount, accelerator: 'CmdOrCtrl+1' },
  { id: 'privacyScreen', label: text.privacyScreen, accelerator: 'CmdOrCtrl+Shift+H' },
  { id: 'zoomIn', label: text.zoomIn, accelerator: 'CmdOrCtrl+=' },
  { id: 'zoomOut', label: text.zoomOut, accelerator: 'CmdOrCtrl+-' },
  { id: 'actualSize', label: text.actualSize, accelerator: 'CmdOrCtrl+0' },
  { id: 'reload', label: text.reload, accelerator: 'CmdOrCtrl+R' },
  { id: 'forceReload', label: text.forceReload, accelerator: 'CmdOrCtrl+Shift+R' },
  { id: 'fullScreen', label: text.fullScreen, accelerator: 'F11', mac: 'Ctrl+Cmd+F' },
  { id: 'devTools', label: text.devTools, accelerator: 'CmdOrCtrl+Shift+I', mac: 'Alt+Cmd+I' },
  { id: 'undo', label: text.undo, accelerator: 'CmdOrCtrl+Z' },
  { id: 'redo', label: text.redo, accelerator: 'CmdOrCtrl+Y', mac: 'Shift+Cmd+Z' },
  { id: 'cut', label: text.cut, accelerator: 'CmdOrCtrl+X' },
  { id: 'copy', label: text.copy, accelerator: 'CmdOrCtrl+C' },
  { id: 'paste', label: text.paste, accelerator: 'CmdOrCtrl+V' },
  {
    id: 'pastePlain',
    label: text.pastePlain,
    accelerator: 'CmdOrCtrl+Shift+V',
    mac: 'Alt+Shift+Cmd+V',
  },
  { id: 'selectAll', label: text.selectAll, accelerator: 'CmdOrCtrl+A' },
  { id: 'minimize', label: text.minimize, accelerator: 'CmdOrCtrl+M' },
  { id: 'close', label: text.close, accelerator: 'CmdOrCtrl+W' },
  { id: 'downloads', label: text.downloads, accelerator: 'CmdOrCtrl+J', mac: 'Shift+Cmd+J' },
  // WhatsApp Web keeps Ctrl+Alt and Ctrl+Shift with brackets for itself, so these stay clear of both.
  { id: 'assistantSuggest', label: text.assistantSuggest, accelerator: 'CmdOrCtrl+Shift+Y' },
  { id: 'assistantSummarize', label: text.assistantSummarize, accelerator: 'CmdOrCtrl+Shift+L' },
  { id: 'assistantCatchUp', label: text.assistantCatchUp, accelerator: 'CmdOrCtrl+Shift+U' },
  { id: 'hide', label: text.hide, accelerator: 'Cmd+H', platforms: ['darwin'] },
  // Windows closes apps with Alt+F4, which needs no menu item.
  { id: 'quit', label: text.quit, accelerator: 'CmdOrCtrl+Q', platforms: ['darwin', 'linux'] },
] as const;

export type ShortcutId = (typeof TABLE)[number]['id'];

/**
 * Every shortcut, in the order the Keyboard Shortcuts window lists them. The
 * menus take their accelerators from here, so the list cannot drift from them.
 */
export const SHORTCUTS: readonly Shortcut[] = TABLE;

/** Shortcuts that work from any app, set only by the user; none has keys at first. */
export const GLOBAL_SHORTCUTS = [{ id: 'toggleWindow', label: text.toggleWindow }] as const;

export type GlobalShortcutId = (typeof GLOBAL_SHORTCUTS)[number]['id'];

/** The ids of every shortcut, for checking what a settings file names. */
export const SHORTCUT_IDS: readonly ShortcutId[] = TABLE.map((shortcut) => shortcut.id);

/** Keys the user chose instead of YapYap's, by shortcut. */
export type CustomShortcuts = Readonly<Partial<Record<ShortcutId, string>>>;

/** A shortcut as a platform has it, with the keys in use and YapYap's own. */
export interface ActiveShortcut extends Shortcut {
  /** YapYap's keys for this platform, which Reset goes back to. */
  readonly standard: string;
  /** Whether the user chose `accelerator`. */
  readonly custom: boolean;
}

/** Keys the user may give a shortcut; account switching must end in 1, as it takes 1 to 9. */
export function fitsShortcut(id: ShortcutId, accelerator: string): boolean {
  return isValidShortcut(accelerator) && (id !== 'switchAccount' || accelerator.endsWith('+1'));
}

/** The shortcuts a platform has, with its own keys or the ones the user chose. */
export function shortcutsFor(
  platform: string,
  custom: CustomShortcuts = {},
): readonly ActiveShortcut[] {
  return SHORTCUTS.filter((shortcut) => shortcut.platforms?.includes(platform) ?? true).map(
    (shortcut) => {
      const standard =
        platform === 'darwin' ? (shortcut.mac ?? shortcut.accelerator) : shortcut.accelerator;
      // A hand-edited file can hold anything; only keys that fit are used.
      const chosen = custom[shortcut.id];
      const fits = chosen !== undefined && fitsShortcut(shortcut.id, chosen);
      return { ...shortcut, standard, accelerator: fits ? chosen : standard, custom: fits };
    },
  );
}

/** The accelerator of `id` on `platform`; undefined where the platform has none. */
export function acceleratorOf(
  id: ShortcutId,
  platform: string,
  custom: CustomShortcuts = {},
): string | undefined {
  return shortcutsFor(platform, custom).find((shortcut) => shortcut.id === id)?.accelerator;
}

const MAC_KEYS: Readonly<Record<string, string>> = {
  CmdOrCtrl: '⌘',
  Cmd: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
};

/** The order macOS writes modifiers in; the key itself comes last. */
const MAC_ORDER = ['⌃', '⌥', '⇧', '⌘'];

const macRank = (key: string): number => {
  const rank = MAC_ORDER.indexOf(key);
  return rank === -1 ? MAC_ORDER.length : rank;
};

/** The keys as the platform writes them: Ctrl+Shift+H, or ⇧⌘H on macOS. */
export function keysOf(accelerator: string, platform: string): readonly string[] {
  const keys = accelerator.split('+');
  if (platform === 'darwin') {
    return keys.map((key) => MAC_KEYS[key] ?? key).toSorted((a, b) => macRank(a) - macRank(b));
  }
  return keys.map((key) => (key === 'CmdOrCtrl' ? 'Ctrl' : key));
}
