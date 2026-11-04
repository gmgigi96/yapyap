import {
  entries,
  placeholders,
  type CatalogJson,
  type Entry,
} from '../../../apps/desktop/src/shared/messages/catalog.ts';

/** Tags and character references: a catalog holds text, which YapYap never renders as markup. */
const MARKUP = /<\/?[a-z][^>]*>|&#?\w+;/i;

/** Where `key` sits below `path` in a catalog, as `a.b.c`. */
const keyPath = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

const sameNames = (a: readonly string[], b: readonly string[]): boolean =>
  a.join(',') === b.join(',');

/** A plural form's placeholders, apart from `count`, which a form such as "one chat" may omit. */
const formNames = (text: string): string[] => placeholders(text).filter((name) => name !== 'count');

function texts(entry: Entry): string[] {
  if (entry.kind === 'text') {
    return [entry.text];
  }
  return entry.kind === 'plural' ? Object.values(entry.forms) : [];
}

function textProblems(path: string, entry: Entry): string[] {
  return texts(entry).flatMap((text) => [
    ...(text.trim() === '' ? [`${path} is empty.`] : []),
    ...(MARKUP.test(text) ? [`${path} contains markup.`] : []),
  ]);
}

function pluralProblems(
  path: string,
  english: Readonly<Record<string, string>>,
  translated: Readonly<Record<string, string>>,
  needed: readonly string[],
): string[] {
  const expected = formNames(english['other'] ?? '');
  return [
    ...needed
      .filter((form) => translated[form] === undefined)
      .map((form) => `${path} has no "${form}" form, which its language needs.`),
    ...Object.entries(translated)
      .filter(([, text]) => !sameNames(formNames(text), expected))
      .map(([form]) => `${path}_${form} has placeholders English's does not.`),
  ];
}

function entryProblems(
  path: string,
  english: Entry,
  translated: Entry,
  needed: readonly string[],
): string[] {
  const mismatch = [`${path} is a ${translated.kind} here but a ${english.kind} in English.`];
  if (english.kind === 'text') {
    if (translated.kind !== 'text') {
      return mismatch;
    }
    const same = sameNames(placeholders(english.text), placeholders(translated.text));
    return same ? [] : [`${path} has placeholders English's does not.`];
  }
  if (english.kind === 'plural') {
    return translated.kind === 'plural'
      ? pluralProblems(path, english.forms, translated.forms, needed)
      : mismatch;
  }
  return translated.kind === 'group'
    ? levelProblems(path, english.group, translated.group, needed)
    : mismatch;
}

function levelProblems(
  path: string,
  english: CatalogJson,
  translation: CatalogJson,
  needed: readonly string[],
): string[] {
  const known = entries(english);
  return [...entries(translation)].flatMap(([key, entry]) => {
    const at = keyPath(path, key);
    const source = known.get(key);
    if (source === undefined) {
      return [`${at} is not in English.`];
    }
    return [...textProblems(at, entry), ...entryProblems(at, source, entry, needed)];
  });
}

/** Translation tools such as Weblate read a `.` in a key as nesting, so a round trip would move it (#374). */
const keyProblems = (at: string, key: string): string[] =>
  key.includes('.') ? [`${at} has a "." in its key, which translation tools read as nesting.`] : [];

/** Problems in English itself: dotted keys, empty text, markup, and plurals without their English forms. */
export function checkEnglish(english: CatalogJson, path = ''): string[] {
  return [...entries(english)].flatMap(([key, entry]) => {
    const at = keyPath(path, key);
    if (entry.kind === 'group') {
      return [...keyProblems(at, key), ...checkEnglish(entry.group, at)];
    }
    const forms =
      entry.kind === 'plural' ? pluralProblems(at, entry.forms, entry.forms, ['one', 'other']) : [];
    return [...keyProblems(at, key), ...textProblems(at, entry), ...forms];
  });
}

/**
 * Why a translation cannot ship as it is (ADR 0012): keys English lacks,
 * placeholders that differ from English's, plural forms its language needs
 * but lacks, and markup. Keys it has not translated yet are fine: they fall
 * back to English.
 */
export function checkTranslation(
  english: CatalogJson,
  translation: CatalogJson,
  tag: string,
): string[] {
  const needed = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
  return levelProblems('', english, translation, needed);
}

/** Whether a parsed file is a catalog: objects of strings and further objects, all the way down. */
function isCatalog(value: unknown): value is CatalogJson {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((child) => typeof child === 'string' || isCatalog(child))
  );
}

function parse(name: string, text: string): CatalogJson | string {
  try {
    const value: unknown = JSON.parse(text);
    return isCatalog(value) ? value : `${name} is not a catalog of nested strings.`;
  } catch {
    return `${name} is not valid JSON.`;
  }
}

function languageOf(name: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(name.replace(/\.json$/, ''))[0];
  } catch {
    return undefined;
  }
}

/** What a catalog folder and the generated type must hold for CI to pass (ADR 0012). */
export interface CatalogFiles {
  /** Every `<tag>.json` in the folder, by file name. */
  readonly catalogs: ReadonlyMap<string, string>;
  /** The type file as committed, and as `en.json` generates it now. */
  readonly committedType: string;
  readonly expectedType: string;
}

/** Every problem across the catalogs, each naming its file. */
export function checkCatalogFiles(files: CatalogFiles): string[] {
  const english = parse('en.json', files.catalogs.get('en.json') ?? '');
  if (typeof english === 'string') {
    return [english];
  }
  const stale =
    files.committedType === files.expectedType
      ? []
      : ['The generated Messages type is out of date: run scripts/src/bin/i18n-types.ts.'];
  const others = [...files.catalogs].filter(([name]) => name !== 'en.json');
  return [
    ...checkEnglish(english).map((problem) => `en.json: ${problem}`),
    ...stale,
    ...others.flatMap(([name, text]) => {
      const tag = languageOf(name);
      const translation = parse(name, text);
      if (tag === undefined) {
        return [`${name} is not named after a language tag.`];
      }
      return typeof translation === 'string'
        ? [translation]
        : checkTranslation(english, translation, tag).map((problem) => `${name}: ${problem}`);
    }),
  ];
}
