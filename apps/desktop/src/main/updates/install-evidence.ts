import type { Environment } from '../support/environment.ts';
import { isDeveloperIdSigned, type InstallEvidence } from './update-policy.ts';

export interface EvidenceSources {
  readonly platform: string;
  readonly env: Environment;
  readonly exists: (path: string) => boolean;
  /** What `codesign -dv` prints about the app bundle; it writes to stderr. */
  readonly codesign: () => string;
}

function signedByDeveloperId(codesign: () => string): boolean {
  try {
    return isDeveloperIdSigned(codesign());
  } catch {
    return false;
  }
}

/** Gathers the evidence; `codesign` runs only on macOS, where it exists. */
export function readInstallEvidence(sources: EvidenceSources): InstallEvidence {
  return {
    platform: sources.platform,
    env: sources.env,
    flatpakInfo: sources.exists('/.flatpak-info'),
    developerIdSigned: sources.platform === 'darwin' && signedByDeveloperId(sources.codesign),
  };
}
