import type { ElectronApplication } from '@playwright/test';
import { openFromMenu } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, test } from './fixtures.ts';

/** The display backend diagnostics name: Linux CI runs on its virtual X11 display. */
const DISPLAY = process.platform === 'linux' ? 'X11 \\(automatic\\)' : 'native';

async function technicalDetails(app: ElectronApplication): Promise<string> {
  const about = await openFromMenu(app, 'About YapYap', 'about.html');
  await about.getByRole('button', { name: 'Copy Technical Details' }).click();
  await expect(about.getByRole('status')).toHaveText('Copied to the clipboard.');
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

test('reports the graphics mode in the technical details', async ({ app }) => {
  expect(await technicalDetails(app)).toMatch(
    new RegExp(`\\nGraphics hardware accelerated, display ${DISPLAY}$`),
  );
});

test('starts without hardware acceleration with --safe-mode', async ({ fakeWhatsApp, profile }) => {
  const app = await launchApp(fakeWhatsApp.origin, profile, ['--safe-mode']);
  try {
    expect(await technicalDetails(app)).toMatch(
      new RegExp(`\\nGraphics software rendering \\(safe mode\\), display ${DISPLAY}$`),
    );
    const status = await app.evaluate(({ app: electronApp }) => electronApp.getGPUFeatureStatus());
    expect(status.gpu_compositing).toMatch(/^disabled/);
  } finally {
    await closeApp(app);
  }
});
