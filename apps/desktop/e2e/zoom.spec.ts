import type { ElectronApplication } from '@playwright/test';
import { openFromMenu } from './chrome-helpers.ts';
import {
  expect,
  launchApp,
  quitApp,
  seedSettings,
  test,
  whatsAppContents,
  whatsAppPage,
} from './fixtures.ts';

const whatsAppZoom = async (app: ElectronApplication) =>
  (await whatsAppContents(app)).evaluate((contents) => contents.getZoomFactor());

async function clickView(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.find((menu) => menu.label.replaceAll('&', '') === 'View')
      ?.submenu?.items.find((item) => item.label === wanted)
      ?.click();
  }, label);
}

test('zooms in 5% steps and keeps the level for the next launch', async ({
  app,
  window,
  fakeWhatsApp,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await clickView(app, 'Zoom In');
  await clickView(app, 'Zoom In');
  await expect.poll(() => whatsAppZoom(app)).toBeCloseTo(1.1);
  await clickView(app, 'Zoom Out');
  await expect.poll(() => whatsAppZoom(app)).toBeCloseTo(1.05);
  await quitApp(app);
  const again = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await whatsAppPage(again)).getByTestId('fake-whatsapp')).toBeVisible();
    await expect.poll(() => whatsAppZoom(again)).toBeCloseTo(1.05);
    await clickView(again, 'Actual Size');
    await expect.poll(() => whatsAppZoom(again)).toBeCloseTo(1);
  } finally {
    await quitApp(again);
  }
});

test('starts at 100% when the stored zoom is invalid', async ({ fakeWhatsApp, profile }) => {
  await seedSettings(profile, { appearance: { zoom: 99 } });
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    await expect.poll(() => whatsAppZoom(app)).toBeCloseTo(1);
  } finally {
    await quitApp(app);
  }
});

test('sets the interface scale from Settings', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await openFromMenu(app, 'Settings…', 'settings.html');
  const scale = settings.getByRole('group', { name: 'Interface scale' });
  await expect(scale.getByRole('radio', { name: '100%' })).toBeChecked();
  await scale.getByRole('radio', { name: '125%' }).check();
  await expect.poll(() => whatsAppZoom(app)).toBe(1.25);
});
