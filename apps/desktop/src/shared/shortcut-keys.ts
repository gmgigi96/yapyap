/** Modifiers in Electron's accelerator syntax; `CmdOrCtrl` is ⌘ on macOS and Ctrl elsewhere. */
const MODIFIERS = new Set(['CmdOrCtrl', 'Cmd', 'Ctrl', 'Alt', 'Shift', 'Super']);

/** Keys as `KeyboardEvent.code` names them, for the keys that are not letters or digits. */
const CODES: Readonly<Record<string, string>> = {
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Enter: 'Enter',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
};

/** Keys a shortcut may end in, besides letters, digits and function keys. */
const NAMED_KEYS = new Set(Object.values(CODES));

/** F1 to F24. */
const FUNCTION_KEYS = /^F(?:[1-9]|1\d|2[0-4])$/;

const isKey = (key: string): boolean =>
  /^[A-Z0-9]$/.test(key) || FUNCTION_KEYS.test(key) || NAMED_KEYS.has(key);

/** A function key, which may stand alone; any other key needs a modifier. */
const FUNCTION_KEY = /^F\d+$/;

interface Parsed {
  readonly modifiers: readonly string[];
  readonly key: string;
}

/** Splits an accelerator into its modifiers and its key; `+` itself is never a key here. */
function parse(accelerator: string): Parsed | undefined {
  const last = accelerator.lastIndexOf('+');
  const key = accelerator.slice(last + 1);
  const modifiers = last === -1 ? [] : accelerator.slice(0, last).split('+');
  const known = modifiers.every((modifier) => MODIFIERS.has(modifier));
  const distinct = new Set(modifiers).size === modifiers.length;
  return known && distinct && isKey(key) ? { modifiers, key } : undefined;
}

/** Whether YapYap may bind these keys: one key, any known modifiers, and a modifier unless it is F1 to F24. */
export function isValidShortcut(accelerator: string): boolean {
  const parsed = parse(accelerator);
  return parsed !== undefined && (parsed.modifiers.length > 0 || FUNCTION_KEY.test(parsed.key));
}

/** The keys a platform really presses, so `CmdOrCtrl+Q` and `Ctrl+Q` match on Linux. */
function pressed(accelerator: string, platform: string): string | undefined {
  const parsed = parse(accelerator);
  if (parsed === undefined) {
    return undefined;
  }
  const primary = platform === 'darwin' ? 'Cmd' : 'Ctrl';
  const modifiers = parsed.modifiers.map((modifier) =>
    modifier === 'CmdOrCtrl' ? primary : modifier,
  );
  return [...new Set(modifiers)]
    .sort((a, b) => a.localeCompare(b))
    .concat(parsed.key)
    .join('+');
}

/** Account switching takes its digit and the eight after it, as `Ctrl+1` to `Ctrl+9`. */
const FAMILY_SIZE = 9;

function bindings(id: string, accelerator: string): readonly string[] {
  if (id !== 'switchAccount') {
    return [accelerator];
  }
  const prefix = accelerator.slice(0, -1);
  return Array.from({ length: FAMILY_SIZE }, (_, index) => `${prefix}${String(index + 1)}`);
}

/** The first other shortcut that already uses these keys, if any. */
export function conflictOf(
  id: string,
  accelerator: string,
  others: readonly { readonly id: string; readonly accelerator: string }[],
  platform: string,
): string | undefined {
  const wanted = new Set(bindings(id, accelerator).map((each) => pressed(each, platform)));
  return others.find(
    (other) =>
      other.id !== id &&
      bindings(other.id, other.accelerator).some((each) => wanted.has(pressed(each, platform))),
  )?.id;
}

/** The key of a `KeyboardEvent.code`, by position rather than by the character it types. */
function keyOf(code: string): string | undefined {
  const letterOrDigit = /^(?:Key([A-Z])|Digit(\d))$/.exec(code);
  if (letterOrDigit !== null) {
    return letterOrDigit[1] ?? letterOrDigit[2];
  }
  return FUNCTION_KEY.test(code) ? code : CODES[code];
}

/** The part of a `KeyboardEvent` a shortcut is made of. */
export interface KeyPress {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** What a key press asks for, in accelerator syntax; undefined for a lone modifier or an unknown key. */
export function acceleratorFromKeys(event: KeyPress, platform: string): string | undefined {
  const key = keyOf(event.code);
  if (key === undefined) {
    return undefined;
  }
  return [...modifiersOf(event, platform === 'darwin'), key].join('+');
}

/** The modifiers held, with the platform's main one written as `CmdOrCtrl`. */
function modifiersOf(event: KeyPress, mac: boolean): string[] {
  const held: [boolean, string][] = [
    [mac ? event.metaKey : event.ctrlKey, 'CmdOrCtrl'],
    [mac && event.ctrlKey, 'Ctrl'],
    [!mac && event.metaKey, 'Super'],
    [event.altKey, 'Alt'],
    [event.shiftKey, 'Shift'],
  ];
  return held.filter(([down]) => down).map(([, modifier]) => modifier);
}
