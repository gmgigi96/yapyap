/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { CustomCodeView } from '../../shared/api/chrome-api.ts';
import type { CustomCode } from '../../shared/custom-code.ts';
import { CustomCodeEditor } from './CustomCode.tsx';

const WORK = '6f1c2a5e-0b1d-4c8e-9a3f-2d4b6c8e0a1b';

const VIEW: CustomCodeView = {
  code: {
    enabled: false,
    snippets: { [WORK]: { css: '#app { margin: 0 }', js: 'console.log(1);' } },
  },
  scopes: [
    { id: 'all', label: 'All accounts' },
    { id: WORK, label: 'Work' },
  ],
};

function api(get: () => Promise<CustomCodeView> = () => Promise.resolve(VIEW)) {
  return fakeChromeApi({
    customCode: {
      get: vi.fn(get),
      save: vi.fn((code: CustomCode) => Promise.resolve({ ...VIEW, code })),
      preview: vi.fn(() => Promise.resolve()),
    },
  });
}

const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });
const css = () => screen.getByLabelText<HTMLTextAreaElement>('CSS');
const js = () => screen.getByLabelText<HTMLTextAreaElement>('JavaScript');
const enabled = () => screen.getByLabelText<HTMLInputElement>('Use custom CSS and JavaScript');
const scope = () => screen.getByLabelText<HTMLSelectElement>('Applies to');

async function opened(chrome = api()) {
  render(<CustomCodeEditor api={chrome} />);
  await waitFor(() => {
    expect(saveButton().disabled).toBe(false);
  });
  return chrome;
}

describe('CustomCodeEditor', () => {
  afterEach(() => {
    cleanup();
  });

  it('warns first, starts off, and shows each scope’s code', async () => {
    await opened();
    expect(screen.getByText(/can read your chats/)).toBeTruthy();
    expect(enabled().checked).toBe(false);
    expect(css().value).toBe('');
    fireEvent.change(scope(), { target: { value: WORK } });
    expect(css().value).toBe('#app { margin: 0 }');
    expect(js().value).toBe('console.log(1);');
  });

  it('shows CSS in WhatsApp as the user types, once custom code is on', async () => {
    const chrome = await opened();
    fireEvent.input(css(), { target: { value: 'p { color: red }' } });
    expect(chrome.customCode.preview).toHaveBeenLastCalledWith('all', '');
    fireEvent.click(enabled());
    expect(chrome.customCode.preview).toHaveBeenLastCalledWith('all', 'p { color: red }');
    fireEvent.input(js(), { target: { value: 'alert(1)' } });
    expect(chrome.customCode.preview).toHaveBeenCalledTimes(2);
  });

  it('saves the draft and says so, until the next change', async () => {
    const chrome = await opened();
    fireEvent.click(enabled());
    fireEvent.input(js(), { target: { value: 'document.title;' } });
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByText('Saved.')).toBeTruthy();
    });
    expect(chrome.customCode.save).toHaveBeenCalledExactlyOnceWith({
      enabled: true,
      snippets: { ...VIEW.code.snippets, all: { css: '', js: 'document.title;' } },
    });
    fireEvent.input(js(), { target: { value: '' } });
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('says when the code could not be saved', async () => {
    const chrome = api();
    chrome.customCode.save.mockRejectedValueOnce(new Error('disk full'));
    await opened(chrome);
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByText('Could not save the code.')).toBeTruthy();
    });
  });

  it('takes back unsaved CSS when the window closes, and nothing once saved', async () => {
    const chrome = await opened();
    fireEvent.input(css(), { target: { value: 'p {}' } });
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(chrome.customCode.preview).toHaveBeenLastCalledWith('all', null);
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByText('Saved.')).toBeTruthy();
    });
    chrome.customCode.preview.mockClear();
    globalThis.dispatchEvent(new Event('pagehide'));
    cleanup();
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(chrome.customCode.preview).not.toHaveBeenCalled();
  });

  it('closes on Escape while nothing changed, and asks before losing a change', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await opened();
    fireEvent.input(css(), { target: { value: 'p {}' } });
    fireEvent.input(css(), { target: { value: '' } });
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    fireEvent.change(scope(), { target: { value: WORK } });
    fireEvent.input(js(), { target: { value: 'alert(1)' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'Discard your unsaved changes to the code?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(js().value).toBe('alert(1)');
    expect(close).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(close).toHaveBeenCalledTimes(2);
    close.mockRestore();
  });

  it('counts turning the code on as a change, until it is saved', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await opened();
    fireEvent.click(enabled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    fireEvent.click(saveButton());
    await screen.findByText('Saved.');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    close.mockRestore();
  });

  it('cannot save before the code has loaded', () => {
    render(<CustomCodeEditor api={api(() => Promise.reject(new Error('gone')))} />);
    expect(saveButton().disabled).toBe(true);
  });
});
