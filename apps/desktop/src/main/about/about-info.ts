import type { AboutInfo } from '../../shared/api/chrome-api.ts';
import { PRODUCT_NAME } from '../identity/product.ts';

export interface RuntimeFacts {
  readonly version: string;
  readonly channel: string;
  readonly versions: {
    readonly electron?: string;
    readonly chrome?: string;
    readonly node: string;
  };
  readonly platform: string;
  readonly release: string;
  readonly arch: string;
  readonly graphics: string;
}

export function buildAboutInfo(facts: RuntimeFacts): AboutInfo {
  return {
    name: PRODUCT_NAME,
    version: facts.version,
    channel: facts.channel,
    electron: facts.versions.electron ?? 'unknown',
    chromium: facts.versions.chrome ?? 'unknown',
    node: facts.versions.node,
    os: `${facts.platform} ${facts.release} (${facts.arch})`,
    license: 'MIT',
    graphics: facts.graphics,
  };
}

/** Plain text for bug reports. It holds no account or personal data. */
export function formatTechnicalDetails(info: AboutInfo): string {
  return [
    `${info.name} ${info.version} (${info.channel})`,
    `Electron ${info.electron}`,
    `Chromium ${info.chromium}`,
    `Node.js ${info.node}`,
    `OS ${info.os}`,
    `Graphics ${info.graphics}`,
  ].join('\n');
}

/**
 * Packaging stamps the install channel into the app's package.json (ADR
 * 0003). Builds run from source have no channel, and may have no
 * package.json next to the app at all.
 */
export function readInstallChannel(readPackageJson: () => string): string {
  let channel: unknown;
  try {
    channel = (Object(JSON.parse(readPackageJson())) as { installChannel?: unknown })
      .installChannel;
  } catch {
    channel = undefined;
  }
  return typeof channel === 'string' && channel !== '' ? channel : 'development';
}

/** The GPU features that explain most rendering problems, in a fixed order. */
const GPU_FEATURES = ['gpu_compositing', 'rasterization', 'video_decode', 'webgl'] as const;

export function summarizeGpu(status: Readonly<Record<string, string>>): string {
  return GPU_FEATURES.map((feature) => `${feature}=${status[feature] ?? 'unknown'}`).join(', ');
}

/**
 * Everything a bug report needs: the technical details, the lines that
 * describe this run (GPU, updates, the WhatsApp page), and the recent log
 * lines, which are redacted when they are written.
 */
export function formatDiagnostics(
  info: AboutInfo,
  runtime: readonly string[],
  recentLog: readonly string[],
): string {
  const log = recentLog.length === 0 ? ['(empty)'] : recentLog;
  return [formatTechnicalDetails(info), ...runtime, '', 'Recent log:', ...log].join('\n');
}
