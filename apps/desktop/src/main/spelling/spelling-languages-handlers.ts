import {
  CHROME_CHANNELS,
  MAX_SPELLING_LANGUAGES,
  type SpellingLanguages,
} from '../../shared/chrome-api.ts';
import type { Settings } from '../settings/schema.ts';
import type { SettingsService } from '../settings/service.ts';
import { spellingLanguagesOf } from './spelling.ts';
import { argumentsOf, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

/** Where the window's languages come from. */
export interface SpellingSources {
  /** The languages Chromium has dictionaries for; empty on macOS. */
  readonly available: () => readonly string[];
  /** `app.getPreferredSystemLanguages()`. */
  readonly system: () => readonly string[];
}

function snapshotOf(settings: Settings, sources: SpellingSources): SpellingLanguages {
  const available = sources.available();
  const { enabled, languages } = settings.spelling;
  return {
    enabled,
    available,
    chosen: languages,
    inUse: spellingLanguagesOf(languages, sources.system(), available),
  };
}

/** Only distinct languages that have a dictionary, and no more than the limit. */
function acceptsLanguages(languages: unknown, available: readonly string[]): boolean {
  return (
    Array.isArray(languages) &&
    languages.length <= MAX_SPELLING_LANGUAGES &&
    new Set(languages).size === languages.length &&
    languages.every((language) => typeof language === 'string' && available.includes(language))
  );
}

/** The Spelling Languages window's operations (#73). */
export function spellingHandlers(
  settings: Pick<SettingsService, 'current' | 'update'>,
  sources: SpellingSources,
): ChromeHandler[] {
  const snapshot = (): SpellingLanguages => snapshotOf(settings.current(), sources);
  return [
    { channel: CHROME_CHANNELS.spellingLanguages, accepts: noArguments, handle: snapshot },
    {
      channel: CHROME_CHANNELS.spellingChoose,
      accepts: argumentsOf((languages) => acceptsLanguages(languages, sources.available())),
      handle: (_call, languages) => {
        settings.update((current) => ({
          ...current,
          spelling: { ...current.spelling, languages: [...(languages as string[])] },
        }));
        return snapshot();
      },
    },
  ];
}
