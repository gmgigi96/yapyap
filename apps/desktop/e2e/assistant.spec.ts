import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assistantBarResult,
  barNames,
  barSays,
  CLAUDE_ANSWER,
  claudeAnswer,
  claudeRequests,
  clickInBar,
  fakeModelServer,
  openAssistantSettings,
  quietPort,
  readyClaude,
  standInKeyring,
} from './assistant-helpers.ts';
import { chromePage, clickMenu } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, mainWindow, test, whatsAppPage } from './fixtures.ts';

test('sets Claude up in Settings › Assistant, with the key encrypted, tested and in use', async ({
  app,
  profile,
}) => {
  const settings = await readyClaude(app, CLAUDE_ANSWER);
  // The assistant comes first in Settings.
  const first = settings.locator('main section').first();
  await expect(first).toHaveAttribute('aria-labelledby', 'assistant-title');
  await expect(settings.getByText('In use')).toBeVisible();
  await expect(settings.getByLabel('API key for Claude (Anthropic)')).toHaveValue('');
  const kept = await readFile(join(profile, 'secrets.json'), 'utf8');
  expect(kept).not.toContain('sk-ant-e2e-key');
  await settings.getByRole('button', { name: 'Test' }).click();
  await expect(settings.getByText('The key works.')).toBeVisible();
  // Auto picks the newest of Claude's quick models from what the provider lists.
  await expect(
    settings.getByRole('option', { name: 'Auto (recommended): Claude Haiku 5.5' }),
  ).toBeAttached();
  await settings.getByRole('button', { name: 'Forget Key' }).click();
  await expect(settings.getByText('No key saved.').first()).toBeVisible();
});

test('suggests replies only in a chat the user allowed, after showing what is sent', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await readyClaude(app, CLAUDE_ANSWER);
  await clickInBar(app, window, 'Suggest replies');
  await barSays(app, /^Allow the assistant to read this chat\?/);
  expect(await claudeRequests(app)).toEqual([]);
  await clickInBar(app, window, 'What is sent?');
  await expect.poll(() => assistantBarResult(app)).toContain('Them: Dinner tonight?');
  expect(await assistantBarResult(app)).toContain('Me: See you at 8');
  // WhatsApp's page cannot read what the bar shows.
  expect(await window.evaluate(() => document.body.innerText)).not.toContain('Them: Dinner');
  await clickInBar(app, window, 'Allow here');
  await expect.poll(() => barNames(app)).toContain('Can we do 9?');
  await clickInBar(app, window, 'Can we do 9?');
  await expect(window.getByTestId('composer')).toHaveText('Can we do 9?');
  const asked = await claudeRequests(app);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('Them: Dinner tonight?');
  expect(asked[0]).toContain('"model":"claude-haiku-5-5"');
  // Nothing was sent to the chat; only the user's click on Send sends.
  await expect(window.getByTestId('sent')).toHaveCount(0);
  await clickInBar(app, window, 'Suggest replies');
  await expect.poll(() => barNames(app)).toContain('See you there');
  await clickInBar(app, window, 'Send this suggestion now');
  await expect(window.getByTestId('sent')).toHaveCount(1);
});

test('summarizes the chat in the bar, copies the summary, and leaves the message box alone', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await readyClaude(app, claudeAnswer('- Dinner tonight at 8.'));
  await clickInBar(app, window, 'Summarize');
  await clickInBar(app, window, 'Allow here');
  await expect.poll(() => assistantBarResult(app)).toBe('- Dinner tonight at 8.');
  await clickInBar(app, window, 'Copy');
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe('- Dinner tonight at 8.');
  await clickInBar(app, window, 'Close');
  await expect.poll(() => assistantBarResult(app)).toBeNull();
  await expect(window.getByTestId('composer')).toHaveText('');
  expect((await claudeRequests(app))[0]).toContain('Summarize this WhatsApp chat');
});

test('rewrites the draft in the picked style, and puts the rewrite in its place on Use', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const composer = window.getByTestId('composer');
  await composer.click();
  await window.keyboard.type('running late');
  await readyClaude(app, claudeAnswer('“I am running a little late, sorry!”'));
  await clickInBar(app, window, 'Rewrite my draft');
  await clickInBar(app, window, 'Friendlier');
  await clickInBar(app, window, 'Allow here');
  await expect.poll(() => assistantBarResult(app)).toBe('I am running a little late, sorry!');
  const asked = await claudeRequests(app);
  expect(asked[0]).toContain('warmer and friendlier');
  expect(asked[0]).toContain('running late');
  await clickInBar(app, window, 'Use');
  await expect(composer).toHaveText('I am running a little late, sorry!');
});

test('catches up on the unread chats after showing exactly what is sent, opening none', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await readyClaude(app, claudeAnswer('- Test Chat Two asks if you are coming tomorrow.'));
  await clickInBar(app, window, 'Catch up');
  const entry = 'Chat: Test Chat Two\nUnread: 2\nLatest message: Are you coming tomorrow?';
  await expect.poll(() => assistantBarResult(app)).toContain(entry);
  await barSays(app, /No chat is opened or marked as read\.$/);
  expect(await claudeRequests(app)).toEqual([]);
  await clickInBar(app, window, 'Send');
  await expect
    .poll(() => assistantBarResult(app))
    .toBe('- Test Chat Two asks if you are coming tomorrow.');
  const requests = await claudeRequests(app);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain(JSON.stringify(entry).slice(1, -1));
  await expect(window.locator('#main > header')).toHaveText('Test Chat One');
  await expect(window.getByTestId('icon-unread-count')).toHaveText('2');
});

