import { ABOUT, channelsOf, download, type DistributionRelease } from './distribution.ts';
import type { Channel } from './repository.ts';

const CASKS: Readonly<Record<Channel, string>> = { stable: 'yapyap', beta: 'yapyap@beta' };
const OTHER: Readonly<Record<Channel, Channel>> = { stable: 'beta', beta: 'stable' };

function cask(channel: Channel, release: DistributionRelease): string {
  const dmg = download(release, 'mac-universal.dmg');
  const url = dmg.url.replaceAll(release.version, '#{version}');
  const title = channel === 'stable' ? ABOUT.name : `${ABOUT.name} Beta`;
  return [
    `cask "${CASKS[channel]}" do`,
    `  version "${release.version}"`,
    `  sha256 "${dmg.sha256}"`,
    '',
    `  url "${url}",`,
    '      verified: "github.com/vascoguita/yapyap/"',
    `  name "${title}"`,
    `  desc "${ABOUT.summary}"`,
    `  homepage "${ABOUT.homepage}"`,
    '',
    // The release workflow updates the tap, so nothing needs to look for versions.
    '  livecheck do',
    '    skip "Updated by the YapYap release workflow"',
    '  end',
    '',
    `  conflicts_with cask: "${CASKS[OTHER[channel]]}"`,
    '  depends_on :macos',
    '',
    '  app "YapYap.app"',
    '',
    '  zap trash: [',
    '    "~/Library/Application Support/YapYap",',
    '    "~/Library/Logs/YapYap",',
    '    "~/Library/Preferences/org.guita.YapYap.plist",',
    '    "~/Library/Saved Application State/org.guita.YapYap.savedState",',
    '  ]',
    'end',
    '',
  ].join('\n');
}

/** The Homebrew casks a release updates in the tap, by their path there. */
export function homebrewFiles(release: DistributionRelease): Record<string, string> {
  return Object.fromEntries(
    channelsOf(release.version).map((channel) => [
      `Casks/${CASKS[channel]}.rb`,
      cask(channel, release),
    ]),
  );
}
