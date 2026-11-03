import { en } from '../src/shared/messages/en.ts';
import { expect, spawnHeadless, test } from './fixtures.ts';

test.use({ fakePage: 'logged-out.html' });

test('runs with no display, says where agents connect and how to link, and quits on SIGTERM', async ({
  fakeWhatsApp,
  profile,
}) => {
  const headless = await spawnHeadless(fakeWhatsApp.origin, profile);
  let output = '';
  let errors = '';
  headless.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  headless.stderr.on('data', (chunk: Buffer) => {
    errors += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => {
    headless.once('exit', resolve);
  });
  try {
    await expect
      .poll(() => output, { timeout: 30_000, message: errors })
      .toContain(`${en.headless.notTerminal({ account: 'WhatsApp' })}\n`);
    await expect
      .poll(() => output, { message: errors })
      .toMatch(/AI agents connect to http:\/\/127\.0\.0\.1:\d+\/mcp\n/);
    const address = /AI agents connect to (http:\/\/127\.0\.0\.1:\d+\/mcp)\n/.exec(output)?.[1];
    expect(address, output).toBeDefined();
    // The server answers, and only with a token (ADR 0019); the output piped here showed no code.
    const answer = await fetch(address ?? '', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(answer.status).toBe(401);
    expect(output).not.toContain('█');
    headless.kill('SIGTERM');
    expect(await exited).toBe(0);
  } finally {
    headless.kill('SIGKILL');
  }
});
