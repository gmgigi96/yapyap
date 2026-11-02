import { describe, expect, it } from 'vitest';
import { parseRelease } from './distribution.ts';
import { scoopFiles } from './scoop.ts';

const X64 = 'a'.repeat(64);
const ARM64 = 'b'.repeat(64);
const DOWNLOADS = 'https://github.com/vascoguita/yapyap/releases/download';
const release = (version: string) =>
  parseRelease(
    version,
    `${X64}  YapYap-${version}-win-x64-portable.exe\n${ARM64}  YapYap-${version}-win-arm64-portable.exe\n`,
  );

const manifest = (version: string, description: string, shortcut: string) => ({
  version,
  description,
  homepage: 'https://yapyap.guita.org/',
  license: 'MIT',
  architecture: {
    '64bit': {
      url: `${DOWNLOADS}/v${version}/YapYap-${version}-win-x64-portable.exe#/YapYap.exe`,
      hash: X64,
    },
    arm64: {
      url: `${DOWNLOADS}/v${version}/YapYap-${version}-win-arm64-portable.exe#/YapYap.exe`,
      hash: ARM64,
    },
  },
  shortcuts: [['YapYap.exe', shortcut]],
});

describe('scoopFiles', () => {
  it('updates both apps for a release, with the portable builds', () => {
    const files = scoopFiles(release('10.20.30'));
    expect(Object.keys(files)).toEqual(['bucket/yapyap.json', 'bucket/yapyap-beta.json']);
    expect(JSON.parse(String(files['bucket/yapyap.json']))).toEqual(
      manifest('10.20.30', 'Unofficial desktop client for WhatsApp Web', 'YapYap'),
    );
    expect(files['bucket/yapyap.json']).toMatch(/^\{\n {4}"version": "10\.20\.30",\n[^]*\}\n$/);
  });

  it('updates only the beta app for a beta', () => {
    const files = scoopFiles(release('10.20.31-beta.1'));
    expect(Object.keys(files)).toEqual(['bucket/yapyap-beta.json']);
    expect(JSON.parse(String(files['bucket/yapyap-beta.json']))).toEqual(
      manifest(
        '10.20.31-beta.1',
        'Unofficial desktop client for WhatsApp Web: betas, then each release',
        'YapYap Beta',
      ),
    );
  });

  it('refuses a release without both portable builds', () => {
    const x64Only = parseRelease('10.20.30', `${X64}  YapYap-10.20.30-win-x64-portable.exe\n`);
    expect(() => scoopFiles(x64Only)).toThrow(
      'SHA256SUMS lists no YapYap-10.20.30-win-arm64-portable.exe',
    );
  });
});
