/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { LANDMARKS } from './page-state.ts';
import { parseUnreadSummary, readUnreadSummary, UNREAD_SUMMARY } from './unread-summary.ts';

const PLACES = {
  chat: LANDMARKS.chatRow,
  unreadCount: LANDMARKS.unreadCount,
  chatTitle: LANDMARKS.chatTitle,
  chatPreview: LANDMARKS.chatPreview,
  extras: `${LANDMARKS.unreadCount}, ${LANDMARKS.chatTimestamp}`,
};
const LIMITS = { chats: 2, name: 8, text: 10 };

/** A chat row as WhatsApp lays it out, with a badge when it is unread. */
const row = (index: number, name: string, preview: string, badge?: string) =>
  `<div role="row" data-testid="list-item-${String(index)}">
    <div data-testid="cell-frame-title"><span>${name}</span></div>
    <span data-testid="chat-list-timestamp">20:01</span>
    <div data-testid="cell-frame-secondary"><span>${preview}</span>${
      badge === undefined ? '' : `<span data-testid="icon-unread-count">${badge}</span>`
    }</div>
  </div>`;

function page(rows: string): Document {
  document.body.innerHTML = `<div id="pane-side">${rows}</div>`;
  return document;
}

/** Lays rows out at `ys`, by their order in the page, as the virtualized list places them. */
function placed(doc: Document, ys: readonly number[]): Document {
  doc.querySelectorAll(LANDMARKS.chatRow).forEach((element, index) => {
    element.getBoundingClientRect = () => ({ y: ys[index] ?? 0 }) as DOMRect;
  });
  return doc;
}

describe('readUnreadSummary', () => {
  it('reads each unread chat’s name, count and preview, without the badge or the time', () => {
    const doc = page(`${row(0, 'Ana', 'Dinner tonight?', '2')}${row(1, 'Team', 'Thanks!')}`);
    expect(readUnreadSummary(doc, PLACES, { chats: 5, name: 50, text: 50 })).toEqual([
      { name: 'Ana', unread: 2, messages: [{ outgoing: false, text: 'Dinner tonight?' }] },
    ]);
  });

  it('lists chats as the screen shows them, top first, up to the limit, cutting long text', () => {
    const doc = placed(
      page(
        [
          row(0, 'Third chat', 'Last one here', '1'),
          row(1, 'First chat', 'Top   of\n the list', '12'),
          row(2, 'Second', 'Middle', '3'),
        ].join(''),
      ),
      [300, 0, 150],
    );
    expect(readUnreadSummary(doc, PLACES, LIMITS)).toEqual([
      { name: 'First ch', unread: 12, messages: [{ outgoing: false, text: 'Top of the' }] },
      { name: 'Second', unread: 3, messages: [{ outgoing: false, text: 'Middle' }] },
    ]);
  });

  it('takes a row whose badge is not a positive count of digits as read', () => {
    const doc = page(
      ['0', '', '5+', 'x', '1234567', '١']
        .map((badge, index) => row(index, 'Chat', 'Hi', badge))
        .join(''),
    );
    expect(readUnreadSummary(doc, PLACES, LIMITS)).toEqual([]);
  });

  it('reads a row missing its name or preview as far as it goes', () => {
    document.body.innerHTML = `<div id="pane-side">
      <div data-testid="list-item-0"><span data-testid="icon-unread-count"> 4 </span></div>
      <div data-testid="list-item-1"><div data-testid="cell-frame-title">Ana</div>
        <div data-testid="cell-frame-secondary"><span data-testid="icon-unread-count">1</span></div></div>
    </div>`;
    expect(readUnreadSummary(placed(document, [0, 1]), PLACES, LIMITS)).toEqual([
      { name: '', unread: 4, messages: [] },
      { name: 'Ana', unread: 1, messages: [] },
    ]);
  });

  it('reads nothing from rows outside the chat list, or from an empty one', () => {
    document.body.innerHTML = `<div>${row(0, 'Elsewhere', 'Hi', '1')}</div>`;
    expect(readUnreadSummary(document, PLACES, LIMITS)).toEqual([]);
    expect(readUnreadSummary(page(''), PLACES, LIMITS)).toEqual([]);
  });
});

describe('UNREAD_SUMMARY', () => {
  // Mutation testing instruments the function with helpers from outside it,
  // so only uninstrumented source can run on its own.
  it.skipIf(UNREAD_SUMMARY.includes('stryMutAct'))('runs as standalone source text', () => {
    const doc = page(`${row(0, 'Ana', 'Dinner tonight?', '2')}${row(1, 'Team', 'Thanks!')}`);
    const result = runInNewContext(UNREAD_SUMMARY, { document: doc }) as unknown;
    expect(parseUnreadSummary(result)).toEqual([
      { name: 'Ana', unread: 2, messages: [{ outgoing: false, text: 'Dinner tonight?' }] },
    ]);
  });

  it('reads the list’s landmarks, at most 20 chats', () => {
    expect(UNREAD_SUMMARY).toContain(JSON.stringify(LANDMARKS.chatRow));
    expect(UNREAD_SUMMARY).toContain('"chats":20');
  });
});

describe('parseUnreadSummary', () => {
  const chat = { name: 'Team', unread: 3, messages: [{ outgoing: false, text: 'Hi' }] };

  it('accepts the reader’s exact shape', () => {
    expect(parseUnreadSummary([])).toEqual([]);
    expect(parseUnreadSummary([chat, { ...chat, messages: [] }])).toEqual([
      chat,
      { ...chat, messages: [] },
    ]);
  });

  it('rejects anything else the page could make of it', () => {
    for (const value of [
      null,
      chat,
      [{ ...chat, unread: 0 }],
      [{ ...chat, unread: 1.5 }],
      [{ ...chat, unread: 1_000_000 }],
      [{ ...chat, name: 'x'.repeat(257) }],
      [{ ...chat, html: '<b>' }],
      [{ ...chat, messages: [{ outgoing: true, text: 'Hi' }] }],
      [{ ...chat, messages: [{ outgoing: false, text: '' }] }],
      [{ ...chat, messages: [{ outgoing: false, text: 'x'.repeat(1025) }] }],
      [{ ...chat, messages: [chat.messages[0], chat.messages[0]] }],
      Array.from({ length: 21 }, () => chat),
    ]) {
      expect(parseUnreadSummary(value)).toBeUndefined();
    }
    expect(parseUnreadSummary(Array.from({ length: 20 }, () => chat))).toHaveLength(20);
  });
});
