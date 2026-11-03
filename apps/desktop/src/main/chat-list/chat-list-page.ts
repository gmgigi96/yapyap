import { chatListWidthRender, type ListContent } from '../../adapter/chat-list-width.ts';
import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import { en } from '../../shared/messages/en.ts';
import type { ChatListWidths } from './widths.ts';

/**
 * How often the width and divider are put back. WhatsApp can redraw its
 * columns, and draws the chat list only some time after its page loads,
 * while the adapter adds no observers to its page; a cheap render that
 * changes nothing when nothing changed stands in for one.
 */
const RENDER_EVERY_MS = 1000;

/** The account on screen, and its WhatsApp page. */
interface ActiveAccount {
  readonly account: string;
  readonly page: AdapterPage;
}

export interface ChatListPort {
  readonly widths: Pick<ChatListWidths, 'get'>;
  /** Whether the main window shows, the only time the list needs sizing. */
  readonly visible: () => boolean;
  readonly every: (tick: () => void, ms: number) => unknown;
}

export interface InPageChatList {
  /** Starts sizing the active account's list, once the accounts run. */
  readonly follow: (active: () => ActiveAccount) => void;
  /** Sizes the list again at once, such as when another account comes on screen. */
  readonly refresh: () => void;
}

function contentOf(width: number | undefined): ListContent {
  const text = en.chatList;
  return { width: width ?? null, labels: { label: text.label, hint: text.hint } };
}

/**
 * Each account's chat list width, inside its WhatsApp page (#79). It sizes
 * the active account's list whenever the account on screen changes, and
 * about once a second while the window shows. Other accounts' pages keep
 * the width they were given until they come on screen again.
 */
export function inPageChatList(port: ChatListPort): InPageChatList {
  let active: (() => ActiveAccount) | undefined;
  const render = (): void => {
    if (active !== undefined) {
      const { account, page } = active();
      // A page that went away, or one between loads, is sized at the next render.
      runInAdapterWorld(page, chatListWidthRender(contentOf(port.widths.get(account)))).catch(
        () => undefined,
      );
    }
  };
  port.every(() => {
    if (port.visible()) {
      render();
    }
  }, RENDER_EVERY_MS);
  return {
    follow: (source) => {
      active = source;
      render();
    },
    refresh: render,
  };
}
