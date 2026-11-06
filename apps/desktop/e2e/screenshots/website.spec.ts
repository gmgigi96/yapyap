import type { ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CLAUDE_ANSWER, readyClaude } from '../assistant-helpers.ts';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';
import { closeApp, expect, launchApp, seedSettings, test } from '../fixtures.ts';
import { chromePage, clickMenu } from '../chrome-helpers.ts';

/**
 * Screenshots of YapYap's own windows for the website (#384), taken on the
 * showcase page with invented people, never on a real account. The main
 * window's pictures show the real WhatsApp, with the maintainer's chats
 * replaced by invented ones on screen before capture; see CONTRIBUTING.
 */
const OUT = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'public', 'screenshots');
const SCALE = 2;
const PERSONAL = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';
const WORK = '7d2e9b1c-3f4a-4c5d-8e6f-1a2b3c4d5e6f';

async function seed(profile: string, theme: 'light' | 'dark'): Promise<void> {
  await seedSettings(profile, { appearance: { theme } });
  // The window opens where screenshots want it, as it would where the user left it.
  await writeFile(
    join(profile, 'window-state.json'),
    JSON.stringify({
      bounds: { x: 0, y: 0, width: 1200, height: 760 },
      maximized: false,
      fullScreen: false,
    }),
  );
  await writeFile(
    join(profile, 'accounts.json'),
    JSON.stringify({
      version: 1,
      active: PERSONAL,
      accounts: [
        { id: PERSONAL, name: 'Personal', color: 'green', enabled: true },
        { id: WORK, name: 'Work', color: 'blue', enabled: true },
      ],
    }),
  );
}

/** Encodes the PNG for the website too, as a much smaller WebP. */
function webp(png: string, name: string): void {
  execFileSync('ffmpeg', [
    ...['-loglevel', 'error', '-y', '-i', png],
    ...['-c:v', 'libwebp', '-quality', '86', join(OUT, `${name}.webp`)],
  ]);
}

/**
 * Saves what a web contents shows, as Electron renders it. Playwright's own
 * screenshots of these pages emulate a viewport of their own, so the picture
 * would not match the window.
 */
async function capturePage(app: ElectronApplication, url: string, file: string): Promise<void> {
  const png = await app.evaluate(async ({ webContents }, wanted) => {
    const pages = webContents.getAllWebContents().filter((page) => page.getURL() === wanted);
    for (const page of pages) {
      const persona: unknown = await page.executeJavaScript(
        "localStorage.getItem('showcase-persona')",
      );
      if (!wanted.startsWith('http') || persona !== 'work') {
        return (await page.capturePage()).toPNG().toString('base64');
      }
    }
    return undefined;
  }, url);
  if (png === undefined) {
    throw new Error(`No page at ${url}.`);
  }
  await writeFile(file, Buffer.from(png, 'base64'));
}

/**
 * AppStream metainfo needs PNG, and the website shows the much smaller WebP,
 * so each picture is kept only in the formats something uses.
 */
type Format = 'png' | 'webp';

/** A chrome window, such as Settings, as it renders. */
async function captureWindow(
  app: ElectronApplication,
  path: string,
  name: string,
  formats: readonly Format[],
): Promise<void> {
  const page = await chromePage(app, path);
  // Waits for the fonts and two painted frames, so the shot is what a person would see.
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((painted) => requestAnimationFrame(painted));
    }
  });
  await mkdir(OUT, { recursive: true });
  const png = join(OUT, `${name}.png`);
  await capturePage(app, page.url(), png);
  if (formats.includes('webp')) {
    webp(png, name);
  }
  if (!formats.includes('png')) {
    await rm(png);
  }
}

/**
 * Gives the Work account its own persona in its own storage, which outlives
 * a restart, so both accounts load as themselves, photos included, the
 * next time YapYap starts.
 */
async function preparePersonas(origin: string, profile: string): Promise<void> {
  const app = await launchApp(origin, profile);
  try {
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, work) =>
            webContents
              .getAllWebContents()
              .some(
                (contents) => contents.session.storagePath?.endsWith(`account-${work}`) === true,
              ),
          WORK,
        ),
      )
      .toBe(true);
    await app.evaluate(async ({ webContents }, work) => {
      const page = webContents
        .getAllWebContents()
        .find((contents) => contents.session.storagePath?.endsWith(`account-${work}`) === true);
      await page?.executeJavaScript("localStorage.setItem('showcase-persona', 'work')");
    }, WORK);
  } finally {
    await closeApp(app);
  }
}

test('Settings window', async ({ profile }) => {
  const showcase = await startFakeWhatsApp('showcase.html');
  await seed(profile, 'light');
  const app = await launchApp(showcase.origin, profile, [
    `--force-device-scale-factor=${String(SCALE)}`,
  ]);
  try {
    await clickMenu(app, 'Settings…');
    // The assistant, first in Settings, has a picture of its own; this one shows the rest.
    const settings = await chromePage(app, '/settings.html');
    const general = settings.getByRole('heading', { name: 'General', exact: true });
    await general.evaluate((heading) => {
      window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 24);
    });
    await expect(general).toBeInViewport();
    await captureWindow(app, '/settings.html', 'settings', ['png']);
  } finally {
    await closeApp(app);
    await showcase.close();
  }
});

test('Accounts window, for the get-started guide (#385)', async ({ profile }) => {
  const showcase = await startFakeWhatsApp('showcase.html');
  await seed(profile, 'light');
  await preparePersonas(showcase.origin, profile);
  const app = await launchApp(showcase.origin, profile, [
    `--force-device-scale-factor=${String(SCALE)}`,
  ]);
  try {
    await clickMenu(app, 'Manage Accounts…');
    await captureWindow(app, '/accounts.html', 'accounts', ['webp']);
    expect(existsSync(join(OUT, 'accounts.webp'))).toBe(true);
  } finally {
    await closeApp(app);
    await showcase.close();
  }
});

test('AI assistant settings', async ({ profile }) => {
  const showcase = await startFakeWhatsApp('showcase.html');
  await seed(profile, 'light');
  await preparePersonas(showcase.origin, profile);
  const app = await launchApp(showcase.origin, profile, [
    `--force-device-scale-factor=${String(SCALE)}`,
  ]);
  try {
    const settings = await readyClaude(app, CLAUDE_ANSWER);
    await expect(settings.getByText('In use')).toBeVisible();
    // Saving the key scrolled to it and kept focus on its button; the shot starts at the top.
    await settings.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    await captureWindow(app, '/settings.html', 'assistant', ['png', 'webp']);
  } finally {
    await closeApp(app);
    await showcase.close();
  }
});
