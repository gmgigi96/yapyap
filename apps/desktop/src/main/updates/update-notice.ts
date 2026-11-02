import { compareVersions } from './version.ts';
import type { UpdatePolicy } from './update-policy.ts';
import { en } from '../../shared/messages/en.ts';

/** GitHub's latest stable release; drafts and pre-releases never appear here. */
export const LATEST_RELEASE_API = 'https://api.github.com/repos/vascoguita/yapyap/releases/latest';
/** The newest releases, betas included, for testers who asked for them (#184). */
export const RECENT_RELEASES_API =
  'https://api.github.com/repos/vascoguita/yapyap/releases?per_page=20';
/** Once a day is enough to learn about a release without polling GitHub. */
export const NOTICE_INTERVAL_MS = 86_400_000;

const RELEASE_PAGE = 'https://github.com/vascoguita/yapyap/releases/tag/';
/**
 * The only tags YapYap publishes: three short numbers, and a prerelease for a
 * beta. Anything else in an answer from the network is not trusted as a version.
 */
const VERSION = /^v?\d{1,5}\.\d{1,5}\.\d{1,5}(?<pre>-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Whether `text` is a beta's version; undefined when it is no version YapYap publishes. */
function isPrerelease(text: string): boolean | undefined {
  const parts = VERSION.exec(text)?.groups;
  return parts === undefined ? undefined : parts['pre'] !== undefined;
}

/**
 * Whether `candidate` is a later version than `current`: a release beats
 * its own betas, and a later beta of a release beats an earlier one.
 */
export function isNewer(candidate: string, current: string): boolean {
  const known = isPrerelease(candidate) !== undefined && isPrerelease(current) !== undefined;
  return known && compareVersions(candidate, current) > 0;
}

export interface ReleaseNotice {
  readonly version: string;
  /** The release page on GitHub, built here rather than taken from the response. */
  readonly url: string;
}

/**
 * Reads one release from GitHub's answer, trusting only a plain version tag,
 * and a beta tag only when `betas` is on.
 */
function parseRelease(value: unknown, betas: boolean): ReleaseNotice | undefined {
  const { tag_name: tag, draft, prerelease } = Object(value) as Record<string, unknown>;
  if (typeof tag !== 'string' || draft !== false || typeof prerelease !== 'boolean') {
    return undefined;
  }
  const version = tag.replace(/^v/, '');
  if (isPrerelease(version) !== prerelease || (prerelease && !betas)) {
    return undefined;
  }
  return { version, url: `${RELEASE_PAGE}v${version}` };
}

/** Reads GitHub's latest release, which must be stable. */
export function parseLatestRelease(value: unknown): ReleaseNotice | undefined {
  return parseRelease(value, false);
}

/** The newest release in GitHub's list of recent ones, betas included. */
export function newestRelease(value: unknown): ReleaseNotice | undefined {
  const releases = Array.isArray(value) ? (value as unknown[]) : [];
  return releases
    .map((release) => parseRelease(release, true))
    .reduce<ReleaseNotice | undefined>(
      (newest, release) =>
        release !== undefined && (newest === undefined || isNewer(release.version, newest.version))
          ? release
          : newest,
      undefined,
    );
}

/** Fetches JSON, treating any status but success as a failure. */
export function releaseFetcher(
  fetch: (url: string, init: { headers: Record<string, string> }) => Promise<Response>,
): (url: string) => Promise<unknown> {
  return async (url) => {
    const response = await fetch(url, { headers: { accept: 'application/vnd.github+json' } });
    if (!response.ok) {
      throw new Error(`GitHub answered ${String(response.status)}.`);
    }
    return response.json();
  };
}

export interface UpdateNoticeDependencies {
  readonly policy: UpdatePolicy;
  readonly currentVersion: string;
  readonly fetchJson: (url: string) => Promise<unknown>;
  /** Whether the user asked for betas; read at every check, so a change applies at once. */
  readonly betas: () => boolean;
  readonly every: (callback: () => void, ms: number) => unknown;
  /** Tells the user, offering the release page; never downloads anything. */
  readonly showNotice: (message: string, url: string) => void;
  readonly warn: (message: string) => void;
}

/**
 * For builds that cannot update themselves but may tell the user about a
 * release (the portable build, unsigned macOS), checks GitHub's latest
 * release now and once a day. Every other policy makes no request at all.
 */
export function watchForReleases(deps: UpdateNoticeDependencies): void {
  if (deps.policy !== 'notify') {
    return;
  }
  let announced: string | undefined;
  const check = async (): Promise<void> => {
    const release = deps.betas()
      ? newestRelease(await deps.fetchJson(RECENT_RELEASES_API))
      : parseLatestRelease(await deps.fetchJson(LATEST_RELEASE_API));
    if (
      release !== undefined &&
      release.version !== announced &&
      isNewer(release.version, deps.currentVersion)
    ) {
      announced = release.version;
      deps.showNotice(en.notices.newRelease({ version: release.version }), release.url);
    }
  };
  const run = (): void => {
    check().catch(() => {
      deps.warn('Could not check for a new YapYap version.');
    });
  };
  run();
  deps.every(run, NOTICE_INTERVAL_MS);
}
