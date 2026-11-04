import { copyFileSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextAtomically } from '../support/atomic-write.ts';
import { decodeSettings, defaultSettings } from './decode.ts';
import type { Settings } from './schema.ts';
import { en } from '../../shared/messages/en.ts';

export const SETTINGS_FILE = 'settings.json';
const BACKUP_FILE = 'settings.json.bak';

export interface LoadedSettings {
  readonly settings: Settings;
  /** What to tell the user about how the settings were loaded, if anything. */
  readonly notice: string | undefined;
  /** No settings file yet: YapYap's first launch in this profile. */
  readonly firstRun?: true;
}

function readText(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function fromBackup(dir: string): LoadedSettings {
  const backup = readText(join(dir, BACKUP_FILE));
  const decoded = backup === undefined ? undefined : decodeSettings(backup);
  return decoded?.kind === 'ok'
    ? { settings: decoded.settings, notice: en.settings.loadNotices.restored }
    : { settings: defaultSettings(), notice: en.settings.loadNotices.defaults };
}

/**
 * Loads settings without ever failing (ADR 0006). A damaged file, or one of
 * another schema version, is kept as `settings.corrupt-<time>.json` for
 * inspection.
 */
export function loadSettings(dir: string, now: number): LoadedSettings {
  const path = join(dir, SETTINGS_FILE);
  const text = readText(path);
  if (text === undefined) {
    return { settings: defaultSettings(), notice: undefined, firstRun: true };
  }
  const decoded = decodeSettings(text);
  if (decoded.kind === 'ok') {
    const notice = decoded.reset.length > 0 ? en.settings.loadNotices.reset : undefined;
    return { settings: decoded.settings, notice };
  }
  renameSync(path, join(dir, `settings.corrupt-${String(now)}.json`));
  return fromBackup(dir);
}

/**
 * Writes atomically: a crash leaves either the old file or the new one, never
 * half of one. The file being replaced becomes the backup.
 */
export function saveSettings(dir: string, settings: Settings): void {
  const path = join(dir, SETTINGS_FILE);
  if (existsSync(path)) {
    copyFileSync(path, join(dir, BACKUP_FILE));
  }
  writeTextAtomically(path, `${JSON.stringify(settings, null, 2)}\n`);
}
