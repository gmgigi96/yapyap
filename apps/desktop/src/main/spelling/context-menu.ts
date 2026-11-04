import { en } from '../../shared/messages/en.ts';

/** The part of Electron's `context-menu` details the menu depends on. */
export interface ContextMenuParams {
  /** Where the click was, in the view's coordinates. */
  readonly x: number;
  readonly y: number;
  readonly isEditable: boolean;
  readonly selectionText: string;
  readonly misspelledWord: string;
  readonly dictionarySuggestions: string[];
  readonly editFlags: {
    readonly canCut: boolean;
    readonly canCopy: boolean;
    readonly canPaste: boolean;
    readonly canSelectAll: boolean;
  };
}

/** A menu entry, as `Menu.buildFromTemplate` takes it. */
export interface ContextMenuItem {
  readonly label?: string;
  readonly role?: 'cut' | 'copy' | 'paste' | 'selectAll';
  readonly type?: 'separator' | 'checkbox';
  readonly checked?: boolean;
  readonly enabled?: boolean;
  readonly click?: () => void;
}

export interface ContextMenuActions {
  readonly spellingOn: () => boolean;
  readonly replaceMisspelling: (word: string) => void;
  readonly addToDictionary: (word: string) => void;
  readonly turnSpellingOff: () => void;
  /** Settings explains the dictionary download before spelling can come on (C24). */
  readonly openSettings: () => void;
  readonly openLanguages: () => void;
}

/** Long lists push the editing entries out of reach; Chromium's own menu stops at five too. */
const MAX_SUGGESTIONS = 5;

const SEPARATOR: ContextMenuItem = { type: 'separator' };

function spellingItems(params: ContextMenuParams, actions: ContextMenuActions): ContextMenuItem[] {
  const word = params.misspelledWord;
  if (word === '') {
    return [];
  }
  const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS).map((suggestion) => ({
    label: suggestion,
    click: () => {
      actions.replaceMisspelling(suggestion);
    },
  }));
  return [
    ...(suggestions.length > 0
      ? suggestions
      : [{ label: en.contextMenu.noSuggestions, enabled: false }]),
    {
      label: en.contextMenu.addToDictionary,
      click: () => {
        actions.addToDictionary(word);
      },
    },
    SEPARATOR,
  ];
}

function spellingSwitch(actions: ContextMenuActions): ContextMenuItem[] {
  const on = actions.spellingOn();
  return [
    {
      label: en.contextMenu.checkSpelling,
      type: 'checkbox',
      checked: on,
      click: on ? actions.turnSpellingOff : actions.openSettings,
    },
    ...(on ? [{ label: en.contextMenu.languages, click: actions.openLanguages }] : []),
  ];
}

/** What a right click offers: editing and spelling in text boxes, and Copy for selected text. */
export function contextMenuOf(
  params: ContextMenuParams,
  actions: ContextMenuActions,
): ContextMenuItem[] {
  const flags = params.editFlags;
  if (params.isEditable) {
    return [
      ...spellingItems(params, actions),
      { role: 'cut', enabled: flags.canCut },
      { role: 'copy', enabled: flags.canCopy },
      { role: 'paste', enabled: flags.canPaste },
      SEPARATOR,
      { role: 'selectAll', enabled: flags.canSelectAll },
      SEPARATOR,
      ...spellingSwitch(actions),
    ];
  }
  return params.selectionText.trim() === '' ? [] : [{ role: 'copy', enabled: flags.canCopy }];
}

export interface MenuPage {
  on(event: 'context-menu', listener: (event: unknown, params: ContextMenuParams) => void): unknown;
}

/** Shows the context menu on a page; nothing at all where there is nothing to offer. */
export function attachContextMenu(
  page: MenuPage,
  actions: ContextMenuActions,
  popup: (items: ContextMenuItem[]) => void,
): void {
  page.on('context-menu', (_event, params) => {
    const items = contextMenuOf(params, actions);
    if (items.length > 0) {
      popup(items);
    }
  });
}
