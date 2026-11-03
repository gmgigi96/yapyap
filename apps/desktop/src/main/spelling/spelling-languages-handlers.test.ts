import { describe, expect, it } from 'vitest';
import { CHROME_CHANNELS } from '../../shared/api/chrome-api.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import { spellingHandlers } from './spelling-languages-handlers.ts';

const AVAILABLE = [
  'da',
  'de-DE',
  'en-GB',
  'en-US',
  'es-419',
  'fr-FR',
  'it-IT',
  'nb',
  'nl',
  'pl',
  'pt-PT',
  'sv',
];

function setup(spelling: Partial<Settings['spelling']> = {}) {
  const base = defaultSettings();
  let settings: Settings = { ...base, spelling: { ...base.spelling, ...spelling } };
  const service = {
    current: () => settings,
    update: (change: (current: Settings) => Settings) => {
      settings = change(settings);
    },
  };
  const handlers = spellingHandlers(service, {
    available: () => AVAILABLE,
    system: () => ['en-GB'],
  });
  const handler = (channel: string) => {
    const found = handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(`No handler for ${channel}.`);
    }
    return found;
  };
  return { handler, settings: () => settings };
}

const call = { sender: {} } as never;

describe('spellingHandlers', () => {
  it('lists the languages, the chosen ones and those in use', () => {
    const t = setup({ enabled: true });
    const languages = t.handler(CHROME_CHANNELS.spellingLanguages);
    expect(languages.accepts([])).toBe(true);
    expect(languages.accepts(['extra'])).toBe(false);
    expect(languages.handle(call)).toEqual({
      enabled: true,
      available: AVAILABLE,
      chosen: [],
      inUse: ['en-GB'],
    });
  });

  it('saves languages that have a dictionary and answers with what is now in use', () => {
    const t = setup();
    const choose = t.handler(CHROME_CHANNELS.spellingChoose);
    const chosen = ['pt-PT', 'es-419'];
    expect(choose.accepts([chosen])).toBe(true);
    expect(choose.handle(call, chosen)).toMatchObject({ chosen, inUse: chosen });
    expect(t.settings().spelling.languages).toEqual(chosen);
    expect(choose.accepts([[]])).toBe(true);
  });

  it('refuses anything but distinct languages with a dictionary, up to the limit', () => {
    const choose = setup().handler(CHROME_CHANNELS.spellingChoose);
    expect(choose.accepts([['xx-YY']])).toBe(false);
    expect(choose.accepts([['en-GB', 'en-GB']])).toBe(false);
    expect(choose.accepts([[42]])).toBe(false);
    expect(choose.accepts(['en-GB'])).toBe(false);
    expect(choose.accepts([['en-GB'], 'extra'])).toBe(false);
    expect(choose.accepts([AVAILABLE.slice(0, 10)])).toBe(true);
    expect(choose.accepts([AVAILABLE.slice(0, 11)])).toBe(false);
  });
});
