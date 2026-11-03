import { defineConfig } from 'vitest/config';
import { TEST_INCLUDE } from './vitest.projects.ts';

// Stryker's command runner runs this single flat project over the same test
// files as the per-package projects, so that every suite gets one worker and
// the setup file below.
export default defineConfig({
  test: {
    include: TEST_INCLUDE,
    environment: 'node',
    setupFiles: ['vitest.mutation.setup.ts'],
    // Stryker already runs several suites at once; a worker pool inside each suite
    // oversubscribes the machine until mutants time out instead of failing.
    maxWorkers: 1,
  },
});
