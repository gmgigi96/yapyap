import type { ElectronApplication } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clickMenu } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppContents, whatsAppPage } from './fixtures.ts';
import type { ChromeApi } from '../src/shared/api/chrome-api.ts';

/** Where the WhatsApp page's session keeps its data on disk. */
const storagePath = async (app: ElectronApplication) =>
  (await whatsAppContents(app)).evaluate((contents) => contents.session.getStoragePath());

test('keeps the account’s WhatsApp session in its own partition across restarts', async ({
  fakeWhatsApp,
  profile,
}) => {
  const first = await launchApp(fakeWhatsApp.origin, profile);
  let id: string;
  try {
    const page = await whatsAppPage(first);
    await expect(page.getByTestId('fake-whatsapp')).toBeVisible();
    const saved = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
      active: string;
    };
    id = saved.active;
    // macOS may report the profile's real path (/private/var for /var), so compare the tail.
    expect(await storagePath(first)).toMatch(
      new RegExp(String.raw`[\\/]Partitions[\\/]account-${id}$`),
    );
    await page.evaluate(() => {
      localStorage.setItem('yapyap-e2e', 'kept');
    });
    // Chromium writes local storage to disk a moment later, and a quick quit on
    // Windows lost the write; flushing is the event the restart depends on.
    await (
      await whatsAppContents(first)
    ).evaluate((contents) => {
      contents.session.flushStorageData();
    });
  } finally {
    await closeApp(first);
  }
  const second = await launchApp(fakeWhatsApp.origin, profile);
  try {
    const page = await whatsAppPage(second);
    await expect(page.getByTestId('fake-whatsapp')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('yapyap-e2e'))).toBe('kept');
    const again = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
      active: string;
    };
    expect(again.active).toBe(id);
  } finally {
    await closeApp(second);
  }
});

/** The WhatsApp pages, and which one the window shows. */
const accountPages = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow, webContents }) => {
    // A view's page keeps its window after the view is taken out, so ask the window.
    const shown = new Set(
      BaseWindow.getAllWindows().flatMap((window) =>
        window.contentView.children.map((view) => (view as Electron.WebContentsView).webContents),
      ),
    );
    return webContents
      .getAllWebContents()
      .filter((contents) => contents.getURL().startsWith('http'))
      .map((contents) => ({
        storage: contents.session.getStoragePath() ?? '',
        shown: shown.has(contents),
      }));
  });

test('adds, switches and removes accounts, each in its own session', async ({
  app,
  window,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.evaluate(() => {
    localStorage.setItem('yapyap-e2e', 'first account');
  });
  await clickMenu(app, 'Add Account');
  await expect.poll(async () => (await accountPages(app)).length).toBe(2);
  // Playwright lists a new page a moment after Electron creates it.
  const second = await whatsAppPage(app, window);
  await expect(second.getByTestId('fake-whatsapp')).toBeVisible();
  // A new account shares nothing with the first one.
  expect(await second.evaluate(() => localStorage.getItem('yapyap-e2e'))).toBeNull();
  const shownStorage = async () =>
    (await accountPages(app)).filter((page) => page.shown).map((page) => page.storage);
  const first = (await accountPages(app)).find((page) => !page.shown)?.storage ?? '';
  expect(await shownStorage()).not.toEqual([first]);
  await clickMenu(app, 'WhatsApp');
  await expect.poll(shownStorage).toEqual([first]);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
  });
  await clickMenu(app, 'Remove Account…');
  await expect.poll(async () => (await accountPages(app)).length).toBe(1);
  const saved = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
    accounts: unknown[];
  };
  expect(saved.accounts).toHaveLength(1);
});

