import { SHARE_CHANNELS } from '../../shared/api/share-api.ts';
import { argumentsOf } from '../ipc/arguments.ts';
import {
  registerWhatsAppListeners,
  type WhatsAppIpc,
  type WhatsAppSenders,
} from '../ipc/whatsapp.ts';

export interface ShareSender {
  send(channel: string, ...args: unknown[]): void;
  once(event: 'destroyed', listener: () => void): unknown;
}

export interface ShareDependencies extends WhatsAppSenders {
  readonly onChange: () => void;
}

/** The screen shares running in every account (#161). */
export interface ScreenShares {
  /** The accounts sharing a screen or window right now. */
  readonly sharing: () => ReadonlySet<string>;
  /** Asks the account's pages to stop every share; they report each end. */
  readonly stop: (account: string) => void;
}

/** The page's share IDs are UUIDs. */
const MAX_ID = 36;

const isId = (id: unknown): id is string => typeof id === 'string' && id.length <= MAX_ID;

type SharesBySender = Map<ShareSender, Map<string, string>>;

/** A sender's shares, by ID, each with its account; a page that goes takes its shares along. */
function sharesOf(
  bySender: SharesBySender,
  sender: ShareSender,
  onChange: () => void,
): Map<string, string> {
  const known = bySender.get(sender);
  if (known !== undefined) {
    return known;
  }
  const shares = new Map<string, string>();
  bySender.set(sender, shares);
  sender.once('destroyed', () => {
    bySender.delete(sender);
    onChange();
  });
  return shares;
}

/**
 * Hears the WhatsApp stand-in's share reports, from an account's WhatsApp
 * page or its call window. A page that goes away takes its shares with it,
 * since its capture ends with it.
 */
export function trackShares(ipc: WhatsAppIpc<ShareSender>, deps: ShareDependencies): ScreenShares {
  const bySender: SharesBySender = new Map();
  registerWhatsAppListeners(ipc, deps, [
    {
      channel: SHARE_CHANNELS.started,
      accepts: argumentsOf(isId),
      handle: ({ sender, account }, id) => {
        sharesOf(bySender, sender, deps.onChange).set(id as string, account);
        deps.onChange();
      },
    },
    {
      channel: SHARE_CHANNELS.ended,
      accepts: argumentsOf(isId),
      handle: ({ sender }, id) => {
        if (bySender.get(sender)?.delete(id as string) === true) {
          deps.onChange();
        }
      },
    },
  ]);
  return {
    sharing: () => new Set([...bySender.values()].flatMap((shares) => [...shares.values()])),
    stop: (account) => {
      for (const [sender, shares] of bySender) {
        for (const [id, owner] of shares) {
          if (owner === account) {
            sender.send(SHARE_CHANNELS.stop, id);
          }
        }
      }
    },
  };
}
