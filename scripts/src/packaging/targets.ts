type InstallChannel = 'appimage' | 'deb' | 'rpm' | 'nsis' | 'portable' | 'dmg';

export interface BuildJob {
  readonly channel: InstallChannel;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

const LINUX_ARCH: Readonly<Record<string, string>> = { x64: '--x64', arm64: '--arm64' };

// 7-Zip picks its ARM64 branch filter for arm64 executables, which the
// extractor inside NSIS installers and portable launchers cannot decode: it
// silently skips every .exe and .dll. The x86 filter is understood everywhere.
const WINDOWS_ENV: Readonly<Record<string, string>> = { ELECTRON_BUILDER_7Z_FILTER: 'BCJ' };

function job(
  channel: InstallChannel,
  platformArgs: readonly string[],
  env: Readonly<Record<string, string>> = {},
): BuildJob {
  // Each target is packaged separately so the build can stamp which install
  // channel it is; the update policy reads this marker at runtime (ADR 0003).
  return {
    channel,
    env,
    args: [...platformArgs, '--publish', 'never', `-c.extraMetadata.installChannel=${channel}`],
  };
}

/** The electron-builder invocations that produce every package format for this host. */
export function buildJobs(platform: string, arch: string): BuildJob[] {
  if (platform === 'linux') {
    const archFlag = LINUX_ARCH[arch];
    if (archFlag === undefined) {
      throw new Error(`Unsupported Linux architecture: ${arch}`);
    }
    return [
      job('appimage', ['--linux', 'AppImage', archFlag]),
      job('deb', ['--linux', 'deb', archFlag]),
      job('rpm', ['--linux', 'rpm', archFlag]),
    ];
  }
  if (platform === 'win32') {
    return [
      job('nsis', ['--win', 'nsis', '--x64', '--arm64'], WINDOWS_ENV),
      job('portable', ['--win', 'portable', '--x64', '--arm64'], WINDOWS_ENV),
    ];
  }
  if (platform === 'darwin') {
    return [job('dmg', ['--mac', 'dmg', 'zip', '--universal'])];
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
