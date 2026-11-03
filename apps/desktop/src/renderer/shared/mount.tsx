import { render, type ComponentType } from 'preact';
import type { ChromeApi } from '../../shared/api/chrome-api.ts';

/** A dialog-like window closes on Escape, as closing it by hand would. */
export function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    window.close();
  }
}

interface MountOptions {
  /**
   * The window's title, from the catalog, so it is translated with the page
   * (ADR 0012). Views laid into another window keep the page's own.
   */
  readonly title?: string;
  /**
   * What Escape does. Pages that keep a draft handle it themselves, and
   * views laid into another window, such as the sidebar, have none.
   */
  readonly escape?: (event: KeyboardEvent, api: ChromeApi) => void;
}

/** Starts a chrome page: its title, its Escape key and the page itself, with the preload's API. */
export function mount(
  Page: ComponentType<{ readonly api: ChromeApi }>,
  { title, escape: onEscape }: MountOptions = {},
): void {
  const api = globalThis.yapyap;
  if (title !== undefined) {
    document.title = title;
  }
  if (onEscape !== undefined) {
    document.addEventListener('keydown', (event) => {
      onEscape(event, api);
    });
  }
  render(<Page api={api} />, document.body);
}
