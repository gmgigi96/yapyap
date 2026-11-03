import { RELEASE_DOWNLOADS } from './releases.ts';

/** A GitHub release, as the repository indexes need it. */
export interface RepositoryRelease {
  readonly tag: string;
  readonly prerelease: boolean;
  readonly draft: boolean;
  /** The names of the release's files. */
  readonly assets: readonly string[];
}

export type Channel = 'stable' | 'beta';

export const CHANNELS: readonly Channel[] = ['stable', 'beta'];

/** The releases each channel lists, newest first. */
type Listed = Readonly<Record<Channel, readonly RepositoryRelease[]>>;

/** Where the repositories are served, and where their packages really live. */
const REPOSITORY_URL = 'https://packages.guita.org';

/** How many versions each channel lists, so users can still pin or roll back. */
const KEPT_VERSIONS = 5;

const PACKAGE = /^[\w.~-]+\.(deb|rpm|pkg\.tar\.zst)$/;
const PACMAN = '.pkg.tar.zst';
const TAG = /^v\d+\.\d+\.\d+(-[\w.]+)?$/;

/** A package file and the release it belongs to. */
export interface PoolFile {
  readonly tag: string;
  readonly file: string;
}

/**
 * The releases each channel lists, newest first: stable lists releases
 * alone, and beta lists betas and releases alike, so a beta user moves to
 * the release once it is newer. `releases` come newest first, as GitHub
 * lists them. Drafts, releases without Linux packages, and tags or file
 * names that could reach outside the pool are left out.
 */
export function channels(releases: readonly RepositoryRelease[], kept = KEPT_VERSIONS): Listed {
  const usable = releases
    .filter((release) => !release.draft && TAG.test(release.tag))
    .map((release) => ({ ...release, assets: release.assets.filter((name) => PACKAGE.test(name)) }))
    .filter((release) => release.assets.length > 0);
  return {
    stable: usable.filter((release) => !release.prerelease).slice(0, kept),
    beta: usable.slice(0, kept),
  };
}

/** Every package file either channel lists, once each. */
export function poolFiles(listed: Listed): PoolFile[] {
  const seen = new Map<string, PoolFile>();
  for (const release of [...listed.stable, ...listed.beta]) {
    for (const file of release.assets) {
      seen.set(`${release.tag}/${file}`, { tag: release.tag, file });
    }
  }
  return [...seen.values()];
}

/**
 * Cloudflare Pages redirects: the site holds only the signed indexes, and
 * every package download goes to GitHub Releases, where it is counted.
 * Pages applies redirects before its own files, so pacman packages, which
 * share a folder with the database and signatures, get a rule each (#350).
 */
export function redirects(listed: Listed): string {
  const target = `${RELEASE_DOWNLOADS}/:tag/:file 302`;
  const pacman = CHANNELS.flatMap((channel) =>
    listed[channel].flatMap(({ tag, assets }) =>
      assets
        .filter((file) => file.endsWith(PACMAN))
        .map((file) => `/arch/${channel}/x86_64/${file} ${RELEASE_DOWNLOADS}/${tag}/${file} 302`),
    ),
  );
  return [
    `/pool/:tag/:file ${target}`,
    ...CHANNELS.map((channel) => `/rpm/${channel}/pool/:tag/:file ${target}`),
    ...pacman,
    '',
  ].join('\n');
}

/** The apt source a user installs for `channel`, in deb822 form. */
export function aptSource(channel: Channel): string {
  return [
    'Types: deb',
    `URIs: ${REPOSITORY_URL}`,
    `Suites: ${channel}`,
    'Components: main',
    'Signed-By: /etc/apt/keyrings/yapyap.gpg',
    '',
  ].join('\n');
}

/**
 * The dnf repository file for `channel`. The packages are not signed
 * themselves; the signed metadata holds each one's checksum, which dnf
 * checks before installing. Fedora skips a repository whose metadata fails
 * its signature check without saying so, so this one asks dnf to stop.
 */
export function dnfRepository(channel: Channel): string {
  const id = channel === 'stable' ? 'yapyap' : 'yapyap-beta';
  const name = channel === 'stable' ? 'YapYap' : 'YapYap (beta)';
  return [
    `[${id}]`,
    `name=${name}`,
    `baseurl=${REPOSITORY_URL}/rpm/${channel}`,
    'enabled=1',
    'gpgcheck=0',
    'repo_gpgcheck=1',
    'skip_if_unavailable=0',
    `gpgkey=${REPOSITORY_URL}/yapyap.asc`,
    '',
  ].join('\n');
}

interface GitHubRelease {
  readonly tag_name: string;
  readonly prerelease: boolean;
  readonly draft: boolean;
  readonly assets: readonly { readonly name: string }[];
}

const hasNames = (assets: unknown): boolean =>
  Array.isArray(assets) &&
  assets.every((asset: unknown) => typeof (asset as { name?: unknown }).name === 'string');

const isGitHubRelease = (value: unknown): value is GitHubRelease => {
  const candidate = value as Partial<GitHubRelease> | null;
  const flags = typeof candidate?.prerelease === 'boolean' && typeof candidate.draft === 'boolean';
  return typeof candidate?.tag_name === 'string' && flags && hasNames(candidate.assets);
};

/** The releases in GitHub's REST answer, which must have the shape the indexes rely on. */
export function fromGitHub(answer: unknown): RepositoryRelease[] {
  if (!Array.isArray(answer) || !answer.every(isGitHubRelease)) {
    throw new Error('Not a list of GitHub releases.');
  }
  return answer.map((entry) => ({
    tag: entry.tag_name,
    prerelease: entry.prerelease,
    draft: entry.draft,
    assets: entry.assets.map((asset) => asset.name),
  }));
}

/**
 * The pacman.conf section for `channel`. pacman accepts an unsigned database
 * by default, which would let a stale one keep users on an old version, so
 * this one requires signatures on both.
 */
export function pacmanSection(channel: Channel): string {
  return [
    '[yapyap]',
    'SigLevel = Required',
    `Server = ${REPOSITORY_URL}/arch/${channel}/$arch`,
    '',
  ].join('\n');
}
