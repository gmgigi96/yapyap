import { CHAT_LIST_CHANNELS } from '../../shared/api/chat-list-api.ts';
import { argumentsOf, noArguments } from '../ipc/arguments.ts';
import {
  registerWhatsAppListeners,
  type WhatsAppIpc,
  type WhatsAppSenders,
} from '../ipc/whatsapp.ts';
import { isChatListWidth, type ChatListWidths } from './widths.ts';

/**
 * Hears the chat list's divider (#79). A width is kept for the account of
 * the WhatsApp view that sent it, so no page can set another account's; it
 * must be whole pixels within bounds.
 */
export function listenToChatList(
  ipc: WhatsAppIpc,
  widths: Pick<ChatListWidths, 'set'>,
  senders: WhatsAppSenders,
): void {
  registerWhatsAppListeners(ipc, senders, [
    {
      channel: CHAT_LIST_CHANNELS.resize,
      accepts: argumentsOf(isChatListWidth),
      handle: ({ account }, width) => {
        widths.set(account, width as number);
      },
    },
    {
      channel: CHAT_LIST_CHANNELS.reset,
      accepts: noArguments,
      handle: ({ account }) => {
        widths.set(account, undefined);
      },
    },
  ]);
}
