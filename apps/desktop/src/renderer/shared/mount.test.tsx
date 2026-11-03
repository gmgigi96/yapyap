/** @vitest-environment happy-dom */
import { cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi } from '../../shared/api/chrome-api.ts';
import { closeOnEscape, mount } from './mount.tsx';

function Page({ api }: { readonly api: ChromeApi }) {
  return <h1>{api === globalThis.yapyap ? 'Has the API' : 'Wrong API'}</h1>;
}

const press = (key: string) => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
};

describe('mount', () => {
  // Pages only pass the API on, so any object stands in for it.
  Object.defineProperty(window, 'yapyap', { value: {} });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('renders the page with the preload API and titles the window', () => {
    document.title = 'YapYap';
    mount(Page, { title: 'Downloads' });
    expect(document.body.querySelector('h1')?.textContent).toBe('Has the API');
    expect(document.title).toBe('Downloads');
  });

  it('keeps the page title and ignores Escape when asked for neither', () => {
    document.title = 'YapYap';
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    mount(Page);
    press('Escape');
    expect(document.title).toBe('YapYap');
    expect(close).not.toHaveBeenCalled();
  });

  it('hands every key press to the Escape handler, with the API', () => {
    const escape = vi.fn();
    mount(Page, { escape });
    press('a');
    expect(escape).toHaveBeenCalledExactlyOnceWith(expect.any(KeyboardEvent), globalThis.yapyap);
  });
});

describe('closeOnEscape', () => {
  it('closes the window on Escape and only then', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    closeOnEscape(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(close).not.toHaveBeenCalled();
    closeOnEscape(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
