import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import { argumentsOf } from '../ipc/arguments.ts';
import { parseInternationalNumber } from '../../shared/phone-number.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

/** Longer than any number written with separators; anything more is not a number. */
const MAX_INPUT_LENGTH = 64;

/** Where chats open; set once WhatsApp's window exists. */
export interface ChatTarget {
  open?: (phone: string) => void;
}

/** The New Chat window's one operation, which re-checks the number it gets. */
export function newChatHandlers(target: ChatTarget): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.chatOpenNumber,
      accepts: argumentsOf(
        (number) => typeof number === 'string' && number.length <= MAX_INPUT_LENGTH,
      ),
      handle: (_call, number) => {
        const phone = parseInternationalNumber(number as string);
        if (phone === undefined || target.open === undefined) {
          return false;
        }
        target.open(phone);
        return true;
      },
    },
  ];
}
