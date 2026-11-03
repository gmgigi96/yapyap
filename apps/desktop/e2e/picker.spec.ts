import type { ElectronApplication, Page } from '@playwright/test';
import { expect, quitApp, test } from './fixtures.ts';

test.skip(process.platform === 'darwin', 'macOS uses its own system picker');

async function requestShare(app: ElectronApplication, window: Page): Promise<Page> {
  // The share button renders before share.js wires it up; a slow runner could
  // click first, and no picker would ever open (#188).
  await window.waitForLoadState('load');
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // Screen sharing is offered only to a focused window, and a virtual display
  // without a window manager focuses nothing on its own.
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
  await window.getByTestId('share-screen').click();
  const picker = await opened;
  await picker.waitForURL('app://chrome/picker.html');
  return picker;
}

test('shares the screen the user picks, with nothing preselected', async ({ app, window }) => {
  // A precondition, not a retry of the app: the virtual display must be able
  // to capture a screen at all, which can take a moment after it starts.
  await expect
    .poll(
      () =>
        app.evaluate(async ({ desktopCapturer }) => {
          const sources = await desktopCapturer.getSources({ types: ['screen'] });
          return sources.length;
        }),
      { message: 'the display offers no screen to capture', timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  const picker = await requestShare(app, window);
  const screens = picker.getByRole('group', { name: 'Screens' });
  await expect(screens).toBeVisible();
  for (const radio of await picker.getByRole('radio').all()) {
    await expect(radio).not.toBeChecked();
  }
  const share = picker.getByRole('button', { name: 'Share' });
  await expect(share).toBeDisabled();
  await expect(picker.getByRole('checkbox', { name: 'Also share system audio' })).toHaveCount(
    process.platform === 'win32' ? 1 : 0,
  );
  await screens.getByRole('radio').first().check();
  // Sharing closes the picker, which can end Playwright's click before it
  // returns; what WhatsApp received is what matters.
  await share.click().catch(() => undefined);
  await expect(window.getByTestId('share-result')).toHaveText('shared 1 video track');
  await expect.poll(() => picker.isClosed()).toBe(true);
});

test('denies the request when the user cancels', async ({ app, window }) => {
  const picker = await requestShare(app, window);
  await picker
    .getByRole('button', { name: 'Cancel' })
    .click()
    .catch(() => undefined);
  await expect(window.getByTestId('share-result')).toHaveText('NotAllowedError');
});

test('denies the request when the user closes the picker with Escape', async ({ app, window }) => {
  const picker = await requestShare(app, window);
  await expect(picker.getByRole('button', { name: 'Cancel' })).toBeVisible();
  // The picker can close before Playwright finishes the key press; the
  // request's outcome below is what matters.
  await picker.keyboard.down('Escape').catch(() => undefined);
  await expect(window.getByTestId('share-result')).toHaveText('NotAllowedError');
});

test('quits cleanly while the picker is open', async ({ app, window }) => {
  await requestShare(app, window);
  await quitApp(app);
});
