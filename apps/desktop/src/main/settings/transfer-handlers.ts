import { CHROME_CHANNELS, type TransferResult } from '../../shared/api/chrome-api.ts';
import { noArguments } from '../ipc/arguments.ts';
import type { ChromeCall, ChromeHandler } from '../ipc/chrome.ts';
import type { SettingsService } from './service.ts';
import { exportSettings, keepLocal, readImport } from './transfer.ts';
import { en } from '../../shared/messages/en.ts';

/** The file dialogs and file access behind export and import; `owner` is the calling window's contents. */
export interface SettingsFiles {
  /** The file to export to, or undefined when the user cancels. */
  readonly chooseExport: (owner: object) => Promise<string | undefined>;
  /** The file to import, or undefined when the user cancels. */
  readonly chooseImport: (owner: object) => Promise<string | undefined>;
  /** Asks before replacing the settings; true when the user agrees. */
  readonly confirmImport: (owner: object, detail: string) => Promise<boolean>;
  /** Reads a bounded prefix of the file, so a huge or endless file cannot stall YapYap. */
  readonly read: (path: string) => Promise<string>;
  readonly write: (path: string, text: string) => Promise<void>;
}

const TEXT = en.settings.backup;

/** Importing replaces the settings, and says how many of the file's values were invalid. */
function replacesWarning(invalid: number): string {
  return invalid === 0
    ? TEXT.replaces
    : `${TEXT.replaces} ${TEXT.invalidValues({ count: invalid })}`;
}

const CANCELLED: TransferResult = { outcome: 'cancelled', message: '' };

async function exportTo(
  service: SettingsService,
  files: SettingsFiles,
  call: ChromeCall,
): Promise<TransferResult> {
  const path = await files.chooseExport(call.sender);
  if (path === undefined) {
    return CANCELLED;
  }
  try {
    await files.write(path, exportSettings(service.current()));
    return { outcome: 'done', message: TEXT.exported };
  } catch {
    return { outcome: 'failed', message: TEXT.exportFailed };
  }
}

async function importFrom(
  service: SettingsService,
  files: SettingsFiles,
  call: ChromeCall,
): Promise<TransferResult> {
  const path = await files.chooseImport(call.sender);
  if (path === undefined) {
    return CANCELLED;
  }
  let text: string;
  try {
    text = await files.read(path);
  } catch {
    return { outcome: 'failed', message: TEXT.readFailed };
  }
  const result = readImport(text);
  if (result.kind === 'rejected') {
    return { outcome: 'failed', message: result.reason };
  }
  if (!(await files.confirmImport(call.sender, replacesWarning(result.reset.length)))) {
    return CANCELLED;
  }
  service.update((current) => keepLocal(result.settings, current));
  return { outcome: 'done', message: TEXT.imported };
}

/** Export and import for the settings window. */
export function settingsTransferHandlers(
  service: SettingsService,
  files: SettingsFiles,
): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.settingsExport,
      accepts: noArguments,
      handle: (call) => exportTo(service, files, call),
    },
    {
      channel: CHROME_CHANNELS.settingsImport,
      accepts: noArguments,
      handle: (call) => importFrom(service, files, call),
    },
  ];
}
