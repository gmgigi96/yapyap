import { openFromMenu } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

test('builds a problem report the user reviews, copies it and opens GitHub', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // Records the link instead of opening a browser on the test machine.
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { openedLinks: opened });
    shell.openExternal = (url: string) => {
      opened.push(url);
      return Promise.resolve();
    };
  });
  const report = await openFromMenu(app, 'Report a Problem…', 'report.html');
  await expect(report.getByLabel('What the report includes')).toHaveValue(/^YapYap /);
  await report.getByLabel('What happened?').fill('The window stays blank after waking up.');
  await report.getByRole('button', { name: 'Copy and Open GitHub' }).click();
  await expect(report.getByText(/on your clipboard/)).toBeVisible();
  const link = await app.evaluate(
    () => (globalThis as unknown as { openedLinks: string[] }).openedLinks[0] ?? '',
  );
  expect(new URL(link).searchParams.get('title')).toBe('The window stays blank after waking up.');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toMatch(
    /^The window stays blank after waking up\.\n\nYapYap /,
  );
});
