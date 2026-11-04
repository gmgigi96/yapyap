import { basename } from 'node:path';
import type { DownloadAction, DownloadEntry } from '../../shared/api/chrome-api.ts';

/** The part of Electron's `DownloadItem` the Downloads window works with. */
export interface TrackedItem {
  getFilename(): string;
  getSavePath(): string;
  getReceivedBytes(): number;
  getTotalBytes(): number;
  getState(): 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  isPaused(): boolean;
  canResume(): boolean;
  pause(): void;
  resume(): void;
  cancel(): void;
}

export interface DownloadList {
  readonly add: (item: TrackedItem) => void;
  /** Newest first. */
  readonly entries: () => DownloadEntry[];
  /** False when the download is gone or cannot do that now. */
  readonly act: (id: number, action: DownloadAction) => boolean;
  /** Forgets the downloads that have ended; files on disk stay. */
  readonly clear: () => void;
}

/** Enough for a session; older entries drop off, their files stay on disk. */
const KEPT = 50;

function entryOf(id: number, item: TrackedItem): DownloadEntry {
  const state = item.getState();
  return {
    id,
    name: basename(item.getSavePath()) || item.getFilename(),
    state: state === 'progressing' && item.isPaused() ? 'paused' : state,
    received: item.getReceivedBytes(),
    total: item.getTotalBytes(),
    canResume: item.canResume(),
  };
}

/** What each action needs the download to be doing. */
const ALLOWED: Readonly<Record<DownloadAction, readonly DownloadEntry['state'][]>> = {
  pause: ['progressing'],
  resume: ['paused', 'interrupted'],
  cancel: ['progressing', 'paused'],
  show: ['completed'],
};

function perform(item: TrackedItem, action: DownloadAction, show: (path: string) => void): boolean {
  const allowed = ALLOWED[action].includes(entryOf(0, item).state);
  if (!allowed || (action === 'resume' && !item.canResume())) {
    return false;
  }
  const run: Record<DownloadAction, () => void> = {
    pause: () => {
      item.pause();
    },
    resume: () => {
      item.resume();
    },
    cancel: () => {
      item.cancel();
    },
    show: () => {
      show(item.getSavePath());
    },
  };
  run[action]();
  return true;
}

/**
 * This session's downloads, for the Downloads window (#74). Names stay in
 * memory: nothing about a download is written anywhere but the file itself.
 */
export function createDownloadList(showInFolder: (path: string) => void): DownloadList {
  const items = new Map<number, TrackedItem>();
  let next = 1;
  return {
    add: (item) => {
      items.set(next, item);
      next += 1;
      const ids = [...items.keys()];
      for (const id of ids.slice(0, Math.max(0, ids.length - KEPT))) {
        items.delete(id);
      }
    },
    entries: () => [...items].map(([id, item]) => entryOf(id, item)).reverse(),
    act: (id, action) => {
      const item = items.get(id);
      return item !== undefined && perform(item, action, showInFolder);
    },
    clear: () => {
      for (const [id, item] of items) {
        const state = entryOf(id, item).state;
        if (state !== 'progressing' && state !== 'paused') {
          items.delete(id);
        }
      }
    },
  };
}
