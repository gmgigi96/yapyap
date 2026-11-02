import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import { NEWEST_INCOMING, parseIncoming, type Incoming } from '../../adapter/incoming.ts';

/** How often the open chat is looked at while suggestions may come on their own. */
export const LOOK_EVERY_MS = 1500;

export interface AutoSuggestDependencies {
  /** The WhatsApp page of the account on screen. */
  readonly activePage: () => AdapterPage;
  /**
   * Whether to look now: the setting is on, the bar shows and is not
   * already waiting for suggestions, and YapYap's window is on screen.
   */
  readonly active: () => boolean;
  /** Asks the assistant for suggestions, as Suggest replies does. */
  readonly suggest: () => unknown;
  readonly every: (callback: () => void, ms: number) => unknown;
}

/** What was last seen: on which page, in which chat, the newest message from someone else. */
interface Seen extends Incoming {
  readonly page: AdapterPage;
}

/** A new message from someone else, in the chat and on the page already looked at. */
const arrived = (before: Seen | undefined, now: Seen): boolean =>
  before?.page === now.page &&
  before.chat === now.chat &&
  now.message !== null &&
  before.message !== now.message;

/**
 * Asks for suggestions when a message arrives in the open chat (#468):
 * about every second and a half while it may, it asks the page for a hash
 * of the newest message from someone else, and suggests when that changes
 * in the same chat. Opening another chat or account, or coming back to
 * YapYap, only notes what is there. The adapter adds no observers, so a
 * cheap look stands in for one, and it never sees page text.
 */
export function suggestAsMessagesArrive(deps: AutoSuggestDependencies): void {
  let seen: Seen | undefined;
  let looking = false;
  const look = async (): Promise<void> => {
    const page = deps.activePage();
    const found = parseIncoming(await runInAdapterWorld(page, NEWEST_INCOMING));
    if (found === undefined) {
      return;
    }
    const now = { page, ...found };
    const fresh = arrived(seen, now);
    seen = now;
    if (fresh && deps.active()) {
      deps.suggest();
    }
  };
  deps.every(() => {
    if (!deps.active()) {
      seen = undefined;
      return;
    }
    if (looking) {
      return;
    }
    looking = true;
    // A page between loads cannot answer; the next look tries again.
    look()
      .catch(() => undefined)
      .finally(() => {
        looking = false;
      });
  }, LOOK_EVERY_MS);
}
