import { globSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inMutationScope, MUTATION_SCOPE, mutationShard, mutationTargets } from './scope.ts';

describe('inMutationScope', () => {
  it.each([
    'apps/desktop/src/adapter/selectors/v1.ts',
    'apps/desktop/src/main/permissions/session-guard.ts',
    'apps/desktop/src/main/settings/decode.ts',
    'apps/desktop/src/main/settings/store.ts',
    'apps/desktop/src/main/whatsapp-origin.ts',
    'scripts/src/release/aur.ts',
    'apps/desktop/src/main/assistant/providers/anthropic.ts',
    'apps\\desktop\\src\\adapter\\unread.ts',
  ])('includes %s', (path) => {
    expect(inMutationScope(path)).toBe(true);
  });

  it.each([
    'apps/desktop/src/adapter/unread.test.ts',
    'apps/desktop/src/main/start.ts',
    'scripts/src/bin/aur.ts',
    'apps/desktop/src/shared/global.d.ts',
    'README.md',
  ])('excludes %s', (path) => {
    expect(inMutationScope(path)).toBe(false);
  });

  it('names only modules that exist, so a moved one cannot leave the gate unnoticed', () => {
    const root = join(import.meta.dirname, '..', '..', '..');
    expect(MUTATION_SCOPE.filter((glob) => globSync(glob, { cwd: root }).length === 0)).toEqual([]);
  });

  it('covers every module family named in the test-strategy ADR', () => {
    expect(MUTATION_SCOPE).toEqual(
      expect.arrayContaining([
        expect.stringContaining('adapter'),
        expect.stringContaining('permissions'),
        expect.stringContaining('settings'),
        expect.stringContaining('providers'),
      ]),
    );
  });
});

describe('mutationTargets', () => {
  it('keeps unique, trimmed, in-scope files in order', () => {
    expect(
      mutationTargets([
        'scripts/src/licenses/check.ts',
        ' apps/desktop/src/main/whatsapp-origin.ts ',
        '',
        'docs/index.md',
        'scripts/src/licenses/check.ts',
      ]),
    ).toEqual(['scripts/src/licenses/check.ts', 'apps/desktop/src/main/whatsapp-origin.ts']);
  });
});

describe('mutationShard', () => {
  const files = [
    'apps/desktop/src/main/settings/store.ts',
    'apps/desktop/src/adapter/composer.ts',
    'apps/desktop/src/adapter/composer.test.ts',
    'apps/desktop/src/main/start.ts',
    'apps/desktop/src/adapter/page-state.ts',
    'scripts/src/release/aur.ts',
    'docs/index.md',
  ];

  it('deals the in-scope modules out in turn, so every one lands in exactly one shard', () => {
    expect(mutationShard(files, 1, 2)).toEqual([
      'apps/desktop/src/adapter/composer.ts',
      'apps/desktop/src/main/settings/store.ts',
    ]);
    expect(mutationShard(files, 2, 2)).toEqual([
      'apps/desktop/src/adapter/page-state.ts',
      'scripts/src/release/aur.ts',
    ]);
    expect(mutationShard(files, 1, 1)).toHaveLength(4);
  });

  it.each([
    [0, 2],
    [3, 2],
    [1, 0],
    [1.5, 2],
    [1, Number.NaN],
  ])('refuses shard %d of %d', (shard, shards) => {
    expect(() => mutationShard(files, shard, shards)).toThrow('No shard');
  });
});
