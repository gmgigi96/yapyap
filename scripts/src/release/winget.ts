import {
  ABOUT,
  channelsOf,
  checkSchema,
  download,
  releaseNotesUrl,
  type DistributionRelease,
} from './distribution.ts';
import type { Channel } from './repository.ts';

type YamlValue = string | readonly string[] | readonly Readonly<Record<string, string>>[];
type Manifest = Readonly<Record<string, YamlValue>>;

const MANIFEST_VERSION = '1.28.0';
const LOCALE = 'en-US';
const IDS: Readonly<Record<Channel, string>> = {
  stable: 'YapYap.YapYap',
  beta: 'YapYap.YapYap.Beta',
};
const ARCHES = [
  ['x64', 'win-x64-setup.exe'],
  ['arm64', 'win-arm64-setup.exe'],
] as const;

/**
 * A YAML document of plain scalars, lists and lists of flat maps, which is
 * all a winget manifest needs. Every string is double-quoted JSON, which
 * YAML reads back unchanged, so no value can turn into YAML syntax.
 */
function toYaml(type: string, manifest: Manifest): string {
  const schema = `https://aka.ms/winget-manifest.${type}.${MANIFEST_VERSION}.schema.json`;
  const lines = [`# yaml-language-server: $schema=${schema}`, ''];
  for (const [key, value] of Object.entries(manifest)) {
    lines.push(typeof value === 'string' ? `${key}: ${quote(value)}` : `${key}:`);
    if (typeof value !== 'string') {
      lines.push(...value.map(listItem));
    }
  }
  return `${lines.join('\n')}\n`;
}

const quote = (value: string): string => JSON.stringify(value);

function listItem(item: string | Readonly<Record<string, string>>): string {
  if (typeof item === 'string') {
    return `- ${quote(item)}`;
  }
  return Object.entries(item)
    .map(([key, value]) => `  ${key}: ${quote(value)}`)
    .join('\n')
    .replace(/^ /, '-');
}

function header(channel: Channel, release: DistributionRelease): Manifest {
  return { PackageIdentifier: IDS[channel], PackageVersion: release.version };
}

function installer(channel: Channel, release: DistributionRelease): Manifest {
  return {
    ...header(channel, release),
    // electron-builder's assisted NSIS installer, per user unless asked otherwise.
    InstallerType: 'nullsoft',
    Scope: 'user',
    UpgradeBehavior: 'install',
    Protocols: ['whatsapp', 'yapyap'],
    Installers: ARCHES.map(([arch, suffix]) => {
      const file = download(release, suffix);
      return {
        Architecture: arch,
        InstallerUrl: file.url,
        InstallerSha256: file.sha256.toUpperCase(),
      };
    }),
    ManifestType: 'installer',
    ManifestVersion: MANIFEST_VERSION,
  };
}

function defaultLocale(channel: Channel, release: DistributionRelease): Manifest {
  const beta = channel === 'beta';
  return {
    ...header(channel, release),
    PackageLocale: LOCALE,
    Publisher: ABOUT.author,
    PublisherUrl: 'https://github.com/vascoguita',
    PublisherSupportUrl: 'https://github.com/vascoguita/yapyap/issues',
    PrivacyUrl: 'https://yapyap.guita.org/privacy',
    Author: ABOUT.author,
    PackageName: beta ? `${ABOUT.name} Beta` : ABOUT.name,
    PackageUrl: ABOUT.homepage,
    License: ABOUT.license,
    LicenseUrl: 'https://github.com/vascoguita/yapyap/blob/master/LICENSE',
    ShortDescription: ABOUT.summary,
    Description: beta
      ? 'Betas and releases of YapYap, an unofficial desktop client for WhatsApp Web. ' +
        'Each beta comes before a release, so testers can catch problems first.'
      : 'YapYap is an unofficial desktop client for WhatsApp Web, with isolated accounts, ' +
        'native notifications, a tray icon and recovery tools. ' +
        'It is not affiliated with WhatsApp or Meta.',
    // A moniker names one package, so only the release channel takes it.
    ...(beta ? {} : { Moniker: 'yapyap' }),
    Tags: ['chat', 'electron', 'messaging', 'whatsapp'],
    ReleaseNotesUrl: releaseNotesUrl(release.version),
    ManifestType: 'defaultLocale',
    ManifestVersion: MANIFEST_VERSION,
  };
}

function version(channel: Channel, release: DistributionRelease): Manifest {
  return {
    ...header(channel, release),
    DefaultLocale: LOCALE,
    ManifestType: 'version',
    ManifestVersion: MANIFEST_VERSION,
  };
}

const MANIFESTS = [
  ['installer', '.installer.yaml', installer],
  ['defaultLocale', `.locale.${LOCALE}.yaml`, defaultLocale],
  ['version', '.yaml', version],
] as const;

/**
 * The winget manifests of a release, by `<package>/<file>`: one folder for
 * each package the release updates in winget-pkgs. Each is checked against
 * winget's schema first.
 */
export function wingetFiles(release: DistributionRelease): Record<string, string> {
  return Object.fromEntries(
    channelsOf(release.version).flatMap((channel) =>
      MANIFESTS.map(([type, suffix, build]) => {
        const manifest = build(channel, release);
        checkSchema(`winget-${type}-${MANIFEST_VERSION}.json`, manifest);
        return [`${IDS[channel]}/${IDS[channel]}${suffix}`, toYaml(type, manifest)];
      }),
    ),
  );
}
