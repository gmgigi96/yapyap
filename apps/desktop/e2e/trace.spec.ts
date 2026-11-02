import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';
import { clickMenu } from './chrome-helpers.ts';

test('records a performance trace where the user chose, once they agree', async ({
  app,
  profile,
}) => {
  const path = join(profile, 'yapyap.perfetto-trace');
  await app.evaluate(({ dialog }, file) => {
    const said: string[] = [];
    Object.assign(globalThis, { traceMessages: said });
    dialog.showMessageBox = (options: unknown) => {
      said.push((options as { message: string }).message);
      return Promise.resolve({ response: 0, checkboxChecked: false });
    };
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: file });
  }, path);
  await clickMenu(app, 'Record a Performance Trace…');
  // Electron writes Perfetto's binary format, which names the categories it recorded.
  const trace = () => readFile(path, 'latin1').catch(() => '');
  await expect.poll(trace, { timeout: 30_000 }).toContain('toplevel');
  await expect
    .poll(() => app.evaluate(() => (globalThis as { traceMessages?: string[] }).traceMessages))
    .toEqual(['Record a performance trace?', 'The performance trace is saved.']);
});
