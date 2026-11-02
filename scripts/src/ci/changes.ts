import { matchesGlob } from 'node:path';

/** How much packaging a pull request runs (ADR 0007). */
type PackagingScope = 'none' | 'representative' | 'full';

export interface ChangeScope {
  /** Whether anything but documentation changed, so tests and builds must run. */
  readonly code: boolean;
  readonly packaging: PackagingScope;
}

/** Files that change no code, build or test: lint and the docs build still check them. */
const DOCUMENTATION = [
  '**/*.md',
  'docs/**',
  // The docs site's own config; the docs workflow builds it.
  'docs/.vitepress/**',
  '.github/ISSUE_TEMPLATE/**',
  'LICENSE',
];

/**
 * Files that can change how YapYap is packaged, on any format or
 * architecture: these run the full packaging and smoke matrix.
 */
const PACKAGING = [
  '**/package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.nvmrc',
  'apps/desktop/electron-builder.yml',
  'apps/desktop/build/**',
  'packaging/**',
  'scripts/src/packaging/**',
  'scripts/src/release/**',
  'scripts/src/bin/aur.ts',
  'scripts/src/bin/distribution.ts',
  'scripts/src/bin/stamp-metainfo.ts',
  'scripts/src/bin/verify-fuses.ts',
  '.github/workflows/package.yml',
  '.github/workflows/smoke.yml',
  '.github/workflows/release.yml',
  '.github/workflows/beta.yml',
  '.github/workflows/distribute.yml',
  // The setup every packaging and smoke job runs.
  '.github/actions/**',
];

function matchesAny(file: string, globs: readonly string[]): boolean {
  return globs.some((glob) => matchesGlob(file, glob));
}

/** What a pull request that changes `changedFiles` must check. */
export function changeScope(changedFiles: readonly string[]): ChangeScope {
  const files = changedFiles
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter((file) => file !== '');
  // Nothing to compare against means nothing can be skipped safely.
  if (files.length === 0) {
    return { code: true, packaging: 'full' };
  }
  const code = files.some((file) => !matchesAny(file, DOCUMENTATION));
  if (files.some((file) => matchesAny(file, PACKAGING))) {
    return { code, packaging: 'full' };
  }
  return { code, packaging: code ? 'representative' : 'none' };
}
