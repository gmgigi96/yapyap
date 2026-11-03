import { clickMenu } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

test('blurs WhatsApp behind the privacy screen, and brings it back', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const toggle = () => clickMenu(app, 'Privacy Screen');
  const filter = () => window.evaluate(() => getComputedStyle(document.documentElement).filter);
  expect(await filter()).toBe('none');
  await toggle();
  await expect.poll(filter).toContain('blur(');
  // Nothing behind the screen can be clicked.
  expect(
    await window.evaluate(() => getComputedStyle(document.documentElement).pointerEvents),
  ).toBe('none');
  await toggle();
  await expect.poll(filter).toBe('none');
});
