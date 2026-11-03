/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_LIST_TO_TOP,
  chatListToTop,
  chatOpenerStep,
  chatScroller,
  openChatStep,
  parseOpenStep,
} from './open-chat.ts';
import { LANDMARKS } from './page-state.ts';

const PLACES = {
  chatList: LANDMARKS.chatList,
  chatRow: LANDMARKS.chatRow,
  chatTitle: LANDMARKS.chatTitle,
};

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

/** A list box that scrolls up to `height`, as far as the step reads and moves it. */
function box(clientHeight: number, height: number) {
  const list = {
    top: 0,
    clientHeight,
    get scrollTop() {
      return list.top;
    },
    set scrollTop(value: number) {
      list.top = Math.min(value, height);
    },
  };
  return list;
}

const noRows = { querySelectorAll: () => [] };

describe('openChatStep', () => {
  it('presses the row of the chat named exactly that, as a click would', () => {
    document.body.innerHTML = LIST;
    const events: string[] = [];
    const row = document.querySelector('[data-testid="list-item-0"]');
    for (const type of ['mousedown', 'mouseup', 'click']) {
      row?.addEventListener(type, () => events.push(type));
    }
    const other = vi.fn();
    document.querySelector('[data-testid="list-item-1"]')?.addEventListener('mousedown', other);
    const list = box(500, 1000);
    expect(openChatStep(document, PLACES, 'Ana', mouse, list)).toBe('opened');
    expect(events).toEqual(['mousedown', 'mouseup', 'click']);
    expect(other).not.toHaveBeenCalled();
    expect(list.scrollTop).toBe(0);
  });

  it('loads the next rows of the virtualized list when the chat is not among them', () => {
    const list = box(500, 1000);
    expect(openChatStep(noRows, PLACES, 'Rui', mouse, list)).toBe('scrolled');
    // Most of a screen, so a row cut at the edge is whole in the next look.
    expect(list.scrollTop).toBe(400);
    expect(openChatStep(noRows, PLACES, 'Rui', mouse, list)).toBe('scrolled');
    expect(list.scrollTop).toBe(800);
    expect(openChatStep(noRows, PLACES, 'Rui', mouse, list)).toBe('scrolled');
    expect(list.scrollTop).toBe(1000);
    expect(openChatStep(noRows, PLACES, 'Rui', mouse, list)).toBe('end');
  });

  it('still moves a list with no height yet, a row at a time', () => {
    const list = box(0, 10);
    expect(openChatStep(noRows, PLACES, 'Rui', mouse, list)).toBe('scrolled');
    expect(list.scrollTop).toBe(1);
  });

  it('ends where there is no chat list', () => {
    expect(openChatStep(noRows, PLACES, 'Ana', mouse, null)).toBe('end');
  });

  it('skips a row whose title has no text', () => {
    const empty = { querySelector: () => ({ textContent: null }), dispatchEvent: vi.fn() };
    const rows = { querySelectorAll: () => [empty] };
    expect(openChatStep(rows, PLACES, 'Ana', mouse, null)).toBe('end');
    expect(empty.dispatchEvent).not.toHaveBeenCalled();
  });

  // Mutation testing instruments the function with helpers from outside it,
  // so only uninstrumented source can run on its own.
  it.skipIf(chatOpenerStep('Ana').includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML = LIST;
    const pressed = vi.fn();
    document.querySelector('[data-testid="list-item-1"]')?.addEventListener('mousedown', pressed);
    // Only the page's own globals are in scope, as in the isolated world.
    const result: unknown = runInNewContext(chatOpenerStep('Ana Maria'), {
      document,
      MouseEvent,
      getComputedStyle,
    });
    expect(result).toBe('opened');
    expect(pressed).toHaveBeenCalledOnce();
  });

  it('carries the chat list’s landmarks, the scroll test and a real left click into the page', () => {
    const code = chatOpenerStep('Ana');
    expect(code).toContain(JSON.stringify(PLACES));
    expect(code).toContain(
      '(type) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })',
    );
    expect(code).toContain(
      '(element) => /(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY)',
    );
  });

  it('names the chat as data, never as code', () => {
    expect(chatOpenerStep('"); alert(1); ("')).toContain(JSON.stringify('"); alert(1); ("'));
  });
});

/** A box in the page, around `inner`, that may overflow and may be allowed to scroll. */
function element(scrollHeight: number, clientHeight: number, parentElement: unknown = null) {
  return { scrollTop: 0, scrollHeight, clientHeight, parentElement, scrolls: true };
}

describe('chatScroller', () => {
  const docWith = (row: unknown, pane: unknown) => ({
    querySelector: (selector: string) => (selector === PLACES.chatRow ? row : pane),
  });
  const scrolls = (node: unknown) => (node as { scrolls: boolean }).scrolls;

  it('finds the nearest box around a chat row that overflows and may scroll', () => {
    const page = element(5000, 800);
    const pane = element(5000, 800, page);
    pane.scrolls = false;
    const row = element(72, 72, element(5000, 5000, pane));
    expect(chatScroller(docWith(row, 'pane-side'), PLACES, scrolls)).toBe(page);
  });

  it('takes the first that scrolls, even inside the named list', () => {
    const inner = element(5000, 800, element(800, 800));
    const row = element(72, 72, inner);
    expect(chatScroller(docWith(row, 'pane-side'), PLACES, scrolls)).toBe(inner);
  });

  it('falls back to the named list when no row is there, or none scrolls', () => {
    expect(chatScroller(docWith(null, 'pane-side'), PLACES, scrolls)).toBe('pane-side');
    const row = element(72, 72, element(800, 800));
    expect(chatScroller(docWith(row, 'pane-side'), PLACES, scrolls)).toBe('pane-side');
  });

  it('runs in the page, where the named list stands in for a box with no layout', () => {
    document.body.innerHTML = LIST;
    const found: unknown = runInNewContext(
      `(${chatScroller.toString()})(document, ${JSON.stringify(PLACES)}, (element) => /(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY))`,
      { document, getComputedStyle },
    );
    expect(found).toBe(document.querySelector('#pane-side'));
  });
});

describe('chatListToTop', () => {
  it('puts the chat list back at its top, and says when there is none', () => {
    const list = box(500, 1000);
    list.scrollTop = 700;
    expect(chatListToTop(list)).toBe(true);
    expect(list.scrollTop).toBe(0);
    expect(chatListToTop(null)).toBe(false);
  });

  it.skipIf(CHAT_LIST_TO_TOP.includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML = LIST;
    const result: unknown = runInNewContext(CHAT_LIST_TO_TOP, { document, getComputedStyle });
    expect(result).toBe(true);
    expect(CHAT_LIST_TO_TOP).toContain(JSON.stringify(PLACES));
  });
});

describe('parseOpenStep', () => {
  it('keeps what the step reports, and reads anything else as the end', () => {
    expect(parseOpenStep('opened')).toBe('opened');
    expect(parseOpenStep('scrolled')).toBe('scrolled');
    expect(parseOpenStep('end')).toBe('end');
    expect(parseOpenStep(true)).toBe('end');
    expect(parseOpenStep(undefined)).toBe('end');
  });
});
