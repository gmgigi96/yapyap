import type { ElectronApplication, Page } from '@playwright/test';
import { mkdir, readdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFromMenu } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, seedSettings, test, whatsAppPage } from './fixtures.ts';

/** Points YapYap's downloads folder into the test profile. */
async function useDownloads(app: ElectronApplication, profile: string): Promise<string> {
  const folder = join(profile, 'Downloads');
  await mkdir(folder);
  await app.evaluate(({ app: electronApp }, path) => {
    electronApp.setPath('downloads', path);
  }, folder);
  return folder;
}

async function download(window: Page, name: string): Promise<void> {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.evaluate((suggested) => {
    const link = document.createElement('a');
    link.href = `/__download?name=${encodeURIComponent(suggested)}`;
    document.body.append(link);
    link.click();
  }, name);
}

test('saves an attachment into the downloads folder under a safe name', async ({
  app,
  window,
  profile,
}) => {
  const folder = await useDownloads(app, profile);
  await download(window, '../../escape.TXT');
  // Chromium cleans the server's suggestion before YapYap does; either way the
  // file lands inside the folder, with its extension and case intact.
  await expect.poll(() => readdir(folder)).toEqual([expect.stringMatching(/escape\.TXT$/)]);
  const [saved = ''] = await readdir(folder);
  expect(saved).not.toMatch(/[/\\]/);
  expect(await readFile(join(folder, saved), 'utf8')).toBe('attachment body');
  expect((await readdir(profile)).filter((name) => name.includes('escape'))).toEqual([]);
  expect((await readdir(join(profile, '..'))).filter((name) => name.includes('escape'))).toEqual(
    [],
  );
});

// Creating symlinks needs extra rights on Windows.
test(
  'never writes through a symlink planted under the same name',
  { tag: '@not-windows' },
  async ({ app, window, profile }) => {
    const folder = await useDownloads(app, profile);
    const outside = join(profile, 'outside.txt');
    await writeFile(outside, 'keep me');
    await symlink(outside, join(folder, 'report.txt'));
    await download(window, 'report.txt');
    await expect
      .poll(async () => (await readdir(folder)).sort())
      .toEqual(['report (1).txt', 'report.txt']);
    expect(await readFile(outside, 'utf8')).toBe('keep me');
  },
);

test('renames a Windows device name instead of saving it', async ({ app, window, profile }) => {
  const folder = await useDownloads(app, profile);
  await download(window, 'CON.txt');
  await expect.poll(() => readdir(folder)).toEqual(['_CON.txt']);
});

test('opens a finished PDF when asked to, and never a program', async ({
  fakeWhatsApp,
  profile,
}) => {
  await seedSettings(profile, { downloads: { openWhenDone: true } });
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    const folder = await useDownloads(app, profile);
    // Records what would open instead of opening it on the test machine.
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      Object.assign(globalThis, { openedPaths: opened });
      shell.openPath = (path) => {
        opened.push(path);
        return Promise.resolve('');
      };
    });
    const window = await whatsAppPage(app);
    await download(window, 'setup.exe');
    await download(window, 'Invoice.pdf');
    await expect
      .poll(async () => (await readdir(folder)).sort())
      .toEqual(['Invoice.pdf', 'setup.exe']);
    // Paths compare once resolved: macOS links the temporary folder elsewhere,
    // and Windows may name it by its short 8.3 form.
    const opened = async (): Promise<string[]> => {
      const paths = await app.evaluate(
        () => (globalThis as unknown as { openedPaths: string[] }).openedPaths,
      );
      return Promise.all(paths.map((path) => realpath(path)));
    };
    await expect.poll(opened).toEqual([await realpath(join(folder, 'Invoice.pdf'))]);
  } finally {
    await closeApp(app);
  }
});

test('lists the session’s downloads and shows a finished one in its folder', async ({
  app,
  window,
  profile,
}) => {
  const folder = await useDownloads(app, profile);
  await app.evaluate(({ shell }) => {
    const shown: string[] = [];
    Object.assign(globalThis, { shownPaths: shown });
    shell.showItemInFolder = (path) => {
      shown.push(path);
    };
  });
  await download(window, 'Invoice.pdf');
  await expect.poll(() => readdir(folder)).toEqual(['Invoice.pdf']);
  const downloads = await openFromMenu(app, 'Downloads…', 'downloads.html');
  await expect(downloads.getByText('Invoice.pdf')).toBeVisible();
  await expect(downloads.getByText('Done')).toBeVisible();
  await downloads.getByRole('button', { name: 'Show in Folder' }).click();
  const shown = async (): Promise<string[]> => {
    const paths = await app.evaluate(
      () => (globalThis as unknown as { shownPaths: string[] }).shownPaths,
    );
    return Promise.all(paths.map((path) => realpath(path)));
  };
  await expect.poll(shown).toEqual([await realpath(join(folder, 'Invoice.pdf'))]);
});

test('saves into the folder chosen in Settings', async ({ app, window, profile }) => {
  await useDownloads(app, profile);
  const chosen = join(profile, 'Saved');
  await mkdir(chosen);
  // The system's folder dialog answers with the test's folder.
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, chosen);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await openFromMenu(app, 'Settings…', 'settings.html');
  await settings.getByRole('button', { name: 'Choose… Save files to' }).click();
  await expect(settings.getByText(chosen)).toBeVisible();
  await download(window, 'Ticket.pdf');
  await expect.poll(() => readdir(chosen)).toEqual(['Ticket.pdf']);
});
