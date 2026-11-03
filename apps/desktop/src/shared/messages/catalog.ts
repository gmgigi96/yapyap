/** A message catalog as translators edit it: nested keys and plain strings (ADR 0012). */
export interface CatalogJson {
  readonly [key: string]: string | CatalogJson;
}

/** The values a message with placeholders takes, by placeholder name. */
type Params = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
/** The CLDR plural categories, as i18next's JSON v4 suffixes keys with them. */
const PLURAL = /_(zero|one|two|few|many|other)$/;

/** The names of a message's placeholders, sorted and without repeats. */
export function placeholders(text: string): string[] {
  const found = text.match(PLACEHOLDER) ?? [];
  const names = found.map((placeholder) => placeholder.replace(/[{}]/g, ''));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/** A key without its plural suffix, and the plural category it names, if any. */
export function pluralKey(key: string): {
  readonly base: string;
  readonly form: string | undefined;
} {
  const match = PLURAL.exec(key);
  return match === null
    ? { base: key, form: undefined }
    : { base: key.slice(0, match.index), form: match[1] };
}

const sameNames = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((name, index) => name === b[index]);

/**
 * Puts the values into the text, once: a value is inserted as text and never
 * read for placeholders itself, so a name or a translation cannot inject
 * anything. Numbers are written the way the catalog's language writes them.
 */
function interpolate(text: string, params: Params, numbers: Intl.NumberFormat): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) {
      return whole;
    }
    return typeof value === 'number' ? numbers.format(value) : value;
  });
}

interface Language {
  readonly numbers: Intl.NumberFormat;
  readonly plurals: Intl.PluralRules;
}

const language = (locale: string): Language => ({
  numbers: new Intl.NumberFormat(locale),
  plurals: new Intl.PluralRules(locale),
});

/** One message: the text itself, or a function of its placeholders. */
function message(text: string, from: Language): string | ((params: Params) => string) {
  return placeholders(text).length === 0
    ? text
    : (params) => interpolate(text, params, from.numbers);
}

/**
 * A plural message: the translated forms when they cover every category the
 * language needs and keep English's placeholders (apart from `count`, which
 * a form such as "one chat" may leave out), else English's.
 */
function plural(
  english: Readonly<Record<string, string>>,
  translated: Readonly<Record<string, string>>,
  languages: Languages,
): (params: Params) => string {
  const names = (text: string): string[] => placeholders(text).filter((name) => name !== 'count');
  const expected = names(english['other'] ?? '');
  const needed = languages.translated.plurals.resolvedOptions().pluralCategories;
  const usable = needed.every((form) => {
    const text = translated[form];
    return text !== undefined && sameNames(names(text), expected);
  });
  const [forms, from] = usable ? [translated, languages.translated] : [english, languages.english];
  return (params) => {
    const count = Number(params['count'] ?? 0);
    const text = forms[from.plurals.select(count)] ?? forms['other'] ?? '';
    return interpolate(text, params, from.numbers);
  };
}

export type Entry =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'plural'; readonly forms: Readonly<Record<string, string>> }
  | { readonly kind: 'group'; readonly group: CatalogJson };

/** A level's keys, with the plural forms of one message gathered under its base key. */
export function entries(level: CatalogJson): Map<string, Entry> {
  const found = new Map<string, Entry>();
  for (const [key, value] of Object.entries(level)) {
    const { base, form } = pluralKey(key);
    if (typeof value !== 'string') {
      found.set(key, { kind: 'group', group: value });
    } else if (form === undefined) {
      found.set(key, { kind: 'text', text: value });
    } else {
      const previous = found.get(base);
      const forms = previous?.kind === 'plural' ? previous.forms : {};
      found.set(base, { kind: 'plural', forms: { ...forms, [form]: value } });
    }
  }
  return found;
}

interface Languages {
  readonly english: Language;
  readonly translated: Language;
}

/** A message in the translation's words when it keeps English's placeholders, else English's. */
function textEntry(english: string, other: Entry | undefined, languages: Languages): unknown {
  const usable =
    other?.kind === 'text' && sameNames(placeholders(other.text), placeholders(english));
  return usable ? message(other.text, languages.translated) : message(english, languages.english);
}

/** One English entry, from the translation's entry under the same key where it is usable. */
function built(entry: Entry, other: Entry | undefined, languages: Languages): unknown {
  if (entry.kind === 'text') {
    return textEntry(entry.text, other, languages);
  }
  if (entry.kind === 'plural') {
    return plural(entry.forms, other?.kind === 'plural' ? other.forms : {}, languages);
  }
  return build(entry.group, other?.kind === 'group' ? other.group : {}, languages);
}

function build(english: CatalogJson, translation: CatalogJson, languages: Languages): object {
  const theirs = entries(translation);
  return Object.fromEntries(
    Array.from(entries(english), ([key, entry]) => [key, built(entry, theirs.get(key), languages)]),
  );
}

/**
 * The catalog for `locale`, shaped like English: every key English has,
 * translated where the translation has it with the same placeholders, and in
 * English otherwise (ADR 0012). Messages with placeholders or plurals become
 * functions of named values.
 */
export function buildCatalog(
  english: CatalogJson,
  translation: CatalogJson,
  locale: string,
): object {
  return build(english, translation, { english: language('en'), translated: language(locale) });
}
