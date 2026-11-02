import type { WebPreferences } from 'electron';
import { classifyLink, isSameOrigin } from './link-policy.ts';

/**
 * WhatsApp sometimes opens `about:blank` and only then sets the popup's
 * location. A popup that never navigates is discarded after this long.
 */
export const TRANSIENT_POPUP_MS = 5000;

/** How often an adopted popup is checked for a navigation that will-navigate missed. */
export const UNSEEN_NAVIGATION_MS = 1000;

interface NavigationEvent {
  readonly url: string;
  readonly isMainFrame: boolean;
  preventDefault(): void;
}

export type WindowOpenResponse =
  | { readonly action: 'deny' }
  | {
      readonly action: 'allow';
      readonly overrideBrowserWindowOptions: {
        readonly show: false;
        readonly webPreferences: WebPreferences;
      };
    };

interface StartedNavigation {
  readonly url: string;
  readonly isMainFrame: boolean;
}

export interface PopupWindow {
  readonly webContents: {
    once(event: 'will-navigate', listener: (event: { readonly url: string }) => void): unknown;
    on(event: 'did-start-navigation', listener: (details: StartedNavigation) => void): unknown;
    getURL(): string;
  };
  isDestroyed(): boolean;
  destroy(): void;
  show(): void;
  /** Lets the page unload, unlike destroy, which WhatsApp's calls do not survive. */
  close(): void;
}

export interface NavigationContents {
  on(event: 'will-navigate' | 'will-redirect', listener: (event: NavigationEvent) => void): unknown;
  on(event: 'did-create-window', listener: (window: PopupWindow) => void): unknown;
  once(event: 'destroyed', listener: () => void): unknown;
  setWindowOpenHandler(handler: (details: { readonly url: string }) => WindowOpenResponse): void;
  loadURL(url: string): Promise<unknown>;
}

export interface NavigationDependencies {
  /** The origin a web contents was created for; undefined for popups and DevTools. */
  readonly homeOf: (contents: NavigationContents) => string | undefined;
  readonly openExternal: (url: string) => Promise<unknown>;
  /** A popup's preferences, which depend on the view that opens it. */
  readonly popupPreferences: (opener: NavigationContents) => WebPreferences;
  /** Gives a popup its opener's zone and home, so its own guard treats it like the opener. */
  readonly inherit: (popup: object, opener: NavigationContents) => void;
  readonly warn: (message: string) => void;
  readonly schedule: (callback: () => void, ms: number) => unknown;
}

function follow(contents: NavigationContents, url: string, deps: NavigationDependencies): void {
  const action = classifyLink(url, deps.homeOf(contents));
  // Failures are logged without the URL, which can contain phone numbers.
  const report = (): void => {
    deps.warn(`Could not open a ${action.kind} link.`);
  };
  if (action.kind === 'external') {
    deps.openExternal(action.url).catch(report);
  }
  if (action.kind === 'deep-link') {
    contents.loadURL(action.url).catch(report);
  }
}

const isBlank = (url: string): boolean => url === 'about:blank' || url === '';

interface PopupRoute {
  /** Destroys the popup, unless it became a call window; nothing routes it after this. */
  readonly discard: () => void;
  /** Shows the popup as a window of its account, such as a WhatsApp call. */
  readonly keep: () => void;
  /** Routes where the popup is heading or what it shows, unless already handled. */
  readonly routeUnseen: () => void;
  readonly done: () => boolean;
  readonly started: (url: string) => void;
}

/** The popup's fate: discarded once routed, or kept as a window of its account. */
function popupFate(popup: PopupWindow): Pick<PopupRoute, 'discard' | 'keep' | 'done'> {
  let done = false;
  let kept = false;
  return {
    discard: () => {
      done = true;
      if (!kept && !popup.isDestroyed()) {
        popup.destroy();
      }
    },
    keep: () => {
      done = true;
      kept = true;
      popup.show();
    },
    done: () => done,
  };
}

