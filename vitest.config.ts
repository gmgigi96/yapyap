import { defineConfig } from 'vitest/config';
import { testProjects } from './vitest.projects.ts';

export default defineConfig({
  test: {
    projects: testProjects(),
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'scripts/src/**/*.ts'],
      // Every exclusion must be justified in docs/adr/0005-test-strategy.md.
      exclude: [
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        'apps/desktop/src/main/index.ts',
        'apps/desktop/src/preload/*/index.ts',
        'scripts/src/bin/**',
      ],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
