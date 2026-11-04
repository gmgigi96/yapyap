import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stampRelease } from '../release/metainfo.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const metainfo = join(root, 'packaging', 'linux', 'org.guita.YapYap.metainfo.xml');
const desktop = JSON.parse(readFileSync(join(root, 'apps', 'desktop', 'package.json'), 'utf8')) as {
  version: string;
};
const date = new Date().toISOString().slice(0, 10);
writeFileSync(metainfo, stampRelease(readFileSync(metainfo, 'utf8'), desktop.version, date));
console.info(`Stamped release ${desktop.version} (${date}) into the AppStream metainfo.`);
