import { chatLinkInArguments, chatLinkTarget } from '../navigation/deep-link.ts';

export interface InstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(
    event: 'second-instance',
    listener: (event: unknown, argv: readonly string[]) => void,
  ): unknown;
  on(
    event: 'open-url',
    listener: (event: { preventDefault(): void }, url: string) => void,
  ): unknown;
}

export interface LinkWindow {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

/** The WhatsApp that opens chat links. */
export interface LinkPage {
  loadURL(url: string): Promise<unknown>;
}

export interface Instances {
  /**
   * Hands chat links to WhatsApp, including any that arrived before it, and
   * brings the window to the front for later launches.
   */
  readonly attach: (window: LinkWindow, page: LinkPage) => void;
}

/** Where chat links go once YapYap can take them. */
interface LinkTargets {
  readonly window: () => LinkWindow | undefined;
  readonly open: (target: string) => void;
}

export function bringToFront(window: LinkWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

/** Hands every later launch, and every macOS link event, to the links' targets. */
function listenForLaunches(
  app: InstanceApp,
  home: string,
  warn: (message: string) => void,
  links: LinkTargets,
): void {
  app.on('second-instance', (_event, argv) => {
    const window = links.window();
    if (window !== undefined) {
      bringToFront(window);
    }
    const target = chatLinkInArguments(argv, home);
    if (target !== undefined) {
      links.open(target);
    }
  });
  // macOS hands links to the running app instead of starting another one.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    const target = chatLinkTarget(url, home);
    if (target === undefined) {
      // The link itself is never logged: a chat link names a phone number.
      warn('Ignored a link that is not a WhatsApp chat link.');
    } else {
      links.open(target);
    }
  });
}

/**
 * Makes this the only running YapYap for its profile, or returns nothing
 * after quitting so the first instance handles the launch. Later launches
 * focus the window and pass on a valid chat link; nothing else from their
 * command line is trusted.
 */
export function claimSingleInstance(
  app: InstanceApp,
  home: string,
  warn: (message: string) => void,
): Instances | undefined {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return undefined;
  }
  let window: LinkWindow | undefined;
  let page: LinkPage | undefined;
  let pending: string | undefined;
  const open = (target: string): void => {
    pending = page === undefined ? target : undefined;
    // A failed load is reported by the recovery monitor.
    page?.loadURL(target).catch(() => undefined);
  };
  listenForLaunches(app, home, warn, { window: () => window, open });
  return {
    attach: (attachedWindow, attachedPage) => {
      window = attachedWindow;
      page = attachedPage;
      if (pending !== undefined) {
        open(pending);
      }
    },
  };
}
