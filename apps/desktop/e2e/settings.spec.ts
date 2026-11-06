import type { ElectronApplication, Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clickMenu, openFromMenu } from './chrome-helpers.ts';
import { expect, test, whatsAppPage } from './fixtures.ts';

const openSettings = (app: ElectronApplication): Promise<Page> =>
  openFromMenu(app, 'Settings…', 'settings.html');

async function savedHardwareAcceleration(profile: string): Promise<unknown> {
  const text = await readFile(join(profile, 'settings.json'), 'utf8').catch(() => '{}');
  const saved = JSON.parse(text) as { reliability?: { hardwareAcceleration?: unknown } };
  return saved.reliability?.hardwareAcceleration;
}

test('puts Settings in the menu on the conventional shortcut', async ({ app }) => {
  // The menu is set just before the WhatsApp window is created.
  await whatsAppPage(app);
  const accelerator = await app.evaluate(
    ({ Menu }) =>
      Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Settings…')?.accelerator,
  );
  expect(accelerator).toBe('CmdOrCtrl+,');
});

test('jumps to a section from the list at the top, staying on the page', async ({ app }) => {
  const settings = await openSettings(app);
  const network = settings.getByRole('heading', { name: 'Network' });
  await expect(network).not.toBeInViewport();
  await settings
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Network' })
    .click();
  await expect(network).toBeInViewport();
  expect(settings.url()).toBe('app://chrome/settings.html#network-title');
});

test('changes a setting from the keyboard, saves it and offers a restart', async ({
  app,
  profile,
}) => {
  const settings = await openSettings(app);
  await expect(settings.getByRole('heading', { name: 'Reliability' })).toBeVisible();
  const toggle = settings.getByRole('checkbox', { name: 'Use hardware acceleration' });
  await expect(toggle).toBeChecked();
  await toggle.focus();
  await settings.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  await expect(settings.getByRole('button', { name: 'Restart Now' })).toBeVisible();
  await expect.poll(() => savedHardwareAcceleration(profile)).toBe(false);
  await settings.keyboard.press('Space');
  await expect(settings.getByRole('button', { name: 'Restart Now' })).toBeHidden();
  await expect.poll(() => savedHardwareAcceleration(profile)).toBe(true);
});

test('restarts the app from the restart notice', async ({ app }) => {
  await app.evaluate(({ app: electronApp }) => {
    const calls: string[] = [];
    Object.assign(globalThis, { restartCalls: calls });
    const relaunch = electronApp.relaunch.bind(electronApp);
    const quit = electronApp.quit.bind(electronApp);
    // Record the calls, then put the real methods back so the test can still close the app.
    electronApp.relaunch = () => {
      calls.push('relaunch');
      electronApp.relaunch = relaunch;
    };
    electronApp.quit = () => {
      calls.push('quit');
      electronApp.quit = quit;
    };
  });
  const settings = await openSettings(app);
  await settings.getByRole('checkbox', { name: 'Use hardware acceleration' }).click();
  await settings.getByRole('button', { name: 'Restart Now' }).click();
  await expect(async () => {
    expect(
      await app.evaluate(() => (globalThis as unknown as { restartCalls: string[] }).restartCalls),
    ).toEqual(['relaunch', 'quit']);
  }).toPass();
});

test('opens one Settings window and closes it with Escape', async ({ app }) => {
  const settings = await openSettings(app);
  await clickMenu(app, 'Settings…');
  expect(app.windows().filter((page) => page.url().endsWith('/settings.html'))).toHaveLength(1);
  // Only the key-down: the window closes before a key-up could reach it, and
  // can close before Playwright hears back about the key-down itself.
  await settings.keyboard.down('Escape').catch(() => undefined);
  await expect.poll(() => settings.isClosed()).toBe(true);
});

test('exports the settings to a file and imports them back', async ({ app, profile }, testInfo) => {
  const file = testInfo.outputPath('yapyap-settings.json');
  // System file dialogs cannot be driven from a test, so they answer with this file.
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
  }, file);
  const settings = await openSettings(app);
  await settings.getByRole('button', { name: 'Export Settings…' }).click();
  await expect(settings.getByText('Settings exported.')).toBeVisible();
  const exported = JSON.parse(await readFile(file, 'utf8')) as {
    format: string;
    settings: { appearance: { theme: string } };
  };
  expect(exported.format).toBe('yapyap-settings');
  expect(exported.settings.appearance.theme).toBe('system');
  exported.settings.appearance.theme = 'dark';
  await writeFile(file, JSON.stringify(exported));
  await settings.getByRole('button', { name: 'Import Settings…' }).click();
  await expect(settings.getByText('Settings imported.')).toBeVisible();
  await expect(settings.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  const saved = JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8')) as {
    appearance: { theme: string };
  };
  expect(saved.appearance.theme).toBe('dark');
});

// Windows and macOS use login items, which tests leave alone.
test(
  'starts at login through an autostart entry on Linux',
  { tag: '@linux' },
  async ({ app, profile }) => {
    const entry = join(profile, 'xdg-config', 'autostart', 'org.guita.YapYap.desktop');
    const settings = await openSettings(app);
    const toggle = settings.getByRole('checkbox', { name: 'Start at login' });
    await toggle.check();
    await expect(async () => {
      expect(await readFile(entry, 'utf8').catch(() => '')).toContain('Exec=');
    }).toPass();
    await toggle.uncheck();
    await expect(async () => {
      expect(await readFile(entry, 'utf8').catch(() => 'gone')).toBe('gone');
    }).toPass();
  },
);

/** What WhatsApp's session and the default session would use to reach WhatsApp. */
const proxiesInUse = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(async ({ session, webContents }) => {
    const account = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith('http://127.0.0.1'));
    const url = 'https://web.whatsapp.com/';
    return Promise.all([
      account?.session.resolveProxy(url) ?? 'no account',
      session.defaultSession.resolveProxy(url),
    ]);
  });

test('sends every connection through the proxy the user names, at once', async ({ app }) => {
  const settings = await openSettings(app);
  const address = settings.getByRole('textbox', { name: 'Proxy address' });
  await expect(address).toHaveAttribute('placeholder', 'socks5://127.0.0.1:1080');
  await address.fill('http://127.0.0.1:3128');
  await address.press('Enter');
  await settings.getByRole('radio', { name: 'This proxy' }).check();
  await expect
    .poll(() => proxiesInUse(app))
    .toEqual(['PROXY 127.0.0.1:3128', 'PROXY 127.0.0.1:3128']);
  await settings.getByRole('radio', { name: 'No proxy' }).check();
  await expect.poll(() => proxiesInUse(app)).toEqual(['DIRECT', 'DIRECT']);
});
