import type { ElectronApplication, Page } from '@playwright/test';
import { chromePage, clickMenu } from './chrome-helpers.ts';
import { expect, test, whatsAppPage } from './fixtures.ts';

/** Adds a second account, so the sidebar shows, and returns its WhatsApp page. */
async function secondAccount(app: ElectronApplication, first: Page): Promise<Page> {
  await clickMenu(app, 'Add Account');
  const page = await whatsAppPage(app, first);
  await page.waitForLoadState('load');
  return page;
}

const sidebarOf = (app: ElectronApplication): Promise<Page> => chromePage(app, '/sidebar.html');

/** Shares the first screen through YapYap's picker, as the picker tests do. */
async function shareScreen(app: ElectronApplication, page: Page): Promise<void> {
  await expect
    .poll(() =>
      app.evaluate(({ BaseWindow }) => {
        const [main] = BaseWindow.getAllWindows();
        main?.focus();
        return main?.isFocused();
      }),
    )
    .toBe(true);
  const opened = app.waitForEvent('window');
  await page.getByTestId('share-keep').click();
  const picker = await opened;
  await picker.waitForURL('app://chrome/picker.html');
  await picker.getByRole('group', { name: 'Screens' }).getByRole('radio').first().check();
  await picker
    .getByRole('button', { name: 'Share' })
    .click()
    .catch(() => undefined);
  await expect(page.getByTestId('share-status')).toHaveText('sharing');
}

test('shows a running share in the sidebar until it ends, however it ends', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const work = await secondAccount(app, window);
  const sidebar = await sidebarOf(app);
  const stop = sidebar.getByRole('button', { name: 'Stop sharing your screen in WhatsApp 2' });
  await shareScreen(app, work);
  await stop.click();
  await expect(work.getByTestId('share-status')).toHaveText('ended');
  await expect(stop).toHaveCount(0);
  await shareScreen(app, work);
  await expect(stop).toBeVisible();
  await work.getByTestId('share-stop').click();
  await expect(stop).toHaveCount(0);
});
