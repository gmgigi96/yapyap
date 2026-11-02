import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { barNames, barSays, clickInBar, openAssistantSettings } from './assistant-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

/** A tiny MIT-licensed GGUF model (see `test/models/LICENSE-stories260K.txt`). */
const MODEL = new URL('../test/models/stories260K.gguf', import.meta.url);

/** A model's file on a loopback port, as Hugging Face serves one: whole, or from a `Range`. */
interface ModelServer {
  readonly url: string;
  /** The `Range` header of each request, or '' for none. */
  readonly ranges: string[];
  readonly close: () => void;
}

/**
 * Serves `bytes`, breaking off the first answer halfway as a dropped
 * connection would, so the download has to resume.
 */
async function modelServer(bytes: Buffer): Promise<ModelServer> {
  const ranges: string[] = [];
  const server = createServer((request, response) => {
    const range = request.headers.range ?? '';
    ranges.push(range);
    const start = Number(/^bytes=(\d+)-$/.exec(range)?.[1] ?? 0);
    response.writeHead(start > 0 ? 206 : 200, {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.length - start),
      ...(start > 0
        ? {
            'content-range': `bytes ${String(start)}-${String(bytes.length - 1)}/${String(bytes.length)}`,
          }
        : {}),
    });
    if (ranges.length === 1) {
      // The first half arrives before the connection drops.
      response.write(bytes.subarray(0, bytes.length / 2), () => {
        setTimeout(() => response.destroy(), 500);
      });
      return;
    }
    response.end(bytes.subarray(start));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/stories260K.gguf`,
    ranges,
    close: () => server.close(),
  };
}

test('downloads, verifies and runs the private model in its own engine window, resuming a broken download', async ({
  fakeWhatsApp,
  profile,
}) => {
  // Loading and running the model on the processor takes a while on a busy machine.
  test.setTimeout(180_000);
  const bytes = await readFile(MODEL);
  const server = await modelServer(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: {
      YAPYAP_TEST_BUILT_IN_MODEL: JSON.stringify({ url: server.url, size: bytes.length, sha256 }),
    },
  });
  try {
    const window = await whatsAppPage(app);
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    const settings = await openAssistantSettings(app);
    // Nothing is downloaded, and no engine runs, before the user's click.
    expect(server.ranges).toEqual([]);
    const engines = () =>
      app.evaluate(
        ({ webContents }) =>
          webContents.getAllWebContents().filter((page) => page.getURL().startsWith('app://engine'))
            .length,
      );
    expect(await engines()).toBe(0);
    const place = settings.locator('.place').filter({ hasText: 'Private, on this computer' });
    await place.getByRole('radio').check();
    await place.getByRole('button', { name: 'Download' }).click();
    await expect(place.getByText(/^The download stopped at \d+%/)).toBeVisible({ timeout: 30_000 });
    await place.getByRole('button', { name: 'Resume' }).click();
    await expect(place.getByText(/^Ready\. It takes 1 MB/)).toBeVisible({ timeout: 30_000 });
    // What came before the break is kept, and only the rest is asked for.
    expect(server.ranges).toEqual(['', expect.stringMatching(/^bytes=[1-9]\d*-$/)]);
    expect(await readdir(join(profile, 'models'))).toEqual([`${sha256}.gguf`]);
    await clickInBar(app, window, 'Suggest replies');
    await barSays(app, /Its messages stay on this computer\.$/);
    await clickInBar(app, window, 'Allow here');
    // The tiny model writes nonsense, but writes it: the engine ran in its window.
    await expect
      .poll(async () => (await barNames(app))?.includes('Send this suggestion now') ?? false, {
        timeout: 90_000,
      })
      .toBe(true);
    expect(await engines()).toBe(1);
    await place.getByRole('button', { name: 'Remove' }).click();
    await expect(place.getByText('Not downloaded yet.')).toBeVisible();
    await expect.poll(engines).toBe(0);
    expect(await readdir(profile)).not.toContain('models');
  } finally {
    await closeApp(app);
    server.close();
  }
});
