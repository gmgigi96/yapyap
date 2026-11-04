import { expectedLinuxBackend } from './app-environment.ts';
import { clickMenu } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

test('draws the WhatsApp page on the display backend it reports', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await clickMenu(app, 'Copy Diagnostics');
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toContain(`, display ${expectedLinuxBackend()} (automatic)\n`);
  // A blank or black window paints a single color; the fake page has text on a background.
  // The window is shown and painted a moment after the page's DOM is ready, so poll.
  await expect
    .poll(() =>
      app.evaluate(async ({ BrowserWindow, webContents }) => {
        const shown = webContents
          .getAllWebContents()
          .find(
            (candidate) =>
              candidate.getURL().startsWith('http') &&
              BrowserWindow.fromWebContents(candidate)?.isVisible() === true,
          );
        const bitmap = (await shown?.capturePage())?.toBitmap() ?? Buffer.alloc(0);
        const seen = new Set<number>();
        for (let offset = 0; offset + 4 <= bitmap.length; offset += 4) {
          seen.add(bitmap.readUInt32LE(offset));
        }
        return seen.size;
      }),
    )
    .toBeGreaterThan(1);
});
