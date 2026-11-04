import { describe, expect, it, vi } from 'vitest';
import { newChatHandlers } from './new-chat-handlers.ts';

function handler(open?: (phone: string) => void) {
  const [found] = newChatHandlers(open === undefined ? {} : { open });
  if (found === undefined) {
    throw new Error('No handler');
  }
  return found;
}

const call = { sender: {} };

describe('newChatHandlers', () => {
  it('opens the chat with the number’s digits', () => {
    const open = vi.fn();
    const chat = handler(open);
    expect(chat.channel).toBe('chat:open-number');
    expect(chat.handle(call, '+44 7700 900123')).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith('447700900123');
  });

  it('refuses a number that is not international', () => {
    const open = vi.fn();
    expect(handler(open).handle(call, '07700 900123')).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses while WhatsApp has no window to open the chat in', () => {
    expect(handler().handle(call, '+447700900123')).toBe(false);
  });

  it.each([[[]], [['+447700900123', 'x']], [[447700900123]], [['+'.padEnd(65, '1')]]])(
    'rejects the payload %j',
    (args) => {
      expect(handler(vi.fn()).accepts(args)).toBe(false);
    },
  );

  it('accepts one string of at most 64 characters', () => {
    expect(handler(vi.fn()).accepts(['+'.padEnd(64, '1')])).toBe(true);
  });
});
