import { Value } from 'typebox/value';
import { argumentsOf } from '../ipc/arguments.ts';
import { CHROME_CHANNELS } from '../../shared/api/chrome-api.ts';
import { SETTING_FIELDS } from '../../shared/settings-fields.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import { withValue } from './handlers.ts';
import { SettingsSchema } from './schema.ts';
import type { SettingsService } from './service.ts';

/** Folder settings, which only the system's own folder dialog may set. */
const FOLDER_FIELDS: ReadonlySet<string> = new Set(
  SETTING_FIELDS.filter((field) => field.folder !== undefined).map(({ id }) => id),
);

/**
 * Settings → Choose…: the user picks the folder in the system's dialog, so
 * the page never names a path itself (#74). The page reads the settings
 * again afterwards.
 */
export function folderChoiceHandlers(
  service: Pick<SettingsService, 'current' | 'update'>,
  choose: (sender: object) => Promise<string | undefined>,
): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.settingsChooseFolder,
      accepts: argumentsOf((id) => FOLDER_FIELDS.has(String(id))),
      handle: async ({ sender }, id) => {
        const folder = await choose(sender);
        const next = withValue(service.current(), String(id), folder);
        if (folder !== undefined && Value.Check(SettingsSchema, next)) {
          service.update(() => next);
        }
      },
    },
  ];
}
