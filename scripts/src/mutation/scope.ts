import { matchesGlob } from 'node:path';

/**
 * Modules whose tests must kill at least 90% of mutants (ADR 0005): the
 * WhatsApp adapter, settings and AI providers, plus other security-sensitive
 * parsers.
 */
export const MUTATION_SCOPE: readonly string[] = [
  'apps/desktop/src/adapter/**/*.ts',
  'apps/desktop/src/main/chrome/**/*.ts',
  'apps/desktop/src/main/identity/**/*.ts',
  'apps/desktop/src/main/logging/**/*.ts',
  'apps/desktop/src/main/navigation/**/*.ts',
  'apps/desktop/src/main/permissions/**/*.ts',
  'apps/desktop/src/main/recovery/**/*.ts',
  'apps/desktop/src/main/settings/**/*.ts',
  'apps/desktop/src/main/updates/**/*.ts',
  'apps/desktop/src/main/security.ts',
  'apps/desktop/src/main/web-contents-guards.ts',
  'apps/desktop/src/main/whatsapp-origin.ts',
  'apps/desktop/src/main/windows.ts',
  'apps/desktop/src/main/assistant/net.ts',
  'apps/desktop/src/main/assistant/providers/**/*.ts',
  'scripts/src/licenses/**/*.ts',
  'scripts/src/release/**/*.ts',
];

const NEVER_MUTATED = ['**/*.test.ts', '**/*.d.ts', '**/bin/**'];

export function inMutationScope(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    MUTATION_SCOPE.some((glob) => matchesGlob(normalized, glob)) &&
    !NEVER_MUTATED.some((glob) => matchesGlob(normalized, glob))
  );
}

/** Picks the changed files a pull request's mutation run must cover. */
export function mutationTargets(changedFiles: readonly string[]): string[] {
  return [
    ...new Set(
      changedFiles
        .map((file) => file.trim())
        .filter((file) => file !== '' && inMutationScope(file)),
    ),
  ];
}

/**
 * The in-scope files that shard `shard` of `shards` (counted from 1)
 * mutates in the nightly run. Files are dealt out in turn, sorted, so
 * neighbouring files from one busy folder land in different shards.
 */
export function mutationShard(files: readonly string[], shard: number, shards: number): string[] {
  const counted = (value: number) => Number.isInteger(value) && value >= 1;
  if (!counted(shards) || !counted(shard) || shard > shards) {
    throw new Error(`No shard ${String(shard)} of ${String(shards)}.`);
  }
  return mutationTargets(files)
    .filter((file) => file.endsWith('.ts'))
    .toSorted((a, b) => a.localeCompare(b))
    .filter((_, index) => index % shards === shard - 1);
}
