import { clickMenu } from './chrome-helpers.ts';
import { expect, launchApp, test, whatsAppPage, within } from './fixtures.ts';

/** Well within the test's timeout, and far longer than a healthy quit takes. */
const QUIT_WITHIN_MS = 15_000;

test('quits promptly as a user does, with every kind of window open (#223)', async ({
  fakeWhatsApp,
  profile,
}) => {
  const app = await launchApp(fakeWhatsApp.origin, profile);
  const page = await whatsAppPage(app);
  await expect(page.getByTestId('fake-whatsapp')).toBeVisible();
  await page.waitForLoadState('load');
  await page.getByTestId('call').click();
  await clickMenu(app, 'Add Account');
  await clickMenu(app, 'Manage Accounts…');
  await clickMenu(app, 'Settings…');
  await expect
    .poll(() => app.windows().map((window) => new URL(window.url()).pathname))
    .toEqual(
      expect.arrayContaining(['/call.html', '/sidebar.html', '/accounts.html', '/settings.html']),
    );
  const exited = new Promise<'exited'>((resolve) => {
    app.process().once('exit', () => {
      resolve('exited');
    });
  });
  // Quit as a user does; Playwright's own close skips Electron's quit events.
  // The app exits before it can answer, so the evaluation itself may fail.
  await app
    .evaluate(({ app: electronApp }) => {
      electronApp.quit();
    })
    .catch(() => undefined);
  const result = await within(exited, QUIT_WITHIN_MS);
  if (result === 'timeout') {
    app.process().kill('SIGKILL');
  }
  expect(result).toBe('exited');
});
