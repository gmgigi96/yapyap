import { ASSISTANT_BAR_CHANNELS, type AssistantBarBridge } from '../../shared/assistant-bar-api.ts';
import { CHAT_LIST_CHANNELS, type ChatListBridge } from '../../shared/chat-list-api.ts';
import { NOTIFICATION_CHANNELS, type NotificationBridge } from '../../shared/notification-api.ts';
import { SHARE_CHANNELS, type ShareBridge } from '../../shared/share-api.ts';

export interface PreloadIpc {
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

/** Hands `listener` each ID the main process sends on `channel`, and nothing else. */
function onId(ipc: PreloadIpc, channel: string, listener: (id: string) => void): void {
  ipc.on(channel, (_event, id) => {
    if (typeof id === 'string') {
      listener(id);
    }
  });
}

/**
 * The page's side of WhatsApp notifications: three operations on fixed
 * channels, never `ipcRenderer` itself (ADR 0011).
 */
export function createNotificationBridge(ipc: PreloadIpc): NotificationBridge {
  return {
    show: (request) => {
      ipc.send(NOTIFICATION_CHANNELS.show, request);
    },
    close: (id) => {
      ipc.send(NOTIFICATION_CHANNELS.close, id);
    },
    onClick: (listener) => {
      onId(ipc, NOTIFICATION_CHANNELS.click, listener);
    },
  };
}

/** The page's side of screen shares: start, end and stop, on fixed channels (#161). */
export function createShareBridge(ipc: PreloadIpc): ShareBridge {
  return {
    started: (id) => {
      ipc.send(SHARE_CHANNELS.started, id);
    },
    ended: (id) => {
      ipc.send(SHARE_CHANNELS.ended, id);
    },
    onStop: (listener) => {
      onId(ipc, SHARE_CHANNELS.stop, listener);
    },
  };
}

/**
 * The assistant bar's side of its user actions, on fixed channels
 * (ADR 0013). Only the adapter's isolated world gets it, never WhatsApp's.
 */
export function createAssistantBarBridge(ipc: Pick<PreloadIpc, 'send'>): AssistantBarBridge {
  const send =
    (channel: string) =>
    (...args: unknown[]): void => {
      ipc.send(channel, ...args);
    };
  const channels = ASSISTANT_BAR_CHANNELS;
  return {
    suggest: send(channels.suggest),
    summarize: send(channels.summarize),
    rewrite: send(channels.rewrite),
    catchUp: send(channels.catchUp),
    prompt: send(channels.prompt),
    use: send(channels.use),
    send: send(channels.send),
    choose: send(channels.choose),
    button: send(channels.button),
    settings: send(channels.settings),
  };
}

/**
 * The chat list divider's side of its two actions, on fixed channels (#79).
 * Only the adapter's isolated world gets it, never WhatsApp's.
 */
export function createChatListBridge(ipc: Pick<PreloadIpc, 'send'>): ChatListBridge {
  return {
    resize: (width) => {
      ipc.send(CHAT_LIST_CHANNELS.resize, width);
    },
    reset: () => {
      ipc.send(CHAT_LIST_CHANNELS.reset);
    },
  };
}
