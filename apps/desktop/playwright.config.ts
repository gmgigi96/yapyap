import { defineConfig } from '@playwright/test';

/**
 * Tests that mean nothing on some systems stay out of their runs here,
 * rather than skipping once they start: whole files by name, single tests by
 * tag (`@linux` runs only on Linux, `@not-macos` and `@not-windows` skip one
 * system).
 */
const LINUX_ONLY = [
  // Display backends exist only on Linux.
  'display.spec.ts',
  // The website's screenshots are taken on Linux, under Xvfb.
  'screenshots/**',
];
const MACOS_ONLY = [
  // Only macOS reads its badge back: Windows draws an overlay Electron cannot
  // return, and Linux keeps a count only under launchers that show one.
  'badge.spec.ts',
];
const NOT_ON_MACOS = [
  // macOS shows its own system picker for screen sharing.
  'picker.spec.ts',
  'share-indicator.spec.ts',
  // macOS always keeps YapYap in the Dock instead of the tray.
  'tray.spec.ts',
];
const elsewhere = [
  ...(process.platform === 'linux' ? [] : LINUX_ONLY),
  ...(process.platform === 'darwin' ? NOT_ON_MACOS : MACOS_ONLY),
];
const untagged = [
  ...(process.platform === 'linux' ? [] : [/@linux/]),
  ...(process.platform === 'darwin' ? [/@not-macos/] : []),
  ...(process.platform === 'win32' ? [/@not-windows/] : []),
];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  timeout: 60_000,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  // Fonts and native controls differ by OS, so each OS keeps its own baselines.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
    // As long as expect.poll waits, rather than the whole test's timeout.
    toPass: { timeout: 5_000 },
  },
  testIgnore: elsewhere,
  grepInvert: untagged,
  projects: [
    { name: 'e2e', testIgnore: ['smoke/**', 'bench/**', 'screenshots/**', ...elsewhere] },
    // Slow and machine-dependent, so it runs nightly rather than on every PR.
    { name: 'bench', testMatch: 'bench/**/*.spec.ts' },
    // Runs against an installed package; see YAPYAP_PACKAGED_EXECUTABLE.
    // YAPYAP_EXPECT_UNSAFE_START=1 marks a system that cannot give the package
    // its sandbox (an AppImage where user namespaces are restricted), where
    // only the test that expects the explanation runs.
    {
      name: 'smoke',
      testMatch: 'smoke/**/*.spec.ts',
      ...(process.env['YAPYAP_EXPECT_UNSAFE_START'] !== '1'
        ? { grepInvert: [...untagged, /@unsafe-start/] }
        : { grep: /@unsafe-start/ }),
    },
    // Takes the website's screenshots on the showcase page; run by `pnpm screenshots` (#384).
    { name: 'screenshots', testMatch: 'screenshots/**/*.spec.ts', testIgnore: elsewhere },
  ],
});
