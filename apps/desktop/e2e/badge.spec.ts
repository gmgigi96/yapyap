import { expect, test } from './fixtures.ts';

test('shows the unread count from WhatsApp’s title on the Dock icon', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.evaluate(() => {
    document.title = '(2) WhatsApp';
  });
  await expect
    .poll(() => app.evaluate(({ app: electronApp }) => electronApp.getBadgeCount()))
    .toBe(2);
  await window.evaluate(() => {
    document.title = 'WhatsApp';
  });
  await expect
    .poll(() => app.evaluate(({ app: electronApp }) => electronApp.getBadgeCount()))
    .toBe(0);
});
