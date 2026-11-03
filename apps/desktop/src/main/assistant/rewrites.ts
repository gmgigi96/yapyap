import { en } from '../../shared/messages/en.ts';

/** How the user wants their draft rewritten (#105). */
type RewriteStyle = 'friendlier' | 'formal' | 'shorter' | 'translate';

/** A rewrite the bar offers: a style, and for a translation, the language's English name. */
export interface Rewrite {
  readonly style: RewriteStyle;
  readonly language: string;
}

const ASKS: Readonly<Record<RewriteStyle, (language: string) => string>> = {
  friendlier: () => 'so it sounds warmer and friendlier',
  formal: () => 'so it sounds more formal and polite',
  shorter: () => 'so it is shorter and to the point',
  translate: (language) => `translated into ${language}`,
};

/** What the model is asked to do with the draft, shown with it when asked what is sent. */
export function rewriteInstructions({ style, language }: Rewrite): string {
  return [
    `Rewrite the WhatsApp message the user drafted ${ASKS[style](language)}.`,
    'Keep its meaning, and anything it names, such as times and places.',
    'Answer with the rewritten message only, with no quotes or other text.',
  ].join(' ');
}

/** A model's text without the quotes it may put around it, as around a rewritten draft. */
export function cleanRewrite(answer: string): string {
  return answer
    .trim()
    .replaceAll(/^["“”']|["“”']$/g, '')
    .trim();
}

/** As many languages as the bar offers to translate to. */
const MAX_LANGUAGES = 4;

const TRANSLATE = 'translate:';

/**
 * The languages to offer translating to: the system's, then English, by
 * their base language and without repeats, as `pt` for `pt-BR`.
 */
export function translationLanguages(system: readonly string[]): readonly string[] {
  const codes = [...system, 'en']
    .map((tag) => tag.split('-', 1).join('').toLowerCase())
    .filter((code) => /^[a-z]{2,3}$/.test(code));
  return [...new Set(codes)].slice(0, MAX_LANGUAGES);
}

const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

/** A language's name in English, which the model reads, or undefined for a code without one. */
const languageName = (code: string): string | undefined => names.of(code);

/** The rewrites the bar offers: the styles, then translating to each of `languages`. */
export function rewriteOptions(
  languages: readonly string[],
): readonly { readonly value: string; readonly label: string }[] {
  const styles = en.assistant.bar.styles;
  const translations = languages.flatMap((code) => {
    const language = languageName(code);
    return language === undefined
      ? []
      : [{ value: `${TRANSLATE}${code}`, label: en.assistant.bar.translate({ language }) }];
  });
  return [
    { value: 'friendlier', label: styles.friendlier },
    { value: 'formal', label: styles.formal },
    { value: 'shorter', label: styles.shorter },
    ...translations,
  ];
}

/** The rewrite an offered value names, or undefined for anything the bar did not offer. */
export function rewriteOf(value: string, languages: readonly string[]): Rewrite | undefined {
  if (value === 'friendlier' || value === 'formal' || value === 'shorter') {
    return { style: value, language: '' };
  }
  const code = value.startsWith(TRANSLATE) ? value.slice(TRANSLATE.length) : '';
  const language = languages.includes(code) ? languageName(code) : undefined;
  return language === undefined ? undefined : { style: 'translate', language };
}