function popupRoute(
  opener: NavigationContents,
  popup: PopupWindow,
  deps: NavigationDependencies,
  routed: WeakSet<object>,
): PopupRoute {
  const { discard, keep, done } = popupFate(popup);
  let started: string | undefined;
  const home = deps.homeOf(opener);
  const target = (): string => started ?? (popup.isDestroyed() ? '' : popup.webContents.getURL());
  const routeUnseen = (): void => {
    const url = target();
    if (done() || isBlank(url)) {
      return;
    }
    if (isSameOrigin(url, home)) {
      keep();
      return;
    }
    // A will-navigate that arrives after this must not route the link again.
    routed.add(popup.webContents);
    follow(opener, url, deps);
    discard();
  };
  return {
    discard,
    keep,
    routeUnseen,
    done,
    started: (url) => {
      started = url;
    },
  };
}

function adoptPopup(
  opener: NavigationContents,
  popup: PopupWindow,
  deps: NavigationDependencies,
  routed: WeakSet<object>,
): void {
  const route = popupRoute(opener, popup, deps, routed);
  const watch = (): void => {
    route.routeUnseen();
    if (!route.done()) {
      deps.schedule(watch, UNSEEN_NAVIGATION_MS);
    }
  };
  // The popup's own navigation guard has already routed a link by now; a
  // page on the opener's own origin is WhatsApp's, such as a call.
  const home = deps.homeOf(opener);
  popup.webContents.once('will-navigate', ({ url }) => {
    if (isSameOrigin(url, home)) {
      route.keep();
    } else {
      route.discard();
    }
  });
  // A call window belongs to its account, and goes when the account does.
  opener.once('destroyed', () => {
    if (!popup.isDestroyed()) {
      popup.close();
    }
  });
  // A navigation the opener starts is normally reported as will-navigate
  // right after it starts. On Windows it sometimes is not, or starts before
  // these listeners exist (#188), so a timer also checks where the popup is
  // heading or what it shows, and routes it. Stopping or destroying a web
  // contents inside its navigation-start event crashes Electron, which is
  // another reason this happens from a timer.
  popup.webContents.on('did-start-navigation', ({ url, isMainFrame }) => {
    if (isMainFrame && !isBlank(url)) {
      route.started(url);
    }
  });
  deps.schedule(watch, UNSEEN_NAVIGATION_MS);
  deps.schedule(() => {
    route.routeUnseen();
    route.discard();
  }, TRANSIENT_POPUP_MS);
}

/**
 * Keeps each view on its home origin, sends links to the browser or the
 * mail and phone apps through the link policy, and opens windows only for
 * WhatsApp's own pages, such as calls, on the account's session (#67).
 */
export function createNavigationGuard(
  deps: NavigationDependencies,
): (contents: NavigationContents) => void {
  const routed = new WeakSet<object>();
  return (contents) => {
    contents.on('will-navigate', (event) => {
      if (routed.has(contents)) {
        event.preventDefault();
        return;
      }
      if (!event.isMainFrame || isSameOrigin(event.url, deps.homeOf(contents))) {
        return;
      }
      event.preventDefault();
      follow(contents, event.url, deps);
    });
    contents.on('will-redirect', (event) => {
      // A redirect is not a click, so it is blocked rather than opened elsewhere.
      if (event.isMainFrame && !isSameOrigin(event.url, deps.homeOf(contents))) {
        event.preventDefault();
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      // WhatsApp opens its own pages, such as calls, in windows of their own.
      if (isBlank(url) || isSameOrigin(url, deps.homeOf(contents))) {
        const webPreferences = deps.popupPreferences(contents);
        return { action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences } };
      }
      follow(contents, url, deps);
      return { action: 'deny' };
    });
    contents.on('did-create-window', (popup) => {
      deps.inherit(popup.webContents, contents);
      adoptPopup(contents, popup, deps, routed);
    });
  };
}
