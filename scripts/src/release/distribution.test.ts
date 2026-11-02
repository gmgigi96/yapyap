import { describe, expect, it } from 'vitest';
import {
  channelsOf,
  checkSchema,
  download,
  parseRelease,
  releaseNotesUrl,
  type DistributionRelease,
} from './distribution.ts';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('parseRelease', () => {
  it('reads every file and checksum, in text and binary mode', () => {
    const release = parseRelease(
      '1.2.3',
      `${A}  YapYap-1.2.3-mac-universal.dmg\n${B} *yapyap-bin.PKGBUILD\n\n`,
    );
    expect(release.version).toBe('1.2.3');
    expect([...release.checksums]).toEqual([
      ['YapYap-1.2.3-mac-universal.dmg', A],
      ['yapyap-bin.PKGBUILD', B],
    ]);
  });

  it.each(['v1.2.3', '1.2', '1.2.3-rc.1', '1.2.3-beta', '1.2.3-beta.1\n'])(
    'refuses the version %j',
    (version) => {
      expect(() => parseRelease(version, '')).toThrow(`Not a release version: ${version}`);
    },
  );

  it.each([
    `${A} YapYap.dmg`,
    `${A.slice(1)}  YapYap.dmg`,
    `${A.toUpperCase()}  YapYap.dmg`,
    `${A}  ../YapYap.dmg`,
    `${A}  Yap Yap.dmg`,
    `x${A}  YapYap.dmg`,
  ])('refuses the line %j', (line) => {
    expect(() => parseRelease('1.2.3', line)).toThrow(`Not a SHA256SUMS line: ${line}`);
  });
});

describe('channelsOf', () => {
  it('sends releases to both channels and betas to the beta channel', () => {
    expect(channelsOf('1.2.3')).toEqual(['stable', 'beta']);
    expect(channelsOf('1.2.3-beta.4')).toEqual(['beta']);
  });
});

describe('download', () => {
  const release: DistributionRelease = {
    version: '1.2.3-beta.4',
    checksums: new Map([['YapYap-1.2.3-beta.4-mac-universal.dmg', A]]),
  };

  it("points at the release's own file on GitHub", () => {
    expect(download(release, 'mac-universal.dmg')).toEqual({
      url: 'https://github.com/vascoguita/yapyap/releases/download/v1.2.3-beta.4/YapYap-1.2.3-beta.4-mac-universal.dmg',
      sha256: A,
    });
  });

  it('refuses a file SHA256SUMS does not list', () => {
    expect(() => download(release, 'win-x64-setup.exe')).toThrow(
      'SHA256SUMS lists no YapYap-1.2.3-beta.4-win-x64-setup.exe',
    );
  });
});

describe('releaseNotesUrl', () => {
  it('links the release page', () => {
    expect(releaseNotesUrl('1.2.3')).toBe(
      'https://github.com/vascoguita/yapyap/releases/tag/v1.2.3',
    );
  });
});

describe('checkSchema', () => {
  const version = {
    PackageIdentifier: 'YapYap.YapYap',
    PackageVersion: '1.2.3',
    DefaultLocale: 'en-US',
    ManifestType: 'version',
    ManifestVersion: '1.28.0',
  };

  it('accepts a manifest that matches the schema', () => {
    expect(() => {
      checkSchema('winget-version-1.28.0.json', version);
    }).not.toThrow();
  });

  it('names the schema and every reason a manifest does not match', () => {
    expect(() => {
      checkSchema('winget-version-1.28.0.json', { ...version, ManifestType: 'installer' });
    }).toThrow(/^Not a valid winget-version-1\.28\.0\.json manifest: \/ManifestType .+$/);
  });
});
