import { describe, expect, it } from 'vitest';
import { changeScope } from './changes.ts';

describe('changeScope', () => {
  it('skips tests and packaging when only documentation changed', () => {
    expect(
      changeScope(['README.md', 'docs/guide/index.md', 'docs/.vitepress/config.ts', 'LICENSE']),
    ).toEqual({ code: false, packaging: 'none' });
    expect(changeScope(['.github/ISSUE_TEMPLATE/bug_report.yml', 'CLAUDE.md'])).toEqual({
      code: false,
      packaging: 'none',
    });
  });

  it('runs tests and one package per system when code changed', () => {
    expect(changeScope(['docs/progress.md', 'apps/desktop/src/main/start.ts'])).toEqual({
      code: true,
      packaging: 'representative',
    });
    expect(changeScope(['.github/workflows/ci.yml']).packaging).toBe('representative');
    expect(changeScope(['apps/desktop/test/fake-whatsapp/index.html']).code).toBe(true);
  });

  it.each([
    'package.json',
    'apps/desktop/package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.nvmrc',
    'apps/desktop/electron-builder.yml',
    'apps/desktop/build/icon.svg',
    'packaging/flatpak/org.guita.YapYap.yml',
    'scripts/src/packaging/targets.ts',
    'scripts/src/release/aur.ts',
    'scripts/src/bin/verify-fuses.ts',
    'scripts/src/bin/distribution.ts',
    '.github/workflows/distribute.yml',
    '.github/workflows/smoke.yml',
    '.github/actions/setup/action.yml',
  ])('runs the full packaging matrix when %s changed', (file) => {
    expect(changeScope(['apps/desktop/src/main/start.ts', file])).toEqual({
      code: true,
      packaging: 'full',
    });
  });

  it('counts a documentation-only packaging file as no code, yet packages fully', () => {
    expect(changeScope(['packaging/README.md'])).toEqual({ code: false, packaging: 'full' });
  });

  it('normalizes Windows separators and ignores blank lines', () => {
    expect(changeScope(['', ' docs\\guide\\index.md ', '\n'])).toEqual({
      code: false,
      packaging: 'none',
    });
  });

  it('checks everything when there is nothing to compare', () => {
    expect(changeScope([])).toEqual({ code: true, packaging: 'full' });
    expect(changeScope(['', '  '])).toEqual({ code: true, packaging: 'full' });
  });
});
