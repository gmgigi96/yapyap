import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { badge, countDownloads, fromGitHub, latestDownloads } from '../release/downloads.ts';
import { githubHeaders, RELEASES_API } from '../release/releases.ts';

// Usage: downloads.ts <site directory>
// Writes downloads.json, which the website shows, downloads-badge.json,
// which the README's Shields.io badge reads (#347), and latest.json, the
// links of the website's download button (#383). The counts are GitHub's
// own release statistics; YapYap reports nothing.
const [site] = process.argv.slice(2).map(String);
const releases = [];
const answers: unknown[] = [];
for (let page = 1; ; page += 1) {
  const response = await fetch(`${RELEASES_API}&page=${String(page)}`, {
    headers: githubHeaders(process.env['GITHUB_TOKEN'] ?? ''),
  });
  if (!response.ok) {
    throw new Error(`GitHub answered ${String(response.status)}.`);
  }
  const answer: unknown = await response.json();
  answers.push(...(answer as unknown[]));
  const listed = fromGitHub(answer);
  releases.push(...listed);
  if (listed.length < 100) {
    break;
  }
}
const counts = countDownloads(releases);
writeFileSync(join(String(site), 'downloads.json'), JSON.stringify(counts));
writeFileSync(join(String(site), 'downloads-badge.json'), JSON.stringify(badge(counts)));
writeFileSync(join(String(site), 'latest.json'), JSON.stringify(latestDownloads(answers) ?? {}));
console.info(`Counted ${String(counts.total)} downloads.`);
