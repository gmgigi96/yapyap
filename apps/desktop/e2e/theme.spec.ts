import type { Page } from '@playwright/test';
import { openFromMenu } from './chrome-helpers.ts';
import { expect, test, whatsAppPage } from './fixtures.ts';

const prefersDark = (page: Page) =>
  page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);

test('switches YapYap and WhatsApp between themes live', async ({ app, window }) => {
  const settings = await openFromMenu(app, 'Settings…', 'settings.html');
  await settings.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect.poll(() => prefersDark(window)).toBe(true);
  await expect.poll(() => prefersDark(settings)).toBe(true);
  await settings.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect.poll(() => prefersDark(window)).toBe(false);
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light');
});

test('turns transitions off for people who prefer reduced motion', async ({ app }) => {
  const settings = await openFromMenu(app, 'Settings…', 'settings.html');
  const duration = () =>
    settings
      .locator('button, .notice')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration);
  await settings.getByRole('checkbox', { name: 'Use hardware acceleration' }).uncheck();
  expect(await duration()).not.toBe('0s');
  await settings.emulateMedia({ reducedMotion: 'reduce' });
  expect(await duration()).toBe('0s');
});

for (const theme of ['light', 'dark'] as const) {
  test(`app chrome looks right in the ${theme} theme`, async ({ app }) => {
    // Startup applies the saved theme just before the first window; set ours after it.
    await whatsAppPage(app);
    await app.evaluate(({ nativeTheme }, source) => {
      nativeTheme.themeSource = source;
    }, theme);
    const about = await openFromMenu(app, 'About YapYap', 'about.html');
    await expect(about.getByRole('heading', { name: 'YapYap' })).toBeVisible();
    // Versions change with every dependency update; the layout is what matters.
    // Soft, so one run reports every changed screenshot, not just the first.
    await expect
      .soft(about)
      .toHaveScreenshot(`about-${theme}.png`, { mask: [about.locator('dl')] });
    const settings = await openFromMenu(app, 'Settings…', 'settings.html');
    await expect(settings.getByRole('group', { name: 'Theme' })).toBeVisible();
    await expect.soft(settings).toHaveScreenshot(`settings-${theme}.png`);
    const accounts = await openFromMenu(app, 'Manage Accounts…', 'accounts.html');
    await expect(accounts.getByLabel('Name')).toHaveValue('WhatsApp');
    await expect.soft(accounts).toHaveScreenshot(`accounts-${theme}.png`);
  });
}
