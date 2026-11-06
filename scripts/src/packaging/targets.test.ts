import { describe, expect, it } from 'vitest';
import { buildJobs } from './targets.ts';

describe('buildJobs', () => {
  it('packages AppImage, DEB and RPM separately on Linux for the host architecture', () => {
    expect(buildJobs('linux', 'arm64')).toEqual([
      {
        channel: 'appimage',
        args: [
          '--linux',
          'AppImage',
          '--arm64',
          '--publish',
          'never',
          '-c.extraMetadata.installChannel=appimage',
        ],
        env: {},
      },
      {
        channel: 'deb',
        args: [
          '--linux',
          'deb',
          '--arm64',
          '--publish',
          'never',
          '-c.extraMetadata.installChannel=deb',
        ],
        env: {},
      },
      {
        channel: 'rpm',
        args: [
          '--linux',
          'rpm',
          '--arm64',
          '--publish',
          'never',
          '-c.extraMetadata.installChannel=rpm',
        ],
        env: {},
      },
    ]);
    expect(buildJobs('linux', 'x64')[0]?.args).toContain('--x64');
  });

  it('cross-builds the Windows installer and portable build for x64 and arm64 with an extractable filter', () => {
    expect(buildJobs('win32', 'x64')).toEqual([
      {
        channel: 'nsis',
        args: [
          '--win',
          'nsis',
          '--x64',
          '--arm64',
          '--publish',
          'never',
          '-c.extraMetadata.installChannel=nsis',
        ],
        env: { ELECTRON_BUILDER_7Z_FILTER: 'BCJ' },
      },
      {
        channel: 'portable',
        args: [
          '--win',
          'portable',
          '--x64',
          '--arm64',
          '--publish',
          'never',
          '-c.extraMetadata.installChannel=portable',
        ],
        env: { ELECTRON_BUILDER_7Z_FILTER: 'BCJ' },
      },
    ]);
  });

  it('builds a universal DMG and ZIP on macOS', () => {
    expect(buildJobs('darwin', 'arm64')).toEqual([
      {
        channel: 'dmg',
        args: [
          '--mac',
          'dmg',
          'zip',
          '--universal',
          '--publish',
          'never',
          '-c.extraMetadata.installChannel=dmg',
        ],
        env: {},
      },
    ]);
  });

  it('rejects unsupported hosts', () => {
    expect(() => buildJobs('linux', 'ia32')).toThrow('Unsupported Linux architecture: ia32');
    expect(() => buildJobs('freebsd', 'x64')).toThrow('Unsupported platform: freebsd');
  });
});
