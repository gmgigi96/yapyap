import { describe, expect, it, vi } from 'vitest';
import { attachContextMenu, contextMenuOf, type ContextMenuParams } from './context-menu.ts';

const ALL_FLAGS = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };

const params = (overrides: Partial<ContextMenuParams> = {}): ContextMenuParams => ({
  x: 10,
  y: 20,
  isEditable: true,
  selectionText: '',
  misspelledWord: '',
  dictionarySuggestions: [],
  editFlags: ALL_FLAGS,
  ...overrides,
});

const actions = (spellingOn = false) => ({
  spellingOn: () => spellingOn,
  replaceMisspelling: vi.fn(),
  addToDictionary: vi.fn(),
  turnSpellingOff: vi.fn(),
  openSettings: vi.fn(),
  openLanguages: vi.fn(),
});

const labels = (items: ReturnType<typeof contextMenuOf>) =>
  items.map((item) => item.label ?? item.role ?? item.type);

describe('contextMenuOf', () => {
  it('offers editing in a text box, and leads to Settings to turn spelling on', () => {
    const act = actions();
    const items = contextMenuOf(params({ editFlags: { ...ALL_FLAGS, canCut: false } }), act);
    expect(labels(items)).toEqual([
      'cut',
      'copy',
      'paste',
      'separator',
      'selectAll',
      'separator',
      'Check Spelling',
    ]);
    expect(items.at(-1)).toMatchObject({ type: 'checkbox', checked: false });
    expect(items[0]?.enabled).toBe(false);
    items.at(-1)?.click?.();
    expect(act.openSettings).toHaveBeenCalledOnce();
  });

  it('puts at most five suggestions first, and learns the word on request', () => {
    const act = actions(true);
    const items = contextMenuOf(
      params({
        misspelledWord: 'teh',
        dictionarySuggestions: ['the', 'ten', 'tea', 'tech', 'eh', 'ted'],
      }),
      act,
    );
    expect(labels(items).slice(0, 7)).toEqual([
      'the',
      'ten',
      'tea',
      'tech',
      'eh',
      'Add to Dictionary',
      'separator',
    ]);
    items[2]?.click?.();
    expect(act.replaceMisspelling).toHaveBeenCalledExactlyOnceWith('tea');
    items[5]?.click?.();
    expect(act.addToDictionary).toHaveBeenCalledExactlyOnceWith('teh');
  });

  it('turns spelling off, or opens its languages, once it is on', () => {
    const act = actions(true);
    const items = contextMenuOf(params(), act);
    const toggle = items.at(-2);
    expect(toggle).toMatchObject({ label: 'Check Spelling', type: 'checkbox', checked: true });
    toggle?.click?.();
    expect(act.turnSpellingOff).toHaveBeenCalledOnce();
    const languages = items.at(-1);
    expect(languages?.label).toBe('Languages…');
    languages?.click?.();
    expect(act.openLanguages).toHaveBeenCalledOnce();
  });

  it('says so when a misspelled word has no suggestions', () => {
    const items = contextMenuOf(params({ misspelledWord: 'qwzx' }), actions(true));
    expect(items[0]).toEqual({ label: 'No Suggestions', enabled: false });
  });

  it('offers Copy for selected text outside a text box, and nothing without a selection', () => {
    expect(
      labels(contextMenuOf(params({ isEditable: false, selectionText: 'Hi' }), actions())),
    ).toEqual(['copy']);
    expect(contextMenuOf(params({ isEditable: false, selectionText: '  ' }), actions())).toEqual(
      [],
    );
  });
});

describe('attachContextMenu', () => {
  function page() {
    let rightClick: ((event: unknown, details: ContextMenuParams) => void) | undefined;
    return {
      on: vi.fn((_event: 'context-menu', listener: typeof rightClick) => {
        rightClick = listener;
      }),
      click: (details: ContextMenuParams) => {
        rightClick?.({}, details);
      },
    };
  }

  it('shows the menu on a right click, and nothing where there is nothing to offer', async () => {
    const clicked = page();
    const popup = vi.fn();
    attachContextMenu(clicked, actions(), popup);
    clicked.click(params({ isEditable: false }));
    await Promise.resolve();
    expect(popup).not.toHaveBeenCalled();
    clicked.click(params());
    await vi.waitFor(() => {
      expect(popup).toHaveBeenCalledOnce();
    });
  });
});
