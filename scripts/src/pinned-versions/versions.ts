import { compareVersions } from '../../../apps/desktop/src/main/updates/version.ts';

export interface NodeRelease {
  readonly version: string;
  readonly lts: string | false;
}

function latest(versions: readonly string[]): string | undefined {
  return [...versions].sort(compareVersions).at(-1);
}

/** The newest release of the newest LTS line is the current Active LTS. */
export function latestNodeLts(index: readonly NodeRelease[]): string | undefined {
  const lts = index.filter((release) => release.lts !== false).map((release) => release.version);
  return latest(lts)?.replace(/^v/, '');
}

export function latestBaseAppBranch(branches: readonly string[]): string | undefined {
  const stable = branches.flatMap((name) => /^branch\/(\d{2}\.\d{2})$/.exec(name)?.slice(1) ?? []);
  return latest(stable);
}
