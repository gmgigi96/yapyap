import { globSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { TestProjectInlineConfiguration } from 'vitest/config';

/** Every workspace package with tests: its unit tests sit next to the code in `src/`. */
const ROOTS = ['apps/*', 'scripts'];
const TESTS = ['src/**/*.test.ts', 'src/**/*.test.tsx'];

/** Every test file, from the repository root. */
export const TEST_INCLUDE = ROOTS.flatMap((root) => TESTS.map((tests) => `${root}/${tests}`));

/**
 * Packages whose tests mock no modules, stub no globals and use no DOM, and
 * whose modules keep no state, so their files can share workers rather than
 * each paying about a second to start one. The desktop app's tests mock
 * `electron` and set up `window.yapyap`, so they keep a worker per file.
 */
const SHARED_WORKERS = new Set(['scripts']);

/**
 * One Vitest project per package, named as before. Renderer tests opt into
 * happy-dom with a comment at their top, which the flat mutation config also
 * honours.
 */
export function testProjects(): TestProjectInlineConfiguration[] {
  return globSync(ROOTS.map((root) => `${root}/src`))
    .map((source) => dirname(source).replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right))
    .map((root) => {
      const name = basename(root);
      return {
        test: {
          root,
          name,
          include: TESTS,
          environment: 'node',
          isolate: !SHARED_WORKERS.has(name),
        },
      };
    });
}
