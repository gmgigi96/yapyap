import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromePage } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

const CREDENTIALS = `Basic ${Buffer.from('ana:hunter2').toString('base64')}`;
const SIGNED_IN_PAGE =
  '<!doctype html><title>WhatsApp</title><main data-testid="fake-whatsapp">Signed in</main>';

/** An HTTP proxy that wants a username and password, and counts refusals. */
async function startAuthProxy(): Promise<{
  origin: string;
  refused: () => number;
  close: () => Promise<void>;
}> {
  let refused = 0;
  const server: Server = createServer((incoming, outgoing) => {
    if (incoming.headers['proxy-authorization'] !== CREDENTIALS) {
      refused += 1;
      outgoing.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="test"' }).end();
      return;
    }
    // Signed in, it answers for WhatsApp itself rather than forwarding
    // anywhere: the test only needs to see the page arrive through it.
    outgoing.writeHead(200, { 'Content-Type': 'text/html' }).end(SIGNED_IN_PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    refused: () => refused,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

test('signs in to a proxy that asks for a password', async ({ fakeWhatsApp, profile }) => {
  const proxy = await startAuthProxy();
  // Loopback normally skips proxies; the fake page must go through this one.
  const app = await launchApp(fakeWhatsApp.origin, profile, [
    `--proxy-server=${proxy.origin}`,
    '--proxy-bypass-list=<-loopback>',
  ]);
  try {
    // The window waits for launch and the proxy's first refusal, which slow
    // Windows runners can take past the default 5 s for (#247).
    const login = await chromePage(app, '/proxy-login.html', 20_000);
    const host = new URL(proxy.origin).host;
    await expect(
      login.getByText(`The proxy ${host} asks for a username and password.`),
    ).toBeVisible();
    await login.getByLabel('Username').fill('ana');
    await login.getByLabel('Password').fill('hunter2');
    // Signing in closes the window, which can end the click before Playwright
    // sees it finish; the page loading below checks that it worked.
    await Promise.all([
      login.waitForEvent('close'),
      login
        .getByRole('button', { name: 'Sign In' })
        .click()
        .catch(() => undefined),
    ]);
    const window = await whatsAppPage(app);
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    expect(proxy.refused()).toBeGreaterThan(0);
  } finally {
    await closeApp(app);
    await proxy.close();
  }
});
