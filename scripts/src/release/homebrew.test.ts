import { describe, expect, it } from 'vitest';
import { parseRelease } from './distribution.ts';
import { homebrewFiles } from './homebrew.ts';

const DMG = 'd'.repeat(64);
const sums = (version: string) => `${DMG}  YapYap-${version}-mac-universal.dmg\n`;

const cask = (name: string, title: string, version: string, other: string) =>
  [
    `cask "${name}" do`,
    `  version "${version}"`,
    `  sha256 "${DMG}"`,
    '',
    '  url "https://github.com/vascoguita/yapyap/releases/download/v#{version}/YapYap-#{version}-mac-universal.dmg",',
    '      verified: "github.com/vascoguita/yapyap/"',
    `  name "${title}"`,
    '  desc "Unofficial desktop client for WhatsApp Web"',
    '  homepage "https://yapyap.guita.org/"',
    '',
    '  livecheck do',
    '    skip "Updated by the YapYap release workflow"',
    '  end',
    '',
    `  conflicts_with cask: "${other}"`,
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

describe('homebrewFiles', () => {
  it('updates both casks for a release, each with the universal DMG', () => {
    expect(homebrewFiles(parseRelease('10.20.30', sums('10.20.30')))).toEqual({
      'Casks/yapyap.rb': cask('yapyap', 'YapYap', '10.20.30', 'yapyap@beta'),
      'Casks/yapyap@beta.rb': cask('yapyap@beta', 'YapYap Beta', '10.20.30', 'yapyap'),
    });
  });

  it('updates only the beta cask for a beta', () => {
    const files = homebrewFiles(parseRelease('10.20.31-beta.2', sums('10.20.31-beta.2')));
    expect(files).toEqual({
      'Casks/yapyap@beta.rb': cask('yapyap@beta', 'YapYap Beta', '10.20.31-beta.2', 'yapyap'),
    });
  });

  it('refuses a release without its DMG', () => {
    expect(() => homebrewFiles(parseRelease('10.20.30', sums('10.20.29')))).toThrow(
      'SHA256SUMS lists no YapYap-10.20.30-mac-universal.dmg',
    );
  });
});
