/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatOpener, openChat } from './open-chat.ts';
import { LANDMARKS } from './page-state.ts';

const PLACES = { chatRow: LANDMARKS.chatRow, chatTitle: LANDMARKS.chatTitle };

const LIST = `
  <div id="pane-side">
    <div role="row" data-testid="list-item-0">
      <div data-testid="cell-frame-title"><span dir="auto"> Ana </span></div>
    </div>
    <div role="row" data-testid="list-item-1">
      <div data-testid="cell-frame-title"><span dir="auto">Ana Maria</span></div>
    </div>
    <div role="row" data-testid="list-item-2"></div>
  </div>`;

afterEach(() => {
  document.body.innerHTML = '';
});

const mouse = (type: string) => new MouseEvent(type, { bubbles: true, cancelable: true });

describe('openChat', () => {
  it('presses the row of the chat named exactly that, as a click would', () => {
    document.body.innerHTML = LIST;
    const events: string[] = [];
    const row = document.querySelector('[data-testid="list-item-0"]');
    for (const type of ['mousedown', 'mouseup', 'click']) {
      row?.addEventListener(type, () => events.push(type));
    }
    const other = vi.fn();
    document.querySelector('[data-testid="list-item-1"]')?.addEventListener('mousedown', other);
    expect(openChat(document, PLACES, 'Ana', mouse)).toBe(true);
    expect(events).toEqual(['mousedown', 'mouseup', 'click']);
    expect(other).not.toHaveBeenCalled();
  });

  it('reports a chat the list does not show', () => {
    document.body.innerHTML = LIST;
    expect(openChat(document, PLACES, 'An', mouse)).toBe(false);
    expect(openChat(document, PLACES, 'Rui', mouse)).toBe(false);
  });

  // Mutation testing instruments the function with helpers from outside it,
  // so only uninstrumented source can run on its own.
  it.skipIf(chatOpener('Ana').includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML = LIST;
    const pressed = vi.fn();
    document.querySelector('[data-testid="list-item-1"]')?.addEventListener('mousedown', pressed);
    // Only `document` and the page's own MouseEvent are in scope, as in the isolated world.
    const result: unknown = runInNewContext(chatOpener('Ana Maria'), { document, MouseEvent });
    expect(result).toBe(true);
    expect(pressed).toHaveBeenCalledOnce();
  });

  it('skips a row whose title has no text', () => {
    const empty = { querySelector: () => ({ textContent: null }), dispatchEvent: vi.fn() };
    const rows = { querySelectorAll: () => [empty] };
    expect(openChat(rows, PLACES, 'Ana', mouse)).toBe(false);
    expect(empty.dispatchEvent).not.toHaveBeenCalled();
  });

  it('carries the chat list’s landmarks and a real left click into the page', () => {
    const code = chatOpener('Ana');
    expect(code).toContain(JSON.stringify(PLACES));
    expect(code).toContain(
      '(type) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })',
    );
  });

  it('names the chat as data, never as code', () => {
    expect(chatOpener('"); alert(1); ("')).toContain(JSON.stringify('"); alert(1); ("'));
  });
});
