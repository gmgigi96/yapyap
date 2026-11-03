/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_LIST_TO_TOP,
  chatListToTop,
  chatOpenerStep,
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

/** A chat list that scrolls, as far as the step reads and moves it, up to `height` at most. */
function scrolling(clientHeight: number, height: number, rows: unknown[] = []) {
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
  const doc = {
    querySelector: vi.fn((selector: string) => (selector === PLACES.chatList ? list : null)),
    querySelectorAll: () => rows,
  };
  return { list, doc };
}

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
    expect(openChatStep(document, PLACES, 'Ana', mouse)).toBe('opened');
    expect(events).toEqual(['mousedown', 'mouseup', 'click']);
    expect(other).not.toHaveBeenCalled();
  });

  it('loads the next rows of the virtualized list when the chat is not among them', () => {
    const { list, doc } = scrolling(500, 1000);
    expect(openChatStep(doc, PLACES, 'Rui', mouse)).toBe('scrolled');
    // Most of a screen, so a row cut at the edge is whole in the next look.
    expect(list.scrollTop).toBe(400);
    expect(openChatStep(doc, PLACES, 'Rui', mouse)).toBe('scrolled');
    expect(list.scrollTop).toBe(800);
    expect(openChatStep(doc, PLACES, 'Rui', mouse)).toBe('scrolled');
    expect(list.scrollTop).toBe(1000);
    expect(openChatStep(doc, PLACES, 'Rui', mouse)).toBe('end');
  });

  it('still moves a list with no height yet, a row at a time', () => {
    const { list, doc } = scrolling(0, 10);
    expect(openChatStep(doc, PLACES, 'Rui', mouse)).toBe('scrolled');
    expect(list.scrollTop).toBe(1);
  });

  it('ends where there is no chat list', () => {
    document.body.innerHTML = '<div id="app"></div>';
    expect(openChatStep(document, PLACES, 'Ana', mouse)).toBe('end');
  });

  it('skips a row whose title has no text', () => {
    const empty = { querySelector: () => ({ textContent: null }), dispatchEvent: vi.fn() };
    const { doc } = scrolling(500, 0, [empty]);
    expect(openChatStep(doc, PLACES, 'Ana', mouse)).toBe('end');
    expect(empty.dispatchEvent).not.toHaveBeenCalled();
  });

  // Mutation testing instruments the function with helpers from outside it,
  // so only uninstrumented source can run on its own.
  it.skipIf(chatOpenerStep('Ana').includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML = LIST;
    const pressed = vi.fn();
    document.querySelector('[data-testid="list-item-1"]')?.addEventListener('mousedown', pressed);
    // Only `document` and the page's own MouseEvent are in scope, as in the isolated world.
    const result: unknown = runInNewContext(chatOpenerStep('Ana Maria'), { document, MouseEvent });
    expect(result).toBe('opened');
    expect(pressed).toHaveBeenCalledOnce();
  });

  it('carries the chat list’s landmarks and a real left click into the page', () => {
    const code = chatOpenerStep('Ana');
    expect(code).toContain(JSON.stringify(PLACES));
    expect(code).toContain(
      '(type) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })',
    );
  });

  it('names the chat as data, never as code', () => {
    expect(chatOpenerStep('"); alert(1); ("')).toContain(JSON.stringify('"); alert(1); ("'));
  });
});

describe('chatListToTop', () => {
  it('puts the chat list back at its top, and says when there is none', () => {
    const { list, doc } = scrolling(500, 1000);
    list.scrollTop = 700;
    expect(chatListToTop(doc, PLACES.chatList)).toBe(true);
    expect(list.scrollTop).toBe(0);
    expect(chatListToTop(doc, '#missing')).toBe(false);
  });

  it.skipIf(CHAT_LIST_TO_TOP.includes('stryMutAct'))('runs as standalone source text', () => {
    document.body.innerHTML = LIST;
    const result: unknown = runInNewContext(CHAT_LIST_TO_TOP, { document });
    expect(result).toBe(true);
    expect(CHAT_LIST_TO_TOP).toContain(JSON.stringify(LANDMARKS.chatList));
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
