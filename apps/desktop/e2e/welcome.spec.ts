import { chromePage } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

test('greets the first launch with a welcome whose choices apply at once, and never again', async ({
  fakeWhatsApp,
  profile,
}) => {
  const first = await launchApp(fakeWhatsApp.origin, profile, [], { firstRun: true });
  try {
    // The welcome opens once WhatsApp's first load ends, which a cold Windows
    // runner can take longer than an expectation's timeout to reach (#507).
    await (await whatsAppPage(first)).waitForLoadState('load');
    const welcome = await chromePage(first, '/welcome.html');
    await expect(welcome.getByRole('heading', { name: 'Welcome to YapYap' })).toBeVisible();
    await welcome.getByRole('radio', { name: 'Dark', exact: true }).check();
    await expect
      .poll(() => first.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe('dark');
    await welcome.getByRole('button', { name: 'Start Using YapYap' }).click();
    await expect.poll(() => welcome.isClosed()).toBe(true);
  } finally {
    await closeApp(first);
  }
  const again = await launchApp(fakeWhatsApp.origin, profile, [], { firstRun: true });
  try {
    await (await whatsAppPage(again)).waitForLoadState('load');
    expect(again.windows().some((page) => page.url().endsWith('/welcome.html'))).toBe(false);
  } finally {
    await closeApp(again);
  }
});
