import type { Settings } from '../settings/schema.ts';
import { followSettings, type SettingsService } from '../settings/service.ts';

export type ZoomStep = 'in' | 'out' | 'reset';

const STEP = 0.05;
const MIN = 0.5;
const MAX = 3;

/**
 * The zoom factor one step from `current`, in 5% steps between 50% and 300%.
 * Rounding to whole steps keeps repeated steps from drifting.
 */
export function stepZoom(current: number, step: ZoomStep): number {
  if (step === 'reset') {
    return 1;
  }
  const steps = Math.round(current / STEP) + (step === 'in' ? 1 : -1);
  return Math.min(MAX, Math.max(MIN, Math.round(steps * STEP * 100) / 100));
}

function stepped(settings: Settings, step: ZoomStep): Settings {
  const zoom = stepZoom(settings.appearance.zoom, step);
  return { ...settings, appearance: { ...settings.appearance, zoom } };
}

/** Changes the stored zoom, which every view that follows it applies. */
export function changeZoom(settings: Pick<SettingsService, 'update'>, step: ZoomStep): void {
  settings.update((current) => stepped(current, step));
}

export interface ZoomableContents {
  setZoomFactor(factor: number): void;
  on(event: 'did-finish-load', listener: () => void): unknown;
  /** Ctrl and the mouse wheel, which Chromium would otherwise zoom in its own steps. */
  on(event: 'zoom-changed', listener: (event: unknown, direction: 'in' | 'out') => void): unknown;
}

/** Keeps the WhatsApp view at the stored zoom, through reloads and setting changes. */
export function followZoomSetting(
  contents: ZoomableContents,
  settings: Pick<SettingsService, 'current' | 'onChange' | 'update'>,
): void {
  const apply = (current: Settings): void => {
    contents.setZoomFactor(current.appearance.zoom);
  };
  followSettings(settings, apply);
  contents.on('did-finish-load', () => {
    apply(settings.current());
  });
  // A touchpad pinch arrives as this event too, so the switch can stop it (#81).
  contents.on('zoom-changed', (_event, direction) => {
    if (settings.current().appearance.pinchZoom) {
      changeZoom(settings, direction);
    }
  });
}
