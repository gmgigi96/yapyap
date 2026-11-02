import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseRelease } from '../release/distribution.ts';
import { homebrewFiles } from '../release/homebrew.ts';
import { scoopFiles } from '../release/scoop.ts';
import { wingetFiles } from '../release/winget.ts';

// Usage: distribution.ts <version> <SHA256SUMS> <output directory>
const [version, sums, output] = process.argv.slice(2).map(String);
const release = parseRelease(String(version), readFileSync(String(sums), 'utf8'));
const channels = {
  homebrew: homebrewFiles(release),
  winget: wingetFiles(release),
  scoop: scoopFiles(release),
};
for (const [channel, files] of Object.entries(channels)) {
  for (const [path, contents] of Object.entries(files)) {
    const target = join(String(output), channel, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
    console.info(`Wrote ${join(channel, path)}`);
  }
}
