import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { buildJobs } from '../packaging/targets.ts';

const desktop = join(import.meta.dirname, '..', '..', '..', 'apps', 'desktop');
// electron-builder's own entry, run by this Node.js, so no program is looked
// up on PATH.
const builder = createRequire(join(desktop, 'package.json')).resolve('electron-builder/cli.js');

for (const { args, env } of buildJobs(process.platform, process.arch)) {
  execFileSync(process.execPath, [builder, ...args], {
    cwd: desktop,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}
