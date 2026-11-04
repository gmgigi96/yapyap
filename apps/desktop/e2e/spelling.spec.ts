import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, seedSettings, test, whatsAppPage } from './fixtures.ts';
import { clickLastItem, lastMenu, recordMenus, shownMenus } from './menu-helpers.ts';

test('offers editing on a right click in the message box, and leads to Settings for spelling', async ({
  app,
  window,
}) => {
  await recordMenus(app);
  await window.getByTestId('composer').click({ button: 'right' });
  await expect
    .poll(() => lastMenu(app))
    .toEqual(['Cut', 'Copy', 'Paste', '', 'Select All', '', 'Check Spelling']);
  const opened = app.waitForEvent('window');
  await clickLastItem(app);
  const settings = await opened;
  await settings.waitForURL('app://chrome/settings.html');
  await expect(settings.getByRole('checkbox', { name: 'Check spelling' })).not.toBeChecked();
});

// macOS selects the word under the pointer on a right click, so Copy is offered there.
test(
  'shows no menu where there is nothing to edit or copy',
  { tag: '@not-macos' },
  async ({ app, window }) => {
    await recordMenus(app);
    await window.getByTestId('fake-whatsapp').click({ button: 'right', position: { x: 2, y: 2 } });
    await window.getByTestId('composer').click({ button: 'right' });
    await expect.poll(() => lastMenu(app)).toBeDefined();
    expect(await shownMenus(app)).toBe(1);
  },
);

// macOS picks spelling languages itself.
test(
  'picks spelling languages from a searchable list',
  { tag: '@not-macos' },
  async ({ fakeWhatsApp, profile }) => {
    await seedSettings(profile, { spelling: { enabled: true } });
    // Spelling on makes Chromium fetch a dictionary; a dead proxy keeps the
    // test off the network, while loopback still reaches the fake page.
    const app = await launchApp(fakeWhatsApp.origin, profile, [
      '--proxy-server=http://127.0.0.1:1',
    ]);
    try {
      const window = await whatsAppPage(app);
      await recordMenus(app);
      await window.getByTestId('composer').click({ button: 'right' });
      await expect.poll(() => lastMenu(app)).toContain('Languages…');
      const opened = app.waitForEvent('window');
      await app.evaluate(() => {
        (globalThis as unknown as { shownMenus: Electron.Menu[] }).shownMenus
          .at(-1)
          ?.items.find((item) => item.label === 'Languages…')
          ?.click();
      });
      const languages = await opened;
      await languages.waitForURL('app://chrome/spelling-languages.html');
      // Which one depends on whether the system's language has a dictionary.
      await expect(
        languages.getByText(
          /Checking your system’s language|No dictionary matches your system’s language/,
        ),
      ).toBeVisible();
      await languages.getByRole('searchbox', { name: 'Search languages' }).fill('portugues');
      await languages.getByRole('checkbox', { name: /português \(Portugal\)/ }).check();
      await expect(languages.getByText('1 of 10 chosen.')).toBeVisible();
      await expect
        .poll(async () => {
          const saved = JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8')) as {
            spelling?: { languages?: string[] };
          };
          return saved.spelling?.languages;
        })
        .toEqual(['pt-PT']);
    } finally {
      await closeApp(app);
    }
  },
);
