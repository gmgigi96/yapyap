import { isSet, type Environment } from '../support/environment.ts';

/** Chromium's command line, as far as features go. */
export interface FeatureSwitches {
  getSwitchValue(name: string): string;
  appendSwitch(name: string, value?: string): void;
}

const PIPEWIRE_CAMERA = 'WebRtcPipeWireCamera';

/**
 * The Flatpak sandbox has no camera devices, so video calls reach the camera
 * through the desktop's Camera portal and PipeWire, which ask the user first
 * (#78). Outside Flatpak, Chromium keeps opening the camera directly, which
 * works without a portal. Features already named on the command line stay:
 * Chromium keeps only the last `--enable-features`.
 */
export function useCameraPortal(commandLine: FeatureSwitches, env: Environment): void {
  if (!isSet(env, 'FLATPAK_ID')) {
    return;
  }
  const named = commandLine.getSwitchValue('enable-features');
  commandLine.appendSwitch(
    'enable-features',
    named === '' ? PIPEWIRE_CAMERA : `${named},${PIPEWIRE_CAMERA}`,
  );
}
