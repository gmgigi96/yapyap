import type { RecoveryProblem } from '../../shared/api/chrome-api.ts';
import { CHROME_ORIGIN, CHROME_VIEW } from '../chrome/assets.ts';
import type { ViewRegistry } from '../security/views.ts';
import { describeFailure, type Failure } from './failure.ts';

/** A chrome view laid over a window's content; `remove` also closes it. */
export interface Overlay {
  readonly webContents: { loadURL(url: string): Promise<unknown> };
  readonly remove: () => void;
}

export interface RecoverableContents {
  loadURL(url: string): Promise<unknown>;
  readonly session: {
    clearCache(): Promise<void>;
    /** Without options, clears every kind of storage, including the login. */
    clearStorageData(options?: { storages: ('serviceworkers' | 'cachestorage')[] }): Promise<void>;
  };
}

export interface RecoveryDependencies {
  readonly contents: RecoverableContents;
  readonly origin: string;
  readonly createOverlay: () => Overlay;
  readonly views: ViewRegistry;
  readonly writeClipboard: (text: string) => Promise<unknown>;
  readonly technicalDetails: () => string;
  readonly warn: (message: string) => void;
}

export interface Recovery {
  readonly show: (failure: Failure) => void;
  /** True when `sender` is this recovery's overlay, so IPC calls reach the right window. */
  readonly owns: (sender: object) => boolean;
  /** What the recovery screen explains, or null when it is not showing. */
  readonly problem: () => RecoveryProblem | null;
  readonly retry: () => Promise<void>;
  readonly clearCacheAndRetry: () => Promise<void>;
  /** Deletes all of the account's site data, which logs it out, and reloads. */
  readonly resetSession: () => Promise<void>;
  readonly copyDiagnostics: () => Promise<unknown>;
  /** Retries on its own only when WhatsApp could not be reached. */
  readonly reconnect: () => void;
}

/** Keeps cookies, IndexedDB and local storage, so the user stays logged in. */
async function clearSiteCache(contents: RecoverableContents): Promise<void> {
  await contents.session.clearCache();
  await contents.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
}

/** Deletes cookies, storage and caches alike, which logs the account out. */
async function clearAllSiteData(contents: RecoverableContents): Promise<void> {
  await contents.session.clearStorageData();
  await contents.session.clearCache();
}

/** Shows the recovery screen over a WhatsApp window and carries out its actions. */
export function createRecovery(deps: RecoveryDependencies): Recovery {
  let current: { overlay: Overlay; failure: Failure } | undefined;
  const load = (overlay: Overlay): void => {
    overlay.webContents.loadURL(`${CHROME_ORIGIN}/recovery.html`).catch(() => {
      deps.warn('Could not load the recovery screen.');
    });
  };
  const retry = async (): Promise<void> => {
    current?.overlay.remove();
    current = undefined;
    // A failure here fires did-fail-load, which shows the screen again.
    await deps.contents.loadURL(deps.origin).catch(() => undefined);
  };
  return {
    retry,
    show: (failure) => {
      const overlay = current?.overlay ?? deps.createOverlay();
      deps.views.set(overlay.webContents, CHROME_VIEW);
      current = { overlay, failure };
      load(overlay);
    },
    owns: (sender) => sender === current?.overlay.webContents,
    problem: () =>
      current === undefined
        ? null
        : { kind: current.failure.kind, description: describeFailure(current.failure) },
    clearCacheAndRetry: () => clearSiteCache(deps.contents).then(retry),
    resetSession: () => clearAllSiteData(deps.contents).then(retry),
    reconnect: () => {
      if (current?.failure.kind === 'load-failed') {
        void retry();
      }
    },
    copyDiagnostics: () => {
      const problem = current === undefined ? 'none' : describeFailure(current.failure);
      return deps.writeClipboard(`${deps.technicalDetails()}\nProblem: ${problem}`);
    },
  };
}
