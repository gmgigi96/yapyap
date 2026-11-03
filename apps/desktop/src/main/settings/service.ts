import type { Settings } from './schema.ts';
import { loadSettings, saveSettings } from './store.ts';

export interface SettingsService {
  readonly current: () => Settings;
  readonly notice: string | undefined;
  /** No settings were saved before this launch, so it is the first (#84). */
  readonly firstRun: boolean;
  /** Applies a change and saves it. */
  readonly update: (change: (settings: Settings) => Settings) => void;
  /** Calls `listener` after every saved change, so live settings apply at once. */
  readonly onChange: (listener: (settings: Settings) => void) => void;
}

/** Calls `apply` with the settings now and again after every change. */
export function followSettings(
  settings: Pick<SettingsService, 'current' | 'onChange'>,
  apply: (settings: Settings) => void,
): void {
  apply(settings.current());
  settings.onChange(apply);
}

export function openSettings(dir: string, now: number): SettingsService {
  const loaded = loadSettings(dir, now);
  let settings = loaded.settings;
  const listeners: ((settings: Settings) => void)[] = [];
  return {
    current: () => settings,
    notice: loaded.notice,
    firstRun: loaded.firstRun === true,
    update: (change) => {
      settings = change(settings);
      saveSettings(dir, settings);
      for (const listener of listeners) {
        listener(settings);
      }
    },
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}
