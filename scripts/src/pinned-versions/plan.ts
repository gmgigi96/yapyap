import { compareVersions } from '../../../apps/desktop/src/main/updates/version.ts';

export const NVMRC = '.nvmrc';
export const ROOT_PACKAGE = 'package.json';
export const FLATPAK_MANIFEST = 'packaging/flatpak/org.guita.YapYap.yml';

export interface FileChange {
  readonly path: string;
  readonly contents: string;
}

export interface Plan {
  readonly files: readonly FileChange[];
  readonly summaries: readonly string[];
}

const EMPTY: Plan = { files: [], summaries: [] };
const ENGINES = /("node":\s*")>=[^"]+(")/;
const RUNTIME = /^(runtime-version:\s*')(\d{2}\.\d{2})(')$/m;
const BASE = /^(base-version:\s*')(\d{2}\.\d{2})(')$/m;

function isNewer(latest: string | undefined, current: string): latest is string {
  return latest !== undefined && compareVersions(latest, current) > 0;
}

export function planNode(
  nvmrc: string | undefined,
  rootPackage: string,
  latest: string | undefined,
): Plan {
  const current = nvmrc?.trim();
  if (current === undefined || !isNewer(latest, current)) {
    return EMPTY;
  }
  return {
    files: [
      { path: NVMRC, contents: `${latest}\n` },
      { path: ROOT_PACKAGE, contents: rootPackage.replace(ENGINES, `$1>=${latest}$2`) },
    ],
    summaries: [`Node.js LTS ${current} → ${latest}`],
  };
}

export function planFlatpak(manifest: string | undefined, latest: string | undefined): Plan {
  const current = manifest === undefined ? undefined : RUNTIME.exec(manifest)?.[2];
  if (manifest === undefined || current === undefined || !isNewer(latest, current)) {
    return EMPTY;
  }
  const contents = manifest.replace(RUNTIME, `$1${latest}$3`).replace(BASE, `$1${latest}$3`);
  return {
    files: [{ path: FLATPAK_MANIFEST, contents }],
    summaries: [`Flatpak runtime and Electron BaseApp ${current} → ${latest}`],
  };
}

export function mergePlans(...plans: readonly Plan[]): Plan {
  return {
    files: plans.flatMap((plan) => plan.files),
    summaries: plans.flatMap((plan) => plan.summaries),
  };
}
