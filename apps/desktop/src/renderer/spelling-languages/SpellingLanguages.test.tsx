/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { SpellingLanguages } from '../../shared/api/chrome-api.ts';
import { languageNames, SpellingLanguagesPage } from './SpellingLanguages.tsx';

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

function api(initial: Partial<SpellingLanguages>) {
  let state: SpellingLanguages = {
    enabled: true,
    available: AVAILABLE,
    chosen: [],
    inUse: ['en-GB'],
    ...initial,
  };
  const choose = vi.fn((languages: readonly string[]) => {
    state = { ...state, chosen: languages, inUse: languages.length > 0 ? languages : ['en-GB'] };
    return Promise.resolve(state);
  });
  return fakeChromeApi({ spelling: { languages: vi.fn(() => Promise.resolve(state)), choose } });
}

const box = (name: string) =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: new RegExp(name) });

describe('languageNames', () => {
  it('names a language in itself and in English, or by its code when unknown', () => {
    expect(languageNames('pt-PT')).toEqual({
      own: 'português (Portugal)',
      english: 'Portuguese (Portugal)',
    });
    expect(languageNames('qaa')).toEqual({ own: 'qaa', english: 'qaa' });
  });
});

describe('SpellingLanguagesPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('checks the system language until the user picks others, and can go back to it', async () => {
    const yapyap = api({});
    render(<SpellingLanguagesPage api={yapyap} />);
    expect(
      await screen.findByText('Checking your system’s language: English (United Kingdom).'),
    ).toBeTruthy();
    fireEvent.click(box('português'));
    await waitFor(() => {
      expect(box('português').checked).toBe(true);
    });
    expect(yapyap.spelling.choose).toHaveBeenLastCalledWith(['pt-PT']);
    expect(screen.getByText(/1 of 10 chosen\./)).toBeTruthy();
    fireEvent.click(box('Deutsch'));
    await waitFor(() => {
      expect(yapyap.spelling.choose).toHaveBeenLastCalledWith(['pt-PT', 'de-DE']);
    });
    fireEvent.click(box('português'));
    await waitFor(() => {
      expect(yapyap.spelling.choose).toHaveBeenLastCalledWith(['de-DE']);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use System Language' }));
    await waitFor(() => {
      expect(yapyap.spelling.choose).toHaveBeenLastCalledWith([]);
    });
  });

  it('finds a language by its own name, its English name or its code, ignoring accents', async () => {
    render(<SpellingLanguagesPage api={api({})} />);
    const search = await screen.findByRole('searchbox', { name: 'Search languages' });
    fireEvent.input(search, { target: { value: 'portugues' } });
    expect(
      screen.getAllByRole('checkbox').map((input) => input.closest('label')?.textContent),
    ).toEqual(['português (Portugal)Portuguese (Portugal)']);
    fireEvent.input(search, { target: { value: 'German' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.input(search, { target: { value: 'es-419' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.input(search, { target: { value: 'klingon' } });
    expect(screen.getByText('No language matches your search.')).toBeTruthy();
  });

  it('lists the chosen languages first and stops at ten', async () => {
    const chosen = AVAILABLE.slice(2, 12);
    render(<SpellingLanguagesPage api={api({ chosen, inUse: chosen })} />);
    const boxes = await screen.findAllByRole<HTMLInputElement>('checkbox');
    expect(boxes.slice(0, 10).every((input) => input.checked && !input.disabled)).toBe(true);
    expect(boxes.slice(10).every((input) => !input.checked && input.disabled)).toBe(true);
  });

  it('says when spelling is off or no dictionary fits the system', async () => {
    render(<SpellingLanguagesPage api={api({ enabled: false, inUse: [] })} />);
    expect(await screen.findByText(/Spell checking is off\./)).toBeTruthy();
    expect(
      screen.getByText('No dictionary matches your system’s language. Choose one below.'),
    ).toBeTruthy();
  });

  it('leaves languages to macOS, which lists none', async () => {
    render(<SpellingLanguagesPage api={api({ available: [], inUse: [] })} />);
    expect(await screen.findByText(/macOS checks spelling/)).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
