import { isSet, type Environment } from '../support/environment.ts';

/**
 * How YapYap may update itself (ADR 0003):
 * - `self-update`: download, verify and install new releases, with consent.
 * - `notify`: only say a new release exists, with a link.
 * - `system`: never check; the system package manager updates YapYap.
 * - `manual`: never check, because the build and what YapYap sees around it
 *   disagree; the user updates by hand.
 */
export type UpdatePolicy = 'self-update' | 'notify' | 'system' | 'manual';

export interface UpdateDecision {
  readonly channel: string;
  readonly policy: UpdatePolicy;
}

/** What YapYap can observe about how it was installed. */
export interface InstallEvidence {
  readonly platform: string;
  readonly env: Environment;
  /** `/.flatpak-info` exists, as it does inside every Flatpak sandbox. */
  readonly flatpakInfo: boolean;
  /** macOS only: the app is signed with a Developer ID, not just ad hoc. */
  readonly developerIdSigned: boolean;
}

const SYSTEM_MANAGED = new Set(['flatpak', 'deb', 'rpm', 'aur']);

function inFlatpak(evidence: InstallEvidence): boolean {
  return evidence.flatpakInfo || isSet(evidence.env, 'FLATPAK_ID');
}

const MANUAL: UpdatePolicy = 'manual';
const SELF_UPDATE: UpdatePolicy = 'self-update';
const PORTABLE_DIR = 'PORTABLE_EXECUTABLE_DIR';

/** macOS only installs updates signed by the same Developer ID. */
function macPolicy(evidence: InstallEvidence): UpdatePolicy {
  if (evidence.platform !== 'darwin') {
    return MANUAL;
  }
  return evidence.developerIdSigned ? SELF_UPDATE : 'notify';
}

/** The policy each self-updating channel earns, only when the evidence matches it. */
const CONFIRMED: Readonly<Record<string, (evidence: InstallEvidence) => UpdatePolicy>> = {
  appimage: ({ platform, env }) =>
    platform === 'linux' && isSet(env, 'APPIMAGE') ? SELF_UPDATE : MANUAL,
  nsis: ({ platform, env }) =>
    platform === 'win32' && !isSet(env, PORTABLE_DIR) ? SELF_UPDATE : MANUAL,
  portable: ({ platform, env }) =>
    platform === 'win32' && isSet(env, PORTABLE_DIR) ? 'notify' : MANUAL,
  dmg: macPolicy,
};

/**
 * Maps the channel stamped at build time and the runtime evidence to an
 * update policy. Package-managed channels never self-update; a
 * self-updating channel needs evidence that agrees, and anything else,
 * including a development build, never checks for updates.
 */
export function decideUpdatePolicy(channel: string, evidence: InstallEvidence): UpdateDecision {
  if (SYSTEM_MANAGED.has(channel)) {
    return { channel, policy: 'system' };
  }
  const confirm = CONFIRMED[channel];
  const policy = inFlatpak(evidence) || confirm === undefined ? MANUAL : confirm(evidence);
  return { channel, policy };
}

/** Whether `codesign -dv` output names a Developer ID signer, not an ad hoc signature. */
export function isDeveloperIdSigned(codesignOutput: string): boolean {
  return /^Authority=Developer ID Application: /m.test(codesignOutput);
}

/** One line for diagnostics. */
export function describeUpdatePolicy(decision: UpdateDecision): string {
  return `Updates ${decision.policy} (${decision.channel})`;
}

/** Settings that do nothing under `policy`: only builds that check for releases offer betas. */
export function settingsIgnoredBy(policy: UpdatePolicy): readonly string[] {
  return policy === 'self-update' || policy === 'notify' ? [] : ['general.betaUpdates'];
}
