import type { ElectronApplication, Page } from '@playwright/test';
import { chromePage, clickMenu } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

/** Opens Settings › Agents and turns the MCP server on; returns the page and its address. */
async function turnOnAgents(
  app: ElectronApplication,
): Promise<{ settings: Page; address: string }> {
  await clickMenu(app, 'Assistant Settings…');
  const settings = await chromePage(app, '/settings.html');
  const agents = settings.getByRole('region', { name: 'Agents' });
  await agents.getByRole('checkbox', { name: 'Let AI agents connect' }).check();
  const shown = agents.locator('.address code');
  await expect(shown).toHaveText(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  return { settings, address: await shown.innerText() };
}

/** Creates a token that may send to `chat` alone, as a user would in Settings. */
async function sendingToken(settings: Page, chat: string): Promise<string> {
  const agents = settings.getByRole('region', { name: 'Agents' });
  await agents.getByRole('button', { name: 'Create a Token…' }).click();
  await agents.getByRole('textbox', { name: /^Name/ }).fill('E2E agent');
  await agents.getByRole('checkbox', { name: 'Send messages, without asking you' }).check();
  await expect(agents.getByText(/can be tricked by a message someone sends you/)).toBeVisible();
  await agents.getByRole('textbox', { name: /Chat name/ }).fill(chat);
  await agents.getByRole('button', { name: 'Add', exact: true }).click();
  await agents.getByRole('button', { name: 'Create Token' }).click();
  const token = agents.locator('.copyable code').first();
  await expect(token).toHaveText(/^yapyap_mcp_[0-9a-f]{16}_[0-9a-f]{64}$/);
  return token.innerText();
}

/** One MCP call, as an agent on this computer makes it. */
async function callTool(
  address: string,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string; isError: boolean }> {
  const response = await fetch(address, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    return { status: response.status, text: body, isError: true };
  }
  const data = body.split('\n').find((line) => line.startsWith('data: '));
  const message = JSON.parse(data === undefined ? body : data.slice(6)) as {
    result: { content: { text: string }[]; isError?: boolean };
  };
  return {
    status: response.status,
    text: message.result.content[0]?.text ?? '',
    isError: message.result.isError === true,
  };
}

test('lets an agent with a token send to the one chat it lists, and nothing else', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const { settings, address } = await turnOnAgents(app);
  const token = await sendingToken(settings, 'Test Chat Two');

  const listed = await callTool(address, token, 'list_accounts');
  const [account] = JSON.parse(listed.text) as { id: string }[];
  expect(account?.id).toMatch(/^[0-9a-f-]{36}$/);
  const id = account?.id ?? '';

  // The token lists one chat; another is refused without being opened.
  const refused = await callTool(address, token, 'send_message', {
    account: id,
    chat: 'Test Chat One',
    text: 'Should not arrive',
  });
  expect(refused).toMatchObject({ isError: true, text: 'chat_not_allowed' });

  const sent = await callTool(address, token, 'send_message', {
    account: id,
    chat: 'Test Chat Two',
    text: 'Sent by an agent',
  });
  expect(sent).toMatchObject({ isError: false, text: '{"sent":true}' });
  await expect(window.locator('#main header')).toHaveText('Test Chat Two');
  await expect(window.getByTestId('sent')).toHaveText('Sent by an agent');
  await expect(window.getByText('Should not arrive')).toHaveCount(0);

  // The activity shows the calls, never what was sent.
  const agents = settings.getByRole('region', { name: 'Agents' });
  await expect(agents.getByText(/E2E agent · send_message in .*: ok/)).toBeVisible();
  await expect(agents.getByText('Sent by an agent')).toHaveCount(0);
});

test('turns away browser pages and wrong tokens, and stops listening when turned off', async ({
  app,
}) => {
  const { settings, address } = await turnOnAgents(app);
  const token = await sendingToken(settings, 'Test Chat Two');

  const fromPage = await callTool(
    address,
    token,
    'list_accounts',
    {},
    { origin: 'https://example.com' },
  );
  expect(fromPage.status).toBe(403);
  const wrong = await callTool(address, `${token.slice(0, -1)}0`, 'list_accounts');
  expect(wrong.status).toBe(401);

  await settings
    .getByRole('region', { name: 'Agents' })
    .getByRole('checkbox', { name: 'Let AI agents connect' })
    .uncheck();
  await expect
    .poll(() =>
      callTool(address, token, 'list_accounts').then(
        () => 'answered',
        () => 'closed',
      ),
    )
    .toBe('closed');
});
