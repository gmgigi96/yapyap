/**
 * The global the WhatsApp preload exposes in the adapter's isolated world,
 * never in WhatsApp's own, for the chat list's divider (#79).
 */
export const CHAT_LIST_BRIDGE = 'yapyapChatList';

/** Fixed channels from the divider in WhatsApp's page to the main process. */
export const CHAT_LIST_CHANNELS = {
  resize: 'whatsapp:chat-list-resize',
  reset: 'whatsapp:chat-list-reset',
} as const;

/** The narrowest chat list, in CSS pixels: still room for a name and the time of the last message. */
export const MIN_CHAT_LIST_WIDTH = 240;

/**
 * The widest width the main process accepts. The page also keeps the list
 * to 60% of WhatsApp's width, so the open chat always has room; this bound
 * only stops a nonsense value from being saved.
 */
export const MAX_CHAT_LIST_WIDTH = 4800;

/**
 * What the divider calls. The main process checks every argument, since
 * anything in the adapter's world could call these.
 */
export interface ChatListBridge {
  /** Keeps this width, in whole CSS pixels, for the page's account. */
  readonly resize: (width: number) => void;
  /** Goes back to WhatsApp's own width. */
  readonly reset: () => void;
}
