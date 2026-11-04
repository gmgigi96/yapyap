import { RELEASE_DOWNLOADS, REPOSITORY } from './releases.ts';

type AurArch = 'x86_64' | 'aarch64';

/** A file the PKGBUILD downloads, with the checksum makepkg verifies. */
interface AurSource {
  readonly fileName: string;
  readonly sha256: string;
}

export interface AurRelease {
  readonly version: string;
  readonly licenseSha256: string;
  readonly debs: Readonly<Record<AurArch, AurSource>>;
}

const PKGNAME = 'yapyap-bin';
const ARCHES: readonly AurArch[] = ['x86_64', 'aarch64'];
const SOURCES = `https://raw.githubusercontent.com/${REPOSITORY}/v`;
const LISTS = ['license', 'depends', 'provides', 'conflicts', 'options'] as const;
const FIELDS = {
  pkgdesc: 'Desktop client for WhatsApp Web (unofficial)',
  url: 'https://yapyap.guita.org/',
  license: ['MIT'],
  depends: ['alsa-lib', 'gtk3', 'libsecret', 'nss', 'xdg-utils'],
  provides: ['yapyap'],
  conflicts: ['yapyap'],
  // Electron binaries are already stripped, and a debug split would be empty.
  options: ['!strip', '!debug'],
} as const;

const SHA256 = /^[0-9a-f]{64}$/;
const VERSION = /^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/;

/**
 * The pacman version of a release: makepkg allows no '-', and pacman sorts
 * `1.0.0beta.1` before `1.0.0`, as a pre-release should be (#350).
 */
export const pkgverOf = (version: string): string => version.replace('-', '');
const FILE_NAME = /^[\w.-]+$/;

function validate(release: AurRelease): void {
  if (!VERSION.test(release.version)) {
    throw new Error(`Not a release version: ${release.version}`);
  }
  const checksums = [release.licenseSha256, ...ARCHES.map((arch) => release.debs[arch].sha256)];
  for (const checksum of checksums) {
    if (!SHA256.test(checksum)) {
      throw new Error(`Not a SHA-256 checksum: ${checksum}`);
    }
  }
  for (const { fileName } of ARCHES.map((arch) => release.debs[arch])) {
    if (!FILE_NAME.test(fileName)) {
      throw new Error(`Unsafe file name: ${fileName}`);
    }
  }
}

function licenseUrl(release: AurRelease): string {
  return `yapyap-${pkgverOf(release.version)}-LICENSE::${SOURCES}${release.version}/LICENSE`;
}

function debUrl(release: AurRelease, arch: AurArch): string {
  const { fileName } = release.debs[arch];
  return `${fileName}::${RELEASE_DOWNLOADS}/v${release.version}/${fileName}`;
}

function quoted(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(' ');
}

const PACKAGE_FUNCTION = [
  'package() {',
  '  bsdtar -xf data.tar.* -C "$pkgdir"',
  // The .deb carries the build machine's umask, which can leave files group-writable.
  '  chmod -R go-w "$pkgdir"',
  // The Debian maintainer scripts that would do this never run on Arch.
  '  chmod 4755 "$pkgdir/opt/YapYap/chrome-sandbox"',
  '  install -d "$pkgdir/usr/bin"',
  '  ln -s /opt/YapYap/yapyap "$pkgdir/usr/bin/yapyap"',
  `  install -Dm644 "yapyap-$pkgver-LICENSE" "$pkgdir/usr/share/licenses/${PKGNAME}/LICENSE"`,
  '}',
];

/** The PKGBUILD for `yapyap-bin`, which repackages the release's Debian packages. */
export function pkgbuild(release: AurRelease): string {
  validate(release);
  const lines = [
    '# Maintainer: Vasco Guita <https://github.com/vascoguita>',
    `pkgname=${PKGNAME}`,
    `pkgver=${pkgverOf(release.version)}`,
    'pkgrel=1',
    `pkgdesc='${FIELDS.pkgdesc}'`,
    `arch=(${quoted(ARCHES)})`,
    `url='${FIELDS.url}'`,
    ...LISTS.map((field) => `${field}=(${quoted(FIELDS[field])})`),
    `source=('${licenseUrl(release)}')`,
    `sha256sums=('${release.licenseSha256}')`,
    ...ARCHES.flatMap((arch) => [
      `source_${arch}=('${debUrl(release, arch)}')`,
      `sha256sums_${arch}=('${release.debs[arch].sha256}')`,
    ]),
    '',
    ...PACKAGE_FUNCTION,
  ];
  return `${lines.join('\n')}\n`;
}

/** The `.SRCINFO` the AUR reads, matching `makepkg --printsrcinfo` for {@link pkgbuild}. */
export function srcinfo(release: AurRelease): string {
  validate(release);
  const fields: (readonly [string, string])[] = [
    ['pkgdesc', FIELDS.pkgdesc],
    ['pkgver', pkgverOf(release.version)],
    ['pkgrel', '1'],
    ['url', FIELDS.url],
    ...ARCHES.map((arch) => ['arch', arch] as const),
    ...LISTS.flatMap((field) => FIELDS[field].map((value) => [field, value] as const)),
    ['source', licenseUrl(release)],
    ['sha256sums', release.licenseSha256],
    ...ARCHES.flatMap((arch) => [
      [`source_${arch}`, debUrl(release, arch)] as const,
      [`sha256sums_${arch}`, release.debs[arch].sha256] as const,
    ]),
  ];
  const body = fields.map(([key, value]) => `\t${key} = ${value}`).join('\n');
  return `pkgbase = ${PKGNAME}\n${body}\n\npkgname = ${PKGNAME}\n`;
}
