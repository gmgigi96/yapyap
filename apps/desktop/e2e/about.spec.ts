import type { ElectronApplication } from '@playwright/test';
import { openFromMenu } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

const openAbout = (app: ElectronApplication) => openFromMenu(app, 'About YapYap', 'about.html');

test('opens About from the menu with the version, engines and disclaimer, and closes on Escape', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const about = await openAbout(app);
  expect(about.url()).toBe('app://chrome/about.html');
  await expect(about.getByRole('heading', { name: 'YapYap' })).toBeVisible();
  // The page titles its window from the catalog, as the main process does.
  await expect(about).toHaveTitle('About YapYap');
  await expect(about.getByText(/\(development\)$/)).toBeVisible();
  const versions = await app.evaluate(() => process.versions);
  await expect(about.getByText(versions.electron, { exact: true })).toBeVisible();
  await expect(about.getByText(versions.chrome, { exact: true })).toBeVisible();
  await expect(
    about.getByText(/not affiliated with, endorsed by, or sponsored by WhatsApp/),
  ).toBeVisible();
  // Only the key-down: the window can close before Playwright hears back.
  await about.keyboard.down('Escape').catch(() => undefined);
  await expect.poll(() => about.isClosed()).toBe(true);
});

test('serves chrome with a strict CSP and only the typed bridge', async ({ app }) => {
  const about = await openAbout(app);
  const response = await about.reload();
  expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
  const exposed = await about.evaluate(() => ({
    bridge: Object.keys((window as unknown as { yapyap: { about: object } }).yapyap.about),
    process: typeof (globalThis as Record<string, unknown>)['process'],
    require: typeof (globalThis as Record<string, unknown>)['require'],
  }));
  expect(exposed).toEqual({
    bridge: ['info', 'copyTechnicalDetails'],
    process: 'undefined',
    require: 'undefined',
  });
  const network = await about.evaluate(() =>
    fetch('https://example.com/').then(
      () => 'allowed',
      () => 'blocked',
    ),
  );
  expect(network).toBe('blocked');
});

test('copies technical details to the clipboard', async ({ app }) => {
  const about = await openAbout(app);
  await about.getByRole('button', { name: 'Copy Technical Details' }).click();
  await expect(about.getByRole('status')).toHaveText('Copied to the clipboard.');
  const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(clipboard).toMatch(/^YapYap \S+ \(development\)\nElectron /);
});

test('opens About links in the default browser', async ({ app }) => {
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { openedLinks: opened });
    shell.openExternal = (url: string) => {
      opened.push(url);
      return Promise.resolve();
    };
  });
  const about = await openAbout(app);
  await about.getByRole('link', { name: 'Source code' }).click();
  await expect(async () => {
    expect(
      await app.evaluate(() => (globalThis as unknown as { openedLinks: string[] }).openedLinks),
    ).toEqual(['https://github.com/vascoguita/yapyap']);
  }).toPass();
});

test('keeps app chrome out of reach of WhatsApp', async ({ window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const result = await window.evaluate(() =>
    fetch('app://chrome/about.html').then(
      () => 'loaded',
      () => 'blocked',
    ),
  );
  expect(result).toBe('blocked');
});
