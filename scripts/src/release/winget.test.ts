import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseRelease } from './distribution.ts';
import { wingetFiles } from './winget.ts';

const X64 = 'a'.repeat(64);
const ARM64 = 'b'.repeat(64);
const DOWNLOADS = 'https://github.com/vascoguita/yapyap/releases/download';
const sums = (version: string) =>
  `${X64}  YapYap-${version}-win-x64-setup.exe\n${ARM64}  YapYap-${version}-win-arm64-setup.exe\n`;
const release = (version: string) => parseRelease(version, sums(version));

describe('wingetFiles', () => {
  it('writes the three manifests of both packages for a release', () => {
    expect(Object.keys(wingetFiles(release('10.20.30')))).toEqual([
      'YapYap.YapYap/YapYap.YapYap.installer.yaml',
      'YapYap.YapYap/YapYap.YapYap.locale.en-US.yaml',
      'YapYap.YapYap/YapYap.YapYap.yaml',
      'YapYap.YapYap.Beta/YapYap.YapYap.Beta.installer.yaml',
      'YapYap.YapYap.Beta/YapYap.YapYap.Beta.locale.en-US.yaml',
      'YapYap.YapYap.Beta/YapYap.YapYap.Beta.yaml',
    ]);
  });

  it('writes only the beta package for a beta', () => {
    expect(Object.keys(wingetFiles(release('10.20.31-beta.1')))).toEqual([
      'YapYap.YapYap.Beta/YapYap.YapYap.Beta.installer.yaml',
      'YapYap.YapYap.Beta/YapYap.YapYap.Beta.locale.en-US.yaml',
      'YapYap.YapYap.Beta/YapYap.YapYap.Beta.yaml',
    ]);
  });

  it('installs the per-architecture NSIS installers, per user', () => {
    const file = wingetFiles(release('10.20.31-beta.1'))[
      'YapYap.YapYap.Beta/YapYap.YapYap.Beta.installer.yaml'
    ];
    expect(file).toMatch(
      /^# yaml-language-server: \$schema=https:\/\/aka\.ms\/winget-manifest\.installer\.1\.28\.0\.schema\.json\n\n/,
    );
    expect(parse(String(file))).toEqual({
      PackageIdentifier: 'YapYap.YapYap.Beta',
      PackageVersion: '10.20.31-beta.1',
      InstallerType: 'nullsoft',
      Scope: 'user',
      UpgradeBehavior: 'install',
      Protocols: ['whatsapp', 'yapyap'],
      Installers: [
        {
          Architecture: 'x64',
          InstallerUrl: `${DOWNLOADS}/v10.20.31-beta.1/YapYap-10.20.31-beta.1-win-x64-setup.exe`,
          InstallerSha256: X64.toUpperCase(),
        },
        {
          Architecture: 'arm64',
          InstallerUrl: `${DOWNLOADS}/v10.20.31-beta.1/YapYap-10.20.31-beta.1-win-arm64-setup.exe`,
          InstallerSha256: ARM64.toUpperCase(),
        },
      ],
      ManifestType: 'installer',
      ManifestVersion: '1.28.0',
    });
  });

  it('describes the release package, which alone takes the moniker', () => {
    const files = wingetFiles(release('10.20.30'));
    const { Description: description, ...locale } = parse(
      String(files['YapYap.YapYap/YapYap.YapYap.locale.en-US.yaml']),
    ) as Record<string, unknown>;
    expect(description).toMatch(/not affiliated with WhatsApp or Meta\.$/);
    expect(locale).toEqual({
      PackageIdentifier: 'YapYap.YapYap',
      PackageVersion: '10.20.30',
      PackageLocale: 'en-US',
      Publisher: 'Vasco Guita',
      PublisherUrl: 'https://github.com/vascoguita',
      PublisherSupportUrl: 'https://github.com/vascoguita/yapyap/issues',
      PrivacyUrl: 'https://yapyap.guita.org/privacy',
      Author: 'Vasco Guita',
      PackageName: 'YapYap',
      PackageUrl: 'https://yapyap.guita.org/',
      License: 'MIT',
      LicenseUrl: 'https://github.com/vascoguita/yapyap/blob/master/LICENSE',
      ShortDescription: 'Unofficial desktop client for WhatsApp Web',
      Moniker: 'yapyap',
      Tags: ['chat', 'electron', 'messaging', 'whatsapp'],
      ReleaseNotesUrl: 'https://github.com/vascoguita/yapyap/releases/tag/v10.20.30',
      ManifestType: 'defaultLocale',
      ManifestVersion: '1.28.0',
    });
    const beta = parse(
      String(files['YapYap.YapYap.Beta/YapYap.YapYap.Beta.locale.en-US.yaml']),
    ) as Record<string, unknown>;
    expect(beta['PackageName']).toBe('YapYap Beta');
    expect(beta['Description']).toMatch(/^Betas and releases of YapYap/);
    expect(beta).not.toHaveProperty('Moniker');
  });

  it('names the default locale in the version manifest', () => {
    const file = wingetFiles(release('10.20.30'))['YapYap.YapYap/YapYap.YapYap.yaml'];
    expect(file).toContain('winget-manifest.version.1.28.0.schema.json');
    expect(parse(String(file))).toEqual({
      PackageIdentifier: 'YapYap.YapYap',
      PackageVersion: '10.20.30',
      DefaultLocale: 'en-US',
      ManifestType: 'version',
      ManifestVersion: '1.28.0',
    });
  });

  it('refuses a release without both installers', () => {
    const x64Only = parseRelease('10.20.30', `${X64}  YapYap-10.20.30-win-x64-setup.exe\n`);
    expect(() => wingetFiles(x64Only)).toThrow(
      'SHA256SUMS lists no YapYap-10.20.30-win-arm64-setup.exe',
    );
  });
});
