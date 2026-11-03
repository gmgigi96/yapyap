import { NOTIFICATION_CHANNELS } from '../../shared/api/notification-api.ts';
import { argumentsOf, isString } from '../ipc/arguments.ts';
import {
  registerWhatsAppListeners,
  type WhatsAppIpc,
  type WhatsAppSenders,
} from '../ipc/whatsapp.ts';
import type { AccountNotifier } from './notifier.ts';

/**
 * Routes WhatsApp's notification messages to its account. The notifier
 * checks the request itself, since it keeps only the fields it shows; a
 * message from a page with no notifier, such as a call window, is dropped.
 */
export function listenForNotifications(
  ipc: WhatsAppIpc,
  notifierOf: (sender: object) => AccountNotifier | undefined,
  senders: WhatsAppSenders,
): void {
  registerWhatsAppListeners(ipc, senders, [
    {
      channel: NOTIFICATION_CHANNELS.show,
      accepts: (args) => args.length === 1,
      handle: ({ sender }, request) => {
        notifierOf(sender)?.show(request);
      },
    },
    {
      channel: NOTIFICATION_CHANNELS.close,
      accepts: argumentsOf(isString),
      handle: ({ sender }, id) => {
        notifierOf(sender)?.close(id);
      },
    },
  ]);
}
