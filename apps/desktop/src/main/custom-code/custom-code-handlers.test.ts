import { describe, expect, it, vi } from 'vitest';
import { NO_CUSTOM_CODE, type CustomCode } from '../../shared/custom-code.ts';
import { customCodeHandlers } from './custom-code-handlers.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

const WORK = '6f1c2a5e-0b1d-4c8e-9a3f-2d4b6c8e0a1b';
const GONE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const CALL = { sender: {} };

function setup() {
  let saved: CustomCode = NO_CUSTOM_CODE;
  const code = {
    attach: vi.fn(),
    current: vi.fn(() => saved),
    save: vi.fn((next: CustomCode) => {
      saved = next;
    }),
    preview: vi.fn(),
  };
  const handlers = customCodeHandlers(code, () => [{ id: WORK, name: 'Work' }]);
  const byChannel = (channel: string): ChromeHandler => {
    const handler = handlers.find((candidate) => candidate.channel === channel);
    if (handler === undefined) {
      throw new Error(`No handler for ${channel}.`);
    }
    return handler;
  };
  return {
    code,
    get: byChannel('custom-code:get'),
    save: byChannel('custom-code:save'),
    preview: byChannel('custom-code:preview'),
  };
}

describe('customCodeHandlers', () => {
  it('lists the code with all accounts first, then each account', () => {
    const t = setup();
    expect(t.get.accepts([])).toBe(true);
    expect(t.get.accepts(['x'])).toBe(false);
    expect(t.get.handle(CALL)).toEqual({
      code: NO_CUSTOM_CODE,
      scopes: [
        { id: 'all', label: 'All accounts' },
        { id: WORK, label: 'Work' },
      ],
    });
  });

  it('saves well-formed code only, without empty snippets or accounts that are gone', () => {
    const t = setup();
    const code = {
      enabled: true,
      snippets: {
        all: { css: '', js: '' },
        [WORK]: { css: 'p {}', js: '' },
        [GONE]: { css: 'p {}', js: 'alert(1)' },
      },
    };
    expect(t.save.accepts([code])).toBe(true);
    expect(t.save.accepts([code, 'more'])).toBe(false);
    expect(t.save.accepts([{ enabled: 'yes', snippets: {} }])).toBe(false);
    const result = t.save.handle(CALL, code) as { code: CustomCode };
    const tidy = { enabled: true, snippets: { [WORK]: { css: 'p {}', js: '' } } };
    expect(t.code.save).toHaveBeenCalledExactlyOnceWith(tidy);
    expect(result.code).toEqual(tidy);
  });

  it('previews CSS for a known scope, and drops the preview on null', () => {
    const t = setup();
    expect(t.preview.accepts(['all', 'p {}'])).toBe(true);
    expect(t.preview.accepts(['all', null])).toBe(true);
    expect(t.preview.accepts(['all', 3])).toBe(false);
    expect(t.preview.accepts([1, 'p {}'])).toBe(false);
    expect(t.preview.accepts(['all', 'p {}', 'more'])).toBe(false);
    t.preview.handle(CALL, WORK, 'p {}');
    t.preview.handle(CALL, 'all', null);
    t.preview.handle(CALL, GONE, 'p {}');
    expect(t.code.preview.mock.calls).toEqual([
      [WORK, 'p {}'],
      ['all', undefined],
    ]);
  });
});
