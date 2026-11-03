import { isValidShortcut } from '../../shared/shortcut-keys.ts';
import { GLOBAL_SHORTCUTS, type GlobalShortcutId } from '../../shared/shortcuts.ts';
import { bringToFront, type LinkWindow } from '../instances.ts';
import { followSettings, type SettingsService } from '../settings/service.ts';

/** Electron's `globalShortcut`, as far as YapYap uses it. */
export interface GlobalShortcutPort {
  /** False when another app holds the keys or the system allows no global keys. */
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
  /** Gives every key back; done at quit so no other app finds them held. */
  unregisterAll(): void;
}

/**
 * Keeps the system's global shortcuts in step with the settings (#75):
 * keys are taken when the user sets them and given back when they change.
 * Whether the system granted them shows in the Keyboard Shortcuts window.
 */
export function followGlobalShortcuts(
  port: GlobalShortcutPort,
  settings: Pick<SettingsService, 'current' | 'onChange'>,
  actions: Readonly<Record<GlobalShortcutId, () => void>>,
): void {
  const held = new Map<GlobalShortcutId, string>();
  const swap = (previous: string, keys: string, action: () => void): void => {
    if (previous !== '') {
      port.unregister(previous);
    }
    if (isValidShortcut(keys)) {
      port.register(keys, action);
    }
  };
  followSettings(settings, (current) => {
    for (const { id } of GLOBAL_SHORTCUTS) {
      const keys = current.shortcuts.global[id];
      const previous = held.get(id) ?? '';
      if (keys !== previous) {
        swap(previous, keys, actions[id]);
        held.set(id, keys);
      }
    }
  });
}

export interface ToggleWindow extends LinkWindow {
  isVisible(): boolean;
  isFocused(): boolean;
  hide(): void;
}

/** Hides the window when it is in front, and brings it there otherwise. */
export function toggleWindow(window: ToggleWindow): void {
  if (window.isVisible() && window.isFocused()) {
    window.hide();
  } else {
    bringToFront(window);
  }
}
