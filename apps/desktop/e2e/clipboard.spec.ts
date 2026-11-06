import type { ElectronApplication, Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

// A 1×1 PNG, standing in for a screenshot.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Puts one item on the system clipboard, as another app would. */
async function copy(app: ElectronApplication, type: string, data: string): Promise<void> {
  await app.evaluate(
    async (electron, item) => {
      const { clipboard, ClipboardItem } = electron as unknown as {
        clipboard: { write(items: unknown[]): Promise<void> };
        ClipboardItem: new (data: Record<string, unknown>) => unknown;
      };
      const value =
        item.type === 'image/png'
          ? new Blob([Buffer.from(item.data, 'base64')], { type: item.type })
          : item.data;
      await clipboard.write([new ClipboardItem({ [item.type]: value })]);
    },
    { type, data },
  );
}

/**
 * Focuses WhatsApp and pastes the way Edit → Paste does, which simulated key
 * presses cannot do on every OS.
 */
async function pasteOnce(app: ElectronApplication, window: Page): Promise<void> {
  // paste.js records what arrives; it must be listening before the paste (#188).
  await window.waitForLoadState('load');
  await window.getByTestId('composer').focus();
  await app.evaluate(({ BrowserWindow, webContents }) => {
    const whatsapp = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('http'));
    // Paste goes to the natively focused frame; Windows does not hand focus to
    // a window just because a test opened it.
    if (whatsapp !== undefined) {
      BrowserWindow.fromWebContents(whatsapp)?.focus();
      whatsapp.focus();
      whatsapp.paste();
    }
  });
}

async function pasteIntoComposer(app: ElectronApplication, window: Page): Promise<unknown> {
  const result = window.getByTestId('paste-result');
  // Windows sometimes refuses the focus a test asks for, so the paste is
  // retried until it lands; landing at all is what the test proves.
  await expect
    .poll(
      async () => {
        await pasteOnce(app, window);
        return result.textContent();
      },
      { message: 'the paste never reached the composer', intervals: [500], timeout: 10_000 },
    )
    .not.toBe('');
  return JSON.parse((await result.textContent()) ?? 'null');
}

test('pastes an image copied from a browser or screenshot tool', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await copy(app, 'image/png', PNG);
  expect(await pasteIntoComposer(app, window)).toEqual([
    expect.objectContaining({ type: 'image/png' }),
  ]);
});

// File managers on other systems copy in their own native formats.
test(
  'pastes an image file copied in a Linux file manager',
  { tag: '@linux' },
  async ({ app, window, profile }) => {
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    const file = join(profile, 'holiday.png');
    await writeFile(file, Buffer.from(PNG, 'base64'));
    await copy(app, 'text/uri-list', `file://${file}\r\n`);
    expect(await pasteIntoComposer(app, window)).toEqual([
      expect.objectContaining({ name: 'holiday.png', type: 'image/png' }),
    ]);
  },
);

test('never lets WhatsApp read the clipboard', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await copy(app, 'text/plain', 'private note');
  const read = await window.evaluate(() =>
    navigator.clipboard.readText().then(
      () => 'allowed',
      (error: unknown) => (error instanceof Error ? error.name : 'failed'),
    ),
  );
  expect(read).not.toBe('allowed');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('private note');
});
