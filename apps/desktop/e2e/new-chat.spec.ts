import { openFromMenu } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

test('opens a chat with a number from the Account menu, without saving it', async ({
  app,
  window,
  fakeWhatsApp,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const dialog = await openFromMenu(app, 'New Chat with Number…', 'new-chat.html');
  const number = dialog.getByLabel('Phone number, with the country code');
  const open = dialog.getByRole('button', { name: 'Open Chat' });
  await number.fill('07700 900123');
  await expect(open).toBeDisabled();
  await number.fill('+44 7700 900123');
  await open.click();
  await expect.poll(() => window.url()).toBe(`${fakeWhatsApp.origin}/send?phone=447700900123`);
  await expect.poll(() => dialog.isClosed()).toBe(true);
});
