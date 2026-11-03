import { describe, expect, it, vi } from 'vitest';
import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import { downloadsHandlers } from './downloads-handlers.ts';

function setup() {
  const list = { add: vi.fn(), entries: vi.fn(() => []), act: vi.fn(() => true), clear: vi.fn() };
  const handlers = downloadsHandlers(list);
  const handler = (channel: string) => {
    const found = handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(channel);
    }
    return found;
  };
  return { list, handler };
}

const call = { sender: {} };

describe('downloadsHandlers', () => {
  it('lists, acts on and clears downloads', () => {
    const t = setup();
    expect(t.handler(CHROME_CHANNELS.downloadsList).handle(call)).toEqual([]);
    t.handler(CHROME_CHANNELS.downloadsAct).handle(call, 3, 'pause');
    expect(t.list.act).toHaveBeenCalledExactlyOnceWith(3, 'pause');
    t.handler(CHROME_CHANNELS.downloadsClear).handle(call);
    expect(t.list.clear).toHaveBeenCalledOnce();
  });

  it('accepts only an id and a known action', () => {
    const { accepts } = setup().handler(CHROME_CHANNELS.downloadsAct);
    expect(accepts([3, 'show'])).toBe(true);
    expect(accepts([3, 'delete'])).toBe(false);
    expect(accepts(['3', 'pause'])).toBe(false);
    expect(accepts([1.5, 'pause'])).toBe(false);
    expect(accepts([3, 'pause', 'extra'])).toBe(false);
    expect(setup().handler(CHROME_CHANNELS.downloadsClear).accepts(['x'])).toBe(false);
  });
});
