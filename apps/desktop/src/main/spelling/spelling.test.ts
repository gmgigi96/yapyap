import { describe, expect, it, vi } from 'vitest';
import { fakeSettings } from '../../../test/fake-settings.ts';
import { followSpellingSetting, spellingLanguagesOf } from './spelling.ts';

const AVAILABLE = ['de-DE', 'en-GB', 'en-US', 'pt-BR', 'pt-PT', 'sv'];

describe('spellingLanguagesOf', () => {
  it('uses the languages the user chose that have a dictionary', () => {
    expect(spellingLanguagesOf(['pt-PT', 'xx-YY', 'de-DE'], ['en-GB'], AVAILABLE)).toEqual([
      'pt-PT',
      'de-DE',
    ]);
  });

  it('otherwise uses the first system language with a dictionary', () => {
    expect(spellingLanguagesOf([], ['fy-NL', 'en-US', 'de-DE'], AVAILABLE)).toEqual(['en-US']);
    expect(spellingLanguagesOf(['xx-YY'], ['pt-PT'], AVAILABLE)).toEqual(['pt-PT']);
  });

  it('falls back to the same language in another region, or with no region', () => {
    expect(spellingLanguagesOf([], ['de-AT'], AVAILABLE)).toEqual(['de-DE']);
    expect(spellingLanguagesOf([], ['sv-SE'], AVAILABLE)).toEqual(['sv']);
    expect(spellingLanguagesOf([], ['de'], AVAILABLE)).toEqual(['de-DE']);
  });

  it('checks nothing when no language has a dictionary', () => {
    expect(spellingLanguagesOf([], ['fy-NL'], AVAILABLE)).toEqual([]);
    expect(spellingLanguagesOf([], [], AVAILABLE)).toEqual([]);
  });
});

const session = (available = AVAILABLE) => ({
  setSpellCheckerEnabled: vi.fn(),
  setSpellCheckerLanguages: vi.fn(),
  availableSpellCheckerLanguages: available,
});

describe('followSpellingSetting', () => {
  it('lists no language while spelling is off, so no dictionary is fetched', () => {
    const settings = fakeSettings({ spelling: { languages: ['pt-PT'] } });
    const page = session();
    followSpellingSetting(settings, () => ['en-GB']).guard(page);
    expect(page.setSpellCheckerLanguages).toHaveBeenCalledExactlyOnceWith([]);
    expect(page.setSpellCheckerEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('checks the system language once turned on, and the chosen ones when there are', () => {
    const settings = fakeSettings();
    const page = session();
    followSpellingSetting(settings, () => ['en-GB']).guard(page);
    settings.change({ spelling: { enabled: true } });
    expect(page.setSpellCheckerLanguages).toHaveBeenLastCalledWith(['en-GB']);
    expect(page.setSpellCheckerEnabled).toHaveBeenLastCalledWith(true);
    settings.change({ spelling: { languages: ['pt-PT', 'de-DE'] } });
    expect(page.setSpellCheckerLanguages).toHaveBeenLastCalledWith(['pt-PT', 'de-DE']);
  });

  it('leaves languages to macOS, whose spell checker lists none', () => {
    const settings = fakeSettings({ spelling: { enabled: true } });
    const page = session([]);
    followSpellingSetting(settings, () => ['en-GB']).guard(page);
    expect(page.setSpellCheckerLanguages).not.toHaveBeenCalled();
    expect(page.setSpellCheckerEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });
});
