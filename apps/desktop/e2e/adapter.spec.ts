import type { ElectronApplication } from '@playwright/test';
import { ADAPTER_WORLD_ID } from '../src/adapter/world.ts';
import { PAGE_STATE_PROBE } from '../src/adapter/page-state.ts';
import { LOGIN_CODE } from '../src/adapter/login-code.ts';
import { clickMenu } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

/** p95 time from a key press to the next frame after the composer updates. */
const TYPING_P95_BUDGET_MS = 100;
const TYPED_TEXT = 'The quick brown fox jumps over the lazy dog';

async function copiedDiagnostics(app: ElectronApplication): Promise<string> {
  await app.evaluate(({ clipboard }) => {
    clipboard.clear();
  });
  await clickMenu(app, 'Copy Diagnostics');
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).not.toBe('');
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

test('describes the chat list and the open chat in the diagnostics', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect(await copiedDiagnostics(app)).toContain(
    '\nWhatsApp view=chats, chat_open=true (landmarks v9)\n',
  );
});

test.describe('when the account is logged out', () => {
  test.use({ fakePage: 'logged-out.html' });

  test('reports the login screen in the diagnostics', async ({ app, window }) => {
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    expect(await copiedDiagnostics(app)).toContain(
      '\nWhatsApp view=logged-out, chat_open=false (landmarks v9)\n',
    );
  });

  test('reads the login code’s modules from the page’s canvas', async ({ app, window }) => {
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    const code: unknown = await app.evaluate(
      ({ webContents }, probe) =>
        webContents
          .getAllWebContents()
          .find((candidate) => candidate.getURL().startsWith('http://127.0.0.1'))
          ?.executeJavaScriptInIsolatedWorld(probe.world, [{ code: probe.code }]),
      { world: ADAPTER_WORLD_ID, code: LOGIN_CODE },
    );
    // The fake page draws 25 modules a side, with a finder pattern in the corner.
    expect(code).toHaveLength(25);
    expect((code as string[])[0]).toMatch(/^11111110[01]{10}1111111$/);
    expect((code as string[])[1]).toMatch(/^10000010[01]{10}1000001$/);
  });
});

test('typing stays fast while the adapter reads the page', async ({ app, window }) => {
  await window.waitForLoadState('load');
  await window.evaluate(() => {
    const composer = document.querySelector<HTMLElement>('[data-testid="composer"]');
    const latencies: number[] = [];
    let pressed = 0;
    composer?.addEventListener('keydown', () => {
      pressed = performance.now();
    });
    composer?.addEventListener('input', () => {
      requestAnimationFrame(() => latencies.push(performance.now() - pressed));
    });
    Object.assign(window, { typingLatencies: latencies });
  });
  // The probe runs far more often here than YapYap ever runs it.
  await app.evaluate(
    ({ webContents }, probe) => {
      const contents = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('http://127.0.0.1'));
      const timer = setInterval(() => {
        void contents?.executeJavaScriptInIsolatedWorld(probe.world, [{ code: probe.code }]);
      }, 50);
      Object.assign(globalThis, {
        stopProbing: () => {
          clearInterval(timer);
        },
      });
    },
    { world: ADAPTER_WORLD_ID, code: PAGE_STATE_PROBE },
  );
  await window.getByTestId('composer').click();
  await window.keyboard.type(TYPED_TEXT, { delay: 20 });
  await app.evaluate(() => {
    (globalThis as unknown as { stopProbing: () => void }).stopProbing();
  });
  await expect(window.getByTestId('composer')).toHaveText(TYPED_TEXT);
  const latencies = await window.evaluate(() =>
    (window as unknown as { typingLatencies: number[] }).typingLatencies.toSorted((a, b) => a - b),
  );
  expect(latencies).toHaveLength(TYPED_TEXT.length);
  const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1] ?? Infinity;
  expect(p95).toBeLessThan(TYPING_P95_BUDGET_MS);
});
