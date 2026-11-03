import { basename, dirname, join } from 'node:path';
import { numberedName, safeFileName } from './file-name.ts';
import type { LastFolder } from './last-folder.ts';
import type { TrackedItem } from './download-list.ts';
import { opensSafely } from './open-safely.ts';
import { en } from '../../shared/messages/en.ts';
import type { Settings } from '../settings/schema.ts';

export interface DownloadItem extends TrackedItem {
  setSavePath(path: string): void;
  setSaveDialogOptions(options: { readonly defaultPath: string }): void;
  once(event: 'done', listener: (event: unknown, state: string) => void): unknown;
}

export interface DownloadingSession {
  on(event: 'will-download', listener: (event: unknown, item: DownloadItem) => void): unknown;
}

export interface DownloadDependencies {
  /** The downloads folder, resolved through any symlinks. */
  readonly folder: () => string;
  /** True when anything, including a dangling symlink, already has this path. */
  readonly taken: (path: string) => boolean;
  readonly notify: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly options: () => Settings['downloads'];
  readonly lastFolder: LastFolder;
  /** `shell.openPath`: resolves with an error message, empty on success. */
  readonly openPath: (path: string) => Promise<string>;
  /** Lists the download in the Downloads window. */
  readonly track: (item: TrackedItem) => void;
}

/** Gives up numbering long before anyone has a hundred copies of one file. */
const MAX_COPIES = 99;

/**
 * Where a download goes: a sanitized name directly inside the real
 * downloads folder, numbered rather than ever replacing an existing entry,
 * so a symlink planted under the name cannot redirect the write.
 */
export function downloadTarget(
  suggested: string,
  deps: Pick<DownloadDependencies, 'folder' | 'taken'>,
): string | undefined {
  const folder = deps.folder();
  const name = safeFileName(suggested);
  for (let copy = 0; copy <= MAX_COPIES; copy += 1) {
    const path = join(folder, copy === 0 ? name : numberedName(name, copy));
    if (!deps.taken(path)) {
      return path;
    }
  }
  return undefined;
}

/** Opens a finished download if the user asked for that and it cannot run anything. */
function openIfViewable(deps: DownloadDependencies, path: string): void {
  if (!deps.options().openWhenDone || !opensSafely(path)) {
    return;
  }
  void deps.openPath(path).then((error) => {
    if (error !== '') {
      deps.warn('Could not open a download.');
    }
  });
}

/** Says how a download ended, and opens it if asked; a cancel is the user's own doing. */
function finish(deps: DownloadDependencies, path: string, state: string, asked: boolean): void {
  const name = basename(path);
  if (state === 'interrupted') {
    deps.notify(en.notices.downloadFailed({ name }));
  }
  if (state !== 'completed') {
    return;
  }
  // Only the system's Downloads folder is named; another is the user's own choice.
  const inDownloads = !asked && deps.options().folder === '';
  deps.notify(inDownloads ? en.notices.downloaded({ name }) : en.notices.saved({ name }));
  if (asked) {
    deps.lastFolder.set(dirname(path));
  }
  openIfViewable(deps, path);
}

/** The Save dialog starts in the last folder the user picked, or the downloads folder. */
function startFolder(deps: DownloadDependencies): string | undefined {
  try {
    return deps.lastFolder.get() ?? deps.folder();
  } catch {
    return undefined;
  }
}

/** A file system that refuses to be checked means asking the user instead. */
function targetOrNothing(suggested: string, deps: DownloadDependencies): string | undefined {
  try {
    return downloadTarget(suggested, deps);
  } catch {
    return undefined;
  }
}

/** Leaves the path to Chromium's Save dialog, opening in the folder YapYap picks. */
function askWhere(item: DownloadItem, deps: DownloadDependencies): void {
  const name = safeFileName(item.getFilename());
  const folder = startFolder(deps);
  item.setSaveDialogOptions({ defaultPath: folder === undefined ? name : join(folder, name) });
}

/**
 * Saves WhatsApp downloads straight into the downloads folder, as browsers
 * do, or asks where when the user wants that, and says how each one ended.
 * File names stay out of the log.
 */
export function guardDownloads(session: DownloadingSession, deps: DownloadDependencies): void {
  session.on('will-download', (_event, item) => {
    deps.track(item);
    let asked = deps.options().askWhere;
    if (asked) {
      askWhere(item, deps);
    } else {
      const target = targetOrNothing(item.getFilename(), deps);
      if (target === undefined) {
        deps.warn('Could not choose where to save a download; asking instead.');
        asked = true;
      } else {
        item.setSavePath(target);
      }
    }
    item.once('done', (_done, state) => {
      finish(deps, item.getSavePath(), state, asked);
    });
  });
}

/** The file system calls that find a real folder. */
export interface FolderChecks {
  readonly realpath: (path: string) => string;
  readonly isFolder: (path: string) => boolean;
}

/**
 * Where automatic downloads go: the folder the user chose, resolved through
 * any symlinks, or the system's Downloads folder when none is chosen or the
 * chosen one is gone or no longer a folder.
 */
export function downloadsFolder(chosen: string, system: () => string, fs: FolderChecks): string {
  if (chosen !== '') {
    try {
      const real = fs.realpath(chosen);
      if (fs.isFolder(real)) {
        return real;
      }
    } catch {
      // Gone since it was chosen: the Downloads folder takes over.
    }
  }
  return fs.realpath(system());
}
