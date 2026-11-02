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

export const chromePage = async (app: ElectronApplication, path: string): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((page) => page.url().endsWith(path)), {
      message: `a window at ${path}`,
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
