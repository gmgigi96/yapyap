import { readFileSync } from 'node:fs';
import { checkBetaGate, parseReleases } from '../release/beta-gate.ts';
import { githubHeaders, RELEASES_API } from '../release/releases.ts';

// The release PR carries the version it would release in the manifest.
const manifest = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8')) as Record<
  string,
  string
>;
const response = await fetch(RELEASES_API, {
  headers: githubHeaders(process.env['GITHUB_TOKEN'] ?? ''),
});
const result = checkBetaGate({
  version: manifest['.'] ?? '',
  releases: parseReleases(await response.json()),
});
console.info(result.pass ? result.message : `::error::${result.message}`);
process.exitCode = Number(!result.pass);
