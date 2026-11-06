import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { en } from '../src/shared/messages/en.ts';
import { expect, spawnHeadless, test } from './fixtures.ts';

test.use({ fakePage: 'logged-out.html' });

const ADDRESS = /AI agents connect to (http:\/\/127\.0\.0\.1:\d+\/mcp)\n/;

/** What the process wrote and how it ended, read as it happens. */
function watch(child: ChildProcessByStdio<null, Readable, Readable>) {
  const seen = {
    output: '',
    errors: '',
    ended: undefined as { code: number | null; signal: string | null } | undefined,
  };
  child.stdout.on('data', (chunk: Buffer) => {
    seen.output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    seen.errors += chunk.toString();
  });
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.once('exit', (code, signal) => {
      seen.ended = { code, signal };
      resolve(seen.ended);
    });
  });
  return { seen, exited };
}

test('runs with no display, says where agents connect and how to link, and quits on SIGTERM', async ({
  fakeWhatsApp,
  profile,
}) => {
  const headless = await spawnHeadless(fakeWhatsApp.origin, profile);
  const { seen, exited } = watch(headless);
  try {
    // Polls until both lines are out, or the process has ended without them.
    await expect
      .poll(
        () =>
          seen.ended !== undefined ||
          (seen.output.includes(`${en.headless.notTerminal({ account: 'WhatsApp' })}\n`) &&
            ADDRESS.test(seen.output)),
        { timeout: 30_000 },
      )
      .toBe(true);
    expect(seen.ended).toBeUndefined();
    const address = ADDRESS.exec(seen.output)?.[1] ?? '';
    // The server answers, and only with a token (ADR 0019); the output piped here showed no code.
    const answer = await fetch(address, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(answer.status).toBe(401);
    expect(seen.output).not.toContain('█');
    headless.kill('SIGTERM');
    // Windows has no SIGTERM: Node ends the process there, so only elsewhere does YapYap quit itself.
    expect(await exited).toEqual(
      process.platform === 'win32' ? { code: null, signal: 'SIGTERM' } : { code: 0, signal: null },
    );
  } catch (error) {
    // A failure says what YapYap wrote and how it ended, which the assertions alone do not.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\nended: ${JSON.stringify(seen.ended)}\n--- stdout\n${seen.output}\n--- stderr\n${seen.errors}`,
      { cause: error },
    );
  } finally {
    headless.kill('SIGKILL');
  }
});

test(
  'says how to start, and exits, with no display and no headless backend',
  { tag: '@linux' },
  async ({ fakeWhatsApp, profile }) => {
    const headless = await spawnHeadless(fakeWhatsApp.origin, profile, { backend: false });
    const { seen, exited } = watch(headless);
    try {
      expect(await exited).toEqual({ code: 1, signal: null });
      expect(seen.errors).toContain(en.headless.needsBackend);
    } finally {
      headless.kill('SIGKILL');
    }
  },
);