test('renames an account and turns another off from the Accounts window', async ({
  app,
  window,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await clickMenu(app, 'Add Account');
  await expect.poll(async () => (await accountPages(app)).length).toBe(2);
  await clickMenu(app, 'Manage Accounts…');
  // Adding the account also opened a page, so find the window by its address.
  await expect
    .poll(() => app.windows().some((page) => page.url() === 'app://chrome/accounts.html'))
    .toBe(true);
  const manage = app.windows().find((page) => page.url() === 'app://chrome/accounts.html');
  if (manage === undefined) {
    throw new Error('The Accounts window did not open.');
  }
  // The window opens on the account on screen: the one just added.
  await expect(manage.getByLabel('Name')).toHaveValue('WhatsApp 2');
  // Nothing was allowed yet, so the account asks before using the camera.
  await expect(manage.getByRole('heading', { name: 'Permissions' })).toBeVisible();
  await expect(manage.getByText('Asks first')).toHaveCount(2);
  await expect(
    manage.getByRole('button', { name: 'Ask Again for Camera and Microphone' }),
  ).toBeDisabled();
  await manage.getByLabel('Name').fill('Work');
  await manage.getByLabel('Run this account').uncheck();
  await manage.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await accountPages(app)).length).toBe(1);
  await manage.getByRole('button', { name: /^WhatsApp/ }).click();
  await manage.getByLabel('Name').fill('Personal');
  await manage.getByRole('button', { name: 'Save' }).click();
  await manage.getByLabel('Run this account').uncheck();
  await manage.getByRole('button', { name: 'Save' }).click();
  await expect(manage.getByRole('alert')).toContainText('must keep running');
  // Nor can the last running account be removed: the button says why it is off.
  const remove = manage.getByRole('button', { name: 'Remove Account…' });
  await expect(remove).toBeDisabled();
  await expect(manage.getByText('so this one cannot be removed')).toBeVisible();
  // YapYap refuses it too, before asking anything, should a page ask anyway.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = () => {
      throw new Error('YapYap asked about a removal it refuses.');
    };
  });
  const refused = await manage.evaluate(async () => {
    const { accounts } = (globalThis as unknown as { yapyap: ChromeApi }).yapyap;
    const running = (await accounts.list()).accounts.find((account) => account.enabled);
    return running === undefined ? 'none' : accounts.remove(running.id);
  });
  expect(refused).toBeNull();
  // An account that is off can go: leaving the refused edit asks first.
  await manage.getByRole('button', { name: 'Work Off' }).click();
  await manage.getByRole('button', { name: 'Discard' }).click();
  await expect(manage.getByLabel('Name')).toHaveValue('Work');
  await expect(remove).toBeEnabled();
  const saved = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
    accounts: { name: string; enabled: boolean }[];
  };
  expect(saved.accounts.map(({ name, enabled }) => [name, enabled])).toEqual([
    ['Personal', true],
    ['Work', false],
  ]);
  const menuLabels = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items.flatMap((menu) =>
      (menu.submenu?.items ?? []).map((entry) => entry.label),
    ),
  );
  expect(menuLabels).toContain('Personal');
  expect(menuLabels).not.toContain('Work');
});

test('sends one account through its own proxy, and leaves the rest alone', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await clickMenu(app, 'Manage Accounts…');
  await expect
    .poll(() => app.windows().some((page) => page.url() === 'app://chrome/accounts.html'))
    .toBe(true);
  const manage = app.windows().find((page) => page.url() === 'app://chrome/accounts.html');
  if (manage === undefined) {
    throw new Error('The Accounts window did not open.');
  }
  await manage.getByLabel('Proxy', { exact: true }).fill('http://127.0.0.1:3128');
  await manage.getByRole('button', { name: 'Save' }).click();
  // What the account's session and the default session would use to reach WhatsApp.
  const proxies = () =>
    app.evaluate(async ({ session, webContents }) => {
      const account = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().startsWith('http://127.0.0.1'));
      const url = 'https://web.whatsapp.com/';
      return Promise.all([
        account?.session.resolveProxy(url) ?? 'no account',
        session.defaultSession.resolveProxy(url),
      ]);
    });
  await expect.poll(async () => (await proxies())[0]).toBe('PROXY 127.0.0.1:3128');
  expect((await proxies())[1]).not.toBe('PROXY 127.0.0.1:3128');
});
