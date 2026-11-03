/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { PickerOffer } from '../../shared/api/chrome-api.ts';
import { cancelOnEscape, Picker } from './Picker.tsx';

const OFFER: PickerOffer = {
  sources: [
    {
      id: 'screen:1:0',
      name: 'Entire screen',
      kind: 'screen',
      thumbnail: 'data:image/png;base64,A',
    },
    { id: 'window:7:0', name: 'Notes', kind: 'window', thumbnail: 'data:image/png;base64,B' },
  ],
  offerAudio: false,
};

function api(offer: () => Promise<PickerOffer> = () => Promise.resolve(OFFER)) {
  return fakeChromeApi({
    picker: {
      offer: vi.fn(offer),
      choose: vi.fn(() => Promise.resolve()),
      cancel: vi.fn(() => Promise.resolve()),
    },
  });
}

const share = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Share' });

describe('Picker', () => {
  afterEach(() => {
    cleanup();
  });

  it('groups screens and windows with previews, and selects nothing', async () => {
    render(<Picker api={api()} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(await screen.findByRole('group', { name: 'Screens' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Windows' })).toBeTruthy();
    const radios = screen.getAllByRole<HTMLInputElement>('radio');
    expect(radios.map((radio) => [radio.value, radio.checked])).toEqual([
      ['screen:1:0', false],
      ['window:7:0', false],
    ]);
    expect(screen.getByRole('radio', { name: 'Notes' })).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,A');
    expect(share().disabled).toBe(true);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shares the selected source without system audio by default', async () => {
    const t = api();
    render(<Picker api={t} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Notes' }));
    expect(share().disabled).toBe(false);
    fireEvent.click(share());
    expect(t.picker.choose).toHaveBeenCalledExactlyOnceWith('window:7:0', false);
  });

  it('offers system audio as an unchecked opt-in where it is available', async () => {
    const t = api(() => Promise.resolve({ ...OFFER, offerAudio: true }));
    render(<Picker api={t} />);
    const audio = await screen.findByRole<HTMLInputElement>('checkbox', {
      name: 'Also share system audio',
    });
    expect(audio.checked).toBe(false);
    fireEvent.click(audio);
    fireEvent.click(screen.getByRole('radio', { name: 'Entire screen' }));
    fireEvent.click(share());
    expect(t.picker.choose).toHaveBeenCalledExactlyOnceWith('screen:1:0', true);
  });

  it('does not share before a source is selected', async () => {
    const t = api();
    render(<Picker api={t} />);
    await screen.findByRole('group', { name: 'Screens' });
    const form = share().closest('form');
    if (form !== null) {
      fireEvent.submit(form);
    }
    expect(form).not.toBeNull();
    expect(t.picker.choose).not.toHaveBeenCalled();
  });

  it('cancels from its button', async () => {
    const t = api();
    render(<Picker api={t} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(t.picker.cancel).toHaveBeenCalledOnce();
  });

  it('leaves out an empty group', async () => {
    const screensOnly = { ...OFFER, sources: OFFER.sources.slice(0, 1) };
    render(<Picker api={api(() => Promise.resolve(screensOnly))} />);
    await screen.findByRole('group', { name: 'Screens' });
    expect(screen.queryByRole('group', { name: 'Windows' })).toBeNull();
  });

  it('says when there is nothing to share, and still offers Cancel', async () => {
    render(<Picker api={api(() => Promise.resolve({ sources: [], offerAudio: false }))} />);
    expect(await screen.findByText('No screens or windows can be shared right now.')).toBeTruthy();
    expect(share().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('says when nothing can be offered', async () => {
    render(<Picker api={api(() => Promise.reject(new Error('gone')))} />);
    expect(await screen.findByText('Nothing can be shared right now.')).toBeTruthy();
  });

  it('cancels on Escape only', () => {
    const t = api();
    cancelOnEscape(new KeyboardEvent('keydown', { key: 'Enter' }), t);
    expect(t.picker.cancel).not.toHaveBeenCalled();
    cancelOnEscape(new KeyboardEvent('keydown', { key: 'Escape' }), t);
    expect(t.picker.cancel).toHaveBeenCalledOnce();
  });
});