test('suggests replies on its own when a message arrives in an allowed chat', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await readyClaude(app, CLAUDE_ANSWER, claudeAnswer('Still on!'));
  await clickInBar(app, window, 'Suggest replies');
  await clickInBar(app, window, 'Allow here');
  await expect.poll(() => barNames(app)).toContain('Can we do 9?');
  // A virtual display without a window manager focuses nothing on its own.
  const main = await mainWindow(app);
  await expect
    .poll(() =>
      main.evaluate((owner) => {
        owner.focus();
        return owner.isFocused();
      }),
    )
    .toBe(true);
  // What is already there when the assistant first looks asks for nothing.
  await window.waitForTimeout(2000);
  expect(await claudeRequests(app)).toHaveLength(1);
  await window.evaluate(() => {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.innerHTML =
      '<div data-id="3EB0F9"><span data-testid="selectable-text">Still on?</span></div>';
    const rows = document.querySelectorAll('#main [role="row"]');
    rows[rows.length - 1]?.after(row);
  });
  await expect.poll(() => barNames(app), { timeout: 15_000 }).toContain('Still on!');
  expect(await claudeRequests(app)).toHaveLength(2);
});

test('runs the assistant from its menu, and opens its settings from the bar', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await standInKeyring(app);
  await barSays(app, 'Set up the assistant to start: choose where it thinks.');
  await clickMenu(app, 'Suggest Replies');
  await barSays(app, 'Set up the assistant to start: choose where it thinks.');
  await clickInBar(app, window, 'Assistant settings');
  await openAssistantSettings(app);
});

test('finds the model server on this computer, and suggests replies with it', async ({
  fakeWhatsApp,
  profile,
}) => {
  const server = await fakeModelServer('Yes, 8 works!\nCan we do 9?\nSee you there');
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: { YAPYAP_TEST_MODEL_PORTS: [await quietPort(), server.port].join(',') },
  });
  try {
    const window = await whatsAppPage(app);
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    const settings = await openAssistantSettings(app);
    await settings.getByRole('button', { name: 'Find' }).click();
    await expect(settings.getByText(`localhost:${String(server.port)}: tiny-e2e`)).toBeVisible();
    await settings.getByRole('button', { name: 'Use', exact: true }).click();
    await expect(settings.getByText('In use')).toBeVisible();
    await expect(
      settings.getByText('Right now, it goes to the model server on this computer.'),
    ).toBeVisible();
    await clickInBar(app, window, 'Suggest replies');
    await barSays(app, /Its messages stay on this computer\.$/);
    await clickInBar(app, window, 'Allow here');
    await expect.poll(() => barNames(app)).toContain('Can we do 9?');
    expect(server.chats).toHaveLength(1);
    expect(server.chats[0]).toContain('Them: Dinner tonight?');
    expect(server.chats[0]).toContain('"model":"tiny-e2e"');
  } finally {
    await closeApp(app);
    server.close();
  }
});

test('offers the model server it finds in the Welcome, and uses it on one click', async ({
  fakeWhatsApp,
  profile,
}) => {
  const server = await fakeModelServer('Hi');
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    firstRun: true,
    env: { YAPYAP_TEST_MODEL_PORTS: String(server.port) },
  });
  try {
    const welcome = await chromePage(app, '/welcome.html');
    await expect(welcome.getByRole('heading', { name: 'Your AI assistant' })).toBeVisible();
    await expect(
      welcome.getByRole('button', { name: /^Download a Private Model \(\d/ }),
    ).toBeVisible();
    await welcome
      .getByRole('button', {
        name: `Use the Model Server on This Computer (localhost:${String(server.port)})`,
      })
      .click();
    await expect(welcome.getByText(/^Done\./)).toBeVisible();
    const settings = await openAssistantSettings(app);
    await expect(
      settings.getByRole('radio', { name: /A model server on this computer/ }),
    ).toBeChecked();
  } finally {
    await closeApp(app);
    server.close();
  }
});

test('opens the page to get a key in the default browser', async ({ app }) => {
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { openedLinks: opened });
    shell.openExternal = (url: string) => {
      opened.push(url);
      return Promise.resolve();
    };
  });
  const settings = await openAssistantSettings(app);
  await settings.getByRole('link', { name: 'Get a key from Anthropic' }).click();
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { openedLinks: string[] }).openedLinks),
    )
    .toEqual(['https://console.anthropic.com/settings/keys']);
});

test('takes suggestions away when another chat opens', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await readyClaude(app, CLAUDE_ANSWER);
  await clickInBar(app, window, 'Suggest replies');
  await clickInBar(app, window, 'Allow here');
  await expect.poll(() => barNames(app)).toContain('Can we do 9?');
  // A virtual display without a window manager focuses nothing on its own.
  const main = await mainWindow(app);
  await expect
    .poll(() =>
      main.evaluate((owner) => {
        owner.focus();
        return owner.isFocused();
      }),
    )
    .toBe(true);
  // WhatsApp draws the conversation anew for another chat, dropping the bar.
  await window.evaluate(() => {
    const parts = [
      ...document.querySelectorAll(
        '#main > [data-testid="wallpaper"], #main > header, #main > footer',
      ),
    ].map((part) => part.cloneNode(true) as Element);
    parts.find((part) => part.matches('header'))?.replaceChildren('Test Chat Three');
    document.querySelector('#main')?.replaceChildren(...parts);
  });
  await expect.poll(() => barNames(app), { timeout: 10_000 }).not.toContain('Can we do 9?');
  expect(await barNames(app)).toContain('Suggest replies');
});
