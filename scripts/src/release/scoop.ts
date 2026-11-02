import {
  ABOUT,
  channelsOf,
  checkSchema,
  download,
  type DistributionRelease,
} from './distribution.ts';
import type { Channel } from './repository.ts';

const NAMES: Readonly<Record<Channel, string>> = { stable: 'yapyap', beta: 'yapyap-beta' };
// The portable build runs from wherever it is, which is how Scoop installs
// apps; the installer would install YapYap a second time, outside Scoop.
const ARCHES = [
  ['64bit', 'win-x64-portable.exe'],
  ['arm64', 'win-arm64-portable.exe'],
] as const;
const EXECUTABLE = 'YapYap.exe';

function manifest(channel: Channel, release: DistributionRelease): object {
  const downloads = Object.fromEntries(
    ARCHES.map(([arch, suffix]) => {
      const file = download(release, suffix);
      // The fragment names the downloaded file, so each architecture gets the same one.
      return [arch, { url: `${file.url}#/${EXECUTABLE}`, hash: file.sha256 }];
    }),
  );
  const name = channel === 'stable' ? ABOUT.name : `${ABOUT.name} Beta`;
  return {
    version: release.version,
    description:
      channel === 'stable' ? ABOUT.summary : `${ABOUT.summary}: betas, then each release`,
    homepage: ABOUT.homepage,
    license: ABOUT.license,
    architecture: downloads,
    shortcuts: [[EXECUTABLE, name]],
  };
}

/** The Scoop manifests a release updates in the bucket, by their path there. */
export function scoopFiles(release: DistributionRelease): Record<string, string> {
  return Object.fromEntries(
    channelsOf(release.version).map((channel) => {
      const json = manifest(channel, release);
      checkSchema('scoop.json', json);
      return [`bucket/${NAMES[channel]}.json`, `${JSON.stringify(json, null, 4)}\n`];
    }),
  );
}
