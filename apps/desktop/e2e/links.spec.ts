import type { ElectronApplication } from '@playwright/test';
import { expect, test, whatsAppContents } from './fixtures.ts';

/** Replaces shell.openExternal so tests see every link that would leave the app. */
async function recordExternalLinks(app: ElectronApplication): Promise<() => Promise<string[]>> {
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { openedLinks: opened });
    shell.openExternal = (url: string) => {
      opened.push(url);
      return Promise.resolve();
    };
  });
  return () => app.evaluate(() => (globalThis as unknown as { openedLinks: string[] }).openedLinks);
}

/** Records what every web contents created from now on does, for failure messages. */
async function recordPopupEvents(app: ElectronApplication): Promise<() => Promise<string[]>> {
  await app.evaluate(({ app: electronApp }) => {
    const events: string[] = [];
    Object.assign(globalThis, { popupEvents: events });
    electronApp.on('web-contents-created', (_event, contents) => {
      events.push(`created ${contents.getType()}`);
      contents.on('did-start-navigation', ({ url, isMainFrame }) => {
        events.push(`did-start-navigation ${url}${isMainFrame ? '' : ' (subframe)'}`);
      });
      contents.on('will-navigate', ({ url }) => {
        events.push(`will-navigate ${url}`);
      });
      contents.on('destroyed', () => {
        events.push('destroyed');
      });
    });
  });
  return () => app.evaluate(() => (globalThis as unknown as { popupEvents: string[] }).popupEvents);
}

const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length);

test('opens web, mail and phone links outside the app, each exactly once', async ({
  app,
  window,
}) => {
  const opened = await recordExternalLinks(app);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // Playwright waits forever for a navigation the app cancels, so the links are
  // clicked from the page and everything after is checked from the main process.
  await window.evaluate(() => {
    for (const id of ['link-new-tab', 'link-same-tab', 'link-mailto', 'link-tel']) {
      document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.click();
    }
  });
  await expect
    .poll(opened)
    .toEqual([
      'https://example.com/article?id=7#top',
      'https://example.com/same-tab',
      'mailto:someone@example.com?subject=Hi%20there',
      'tel:+447700900123',
    ]);
  expect(await windowCount(app)).toBe(1);
  expect(await (await whatsAppContents(app)).evaluate((contents) => contents.getURL())).toMatch(
    /^http:\/\/127\.0\.0\.1:\d+\/$/,
  );
});

test('drops links with other schemes', async ({ app, window }) => {
  const opened = await recordExternalLinks(app);
  await window.getByTestId('link-file').click();
  await window.getByTestId('link-new-tab').click();
  await expect(async () => {
    expect(await opened()).toEqual(['https://example.com/article?id=7#top']);
  }).toPass();
});

test('follows a popup that navigates after opening, then closes it', async ({ app, window }) => {
  const opened = await recordExternalLinks(app);
  const events = await recordPopupEvents(app);
  // The buttons render before links.js adds their click handlers; a slow
  // runner could click first, so the page never opened a popup (#188).
  await window.waitForLoadState('load');
  await window.getByTestId('popup-then-navigate').click();
  // If this fails again, say what the popup did.
  await expect(async () => {
    expect(await opened()).toEqual(['https://example.com/from-popup']);
  })
    .toPass()
    .catch(async (error: unknown) => {
      const popup = await window.evaluate(() => document.body.dataset['popup'] ?? 'not clicked');
      const seen = (await events()).join(' | ');
      throw new Error(`${String(error)}\nPopup: ${popup}\nEvents: ${seen}`);
    });
  await expect(async () => {
    expect(await windowCount(app)).toBe(1);
  }).toPass();
});

test('discards a popup that never navigates', async ({ app, window }) => {
  await window.waitForLoadState('load');
  await window.getByTestId('popup-blank').click();
  await expect.poll(() => windowCount(app), { timeout: 15_000 }).toBe(1);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
});

test('handles whatsapp: links inside the app', async ({ window, fakeWhatsApp }) => {
  await window.getByTestId('link-deep').click();
  await expect(window).toHaveURL(`${fakeWhatsApp.origin}/send?phone=447700900123`);
});
