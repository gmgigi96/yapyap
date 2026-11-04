import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  MAX_SPELLING_LANGUAGES,
  type ChromeApi,
  type SpellingLanguages,
} from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.spellingLanguages;

/** A language's name in a locale; the code itself where the locale has none. */
function nameIn(locale: string, code: string): string {
  const names = new Intl.DisplayNames([locale], {
    type: 'language',
    languageDisplay: 'standard',
    fallback: 'none',
  });
  return names.of(code) ?? code;
}

/** Each language in itself, so people find their own, and in English. */
export function languageNames(code: string): { readonly own: string; readonly english: string } {
  return { own: nameIn(code, code), english: nameIn('en', code) };
}

/** Lowercase without accents, so “portugues” finds “Português”. */
const folded = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface Language {
  readonly code: string;
  readonly own: string;
  readonly english: string;
}

/** The chosen languages first, then the rest by English name, keeping those the search matches. */
function listed(state: SpellingLanguages, query: string): Language[] {
  const wanted = folded(query.trim());
  return state.available
    .map((code) => ({ code, ...languageNames(code) }))
    .filter((language) =>
      [language.code, language.own, language.english].some((name) => folded(name).includes(wanted)),
    )
    .sort(
      (a, b) =>
        Number(state.chosen.includes(b.code)) - Number(state.chosen.includes(a.code)) ||
        a.english.localeCompare(b.english, 'en'),
    );
}

function Summary(props: {
  readonly state: SpellingLanguages;
  readonly onChoose: (languages: readonly string[]) => void;
}): JSX.Element {
  const { chosen, inUse } = props.state;
  if (chosen.length > 0) {
    return (
      <p class="summary">
        {text.chosen({ count: chosen.length, max: MAX_SPELLING_LANGUAGES })}{' '}
        <button
          type="button"
          onClick={() => {
            props.onChoose([]);
          }}
        >
          {text.useSystem}
        </button>
      </p>
    );
  }
  const names = inUse.map((code) => languageNames(code).own).join(', ');
  return <p class="summary">{names === '' ? text.noSystem : text.system({ names })}</p>;
}

function LanguageList(props: {
  readonly state: SpellingLanguages;
  readonly query: string;
  readonly onChoose: (languages: readonly string[]) => void;
}): JSX.Element {
  const { chosen } = props.state;
  const languages = listed(props.state, props.query);
  if (languages.length === 0) {
    return <p class="hint">{text.noMatch}</p>;
  }
  const full = chosen.length >= MAX_SPELLING_LANGUAGES;
  return (
    <ul class="languages">
      {languages.map(({ code, own, english }) => {
        const checked = chosen.includes(code);
        return (
          <li key={code}>
            <label>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && full}
                onChange={() => {
                  props.onChoose(
                    checked ? chosen.filter((other) => other !== code) : [...chosen, code],
                  );
                }}
              />
              <span lang={code}>{own}</span>
              {own === english ? null : <span class="hint">{english}</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Picker(props: {
  readonly state: SpellingLanguages;
  readonly onChoose: (languages: readonly string[]) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  return (
    <>
      {props.state.enabled ? null : <p class="hint">{text.off}</p>}
      <p class="hint">{text.download}</p>
      <Summary state={props.state} onChoose={props.onChoose} />
      <input
        type="search"
        aria-label={text.search}
        placeholder={text.search}
        value={query}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
        }}
      />
      <LanguageList state={props.state} query={query} onChoose={props.onChoose} />
    </>
  );
}

function Body(props: {
  readonly state: SpellingLanguages;
  readonly onChoose: (languages: readonly string[]) => void;
}): JSX.Element {
  if (props.state.available.length === 0) {
    return <p class="hint">{text.macos}</p>;
  }
  return <Picker state={props.state} onChoose={props.onChoose} />;
}

/** Picks the languages spell checking uses; none means the system's (#73). */
export function SpellingLanguagesPage({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [state, setState] = useState<SpellingLanguages>();
  useEffect(() => {
    void api.spelling.languages().then(setState);
  }, [api]);
  const choose = useCallback(
    (languages: readonly string[]): void => {
      void api.spelling.choose(languages).then(setState);
    },
    [api],
  );
  return (
    <main class="spelling-languages">
      <h1>{text.title}</h1>
      {state === undefined ? null : <Body state={state} onChoose={choose} />}
    </main>
  );
}
