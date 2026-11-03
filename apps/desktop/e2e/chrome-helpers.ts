import type { ElectronApplication, Page } from '@playwright/test';
import { expect, whatsAppPage } from './fixtures.ts';

/**
 * Clicks a menu item by its label, wherever it sits in the application menu.
 * The menu is set just before the WhatsApp window opens, so that comes first;
 * startup can take a while on a slow machine.
 */
export const clickMenu = async (app: ElectronApplication, label: string): Promise<void> => {
  await whatsAppPage(app);
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);
};

/** The windows the app shows, so a missing window explains itself. */
const whatHappened = (app: ElectronApplication): string =>
  `windows: ${app
    .windows()
    .map((page) => page.url())
    .join(', ')}`;

/**
 * Opens a YapYap window from the menu and waits for its page at
 * `app://chrome/<page>`. The WhatsApp window comes first, so the next window
 * event is this one's; that event can fire while the page is still
 * about:blank. Only for a window that is not open yet.
 */
export const openFromMenu = async (
  app: ElectronApplication,
  label: string,
  page: string,
): Promise<Page> => {
  await whatsAppPage(app);
  const opened = app.waitForEvent('window');
  await clickMenu(app, label);
  const window = await opened;
  await window.waitForURL(`app://chrome/${page}`);
  return window;
};

/**
 * The YapYap window whose address ends with `path`, once it is open, waiting
 * up to `timeout` ms, or Playwright's default for a poll.
 */
export const chromePage = async (
  app: ElectronApplication,
  path: string,
  timeout?: number,
): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((page) => page.url().endsWith(path)), {
      message: `a window at ${path}`,
      ...(timeout === undefined ? {} : { timeout }),
    })
    .toBe(true)
    .catch((error: unknown) => {
      throw new Error(`No window at ${path} (${whatHappened(app)}).`, { cause: error });
    });
  const page = app.windows().find((candidate) => candidate.url().endsWith(path));
  if (page === undefined) {
    throw new Error(`No ${path}.`);
  }
  return page;
};
