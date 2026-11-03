import {
  CHROME_CHANNELS,
  type ShortcutChange,
  type ShortcutList,
} from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { conflictOf, isValidShortcut } from '../../shared/shortcut-keys.ts';
import {
  fitsShortcut,
  GLOBAL_SHORTCUTS,
  shortcutsFor,
  type GlobalShortcutId,
  type ShortcutId,
} from '../../shared/shortcuts.ts';
import type { SettingsService } from '../settings/service.ts';
import { argumentsOf, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

const text = en.shortcuts;

/** Longer than any real accelerator. */
const MAX_ACCELERATOR = 64;

type Service = Pick<SettingsService, 'current' | 'update'>;

/** New keys of a sane length, or null to go back to YapYap's own. */
const isKeysOrReset = (value: unknown): boolean =>
  value === null || (typeof value === 'string' && value.length <= MAX_ACCELERATOR);

const isGlobal = (id: string): id is GlobalShortcutId =>
  GLOBAL_SHORTCUTS.some((shortcut) => shortcut.id === id);

/** Every binding in use: the in-app shortcuts, and the global ones that have keys. */
function bindingsOf(
  service: Service,
  platform: string,
): { id: string; label: string; accelerator: string }[] {
  const { custom, global } = service.current().shortcuts;
  const local = shortcutsFor(platform, custom);
  const everywhere = GLOBAL_SHORTCUTS.map(({ id, label }) => ({
    id,
    label,
    accelerator: global[id],
  }));
  return [...local, ...everywhere.filter(({ accelerator }) => accelerator !== '')];
}

/** Why the keys cannot be used for `id`, or '' when they can. */
function problemOf(service: Service, platform: string, id: string, accelerator: string): string {
  const fits = isGlobal(id)
    ? isValidShortcut(accelerator)
    : fitsShortcut(id as ShortcutId, accelerator);
  if (!fits) {
    return isValidShortcut(accelerator) ? text.switchEndsInOne : text.invalid;
  }
  const bindings = bindingsOf(service, platform);
  const taken = conflictOf(id, accelerator, bindings, platform);
  const other = bindings.find((binding) => binding.id === taken);
  return other === undefined ? '' : text.taken({ action: other.label });
}

function save(service: Service, id: string, accelerator: string | null): void {
  service.update((current) => {
    if (isGlobal(id)) {
      const global = { ...current.shortcuts.global, [id]: accelerator ?? '' };
      return { ...current, shortcuts: { ...current.shortcuts, global } };
    }
    const others = Object.entries(current.shortcuts.custom).filter(([key]) => key !== id);
    const custom = Object.fromEntries(
      accelerator === null ? others : [...others, [id, accelerator]],
    );
    return { ...current, shortcuts: { ...current.shortcuts, custom } };
  });
}

/** Every shortcut as the Keyboard Shortcuts window shows it. */
function listOf(
  service: Service,
  platform: string,
  isRegistered: (accelerator: string) => boolean,
): ShortcutList {
  const { custom, global } = service.current().shortcuts;
  return {
    platform,
    shortcuts: shortcutsFor(platform, custom),
    global: GLOBAL_SHORTCUTS.map(({ id, label }) => ({
      id,
      label,
      accelerator: global[id],
      registered: global[id] === '' || isRegistered(global[id]),
    })),
  };
}

/**
 * The Keyboard Shortcuts window's operations (#75): list the shortcuts, and
 * change or reset one, in-app or global. Keys that do not fit or that
 * another action uses are refused, with the reason. A global shortcut also
 * says whether the system granted its keys.
 */
export function shortcutHandlers(
  service: Service,
  platform: string,
  isRegistered: (accelerator: string) => boolean,
): ChromeHandler[] {
  const list = (): ShortcutList => listOf(service, platform, isRegistered);
  const known = new Set<string>([
    ...list().shortcuts.map((shortcut) => shortcut.id),
    ...GLOBAL_SHORTCUTS.map((shortcut) => shortcut.id),
  ]);
  // Reset never clashes.
  const problemFor = (id: string, keys: string | null): string =>
    keys === null ? '' : problemOf(service, platform, id, keys);
  return [
    { channel: CHROME_CHANNELS.shortcutsList, accepts: noArguments, handle: list },
    {
      channel: CHROME_CHANNELS.shortcutsSet,
      accepts: argumentsOf((id) => known.has(String(id)), isKeysOrReset),
      handle: (_call, id, accelerator): ShortcutChange => {
        const keys = accelerator as string | null;
        const problem = problemFor(String(id), keys);
        if (problem === '') {
          save(service, String(id), keys);
        }
        return { ...list(), problem };
      },
    },
  ];
}
