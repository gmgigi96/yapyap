import type { Settings } from '../settings/schema.ts';
import { followSettings, type SettingsService } from '../settings/service.ts';

export interface ThemePort {
  themeSource: Settings['appearance']['theme'];
}

/**
 * Applies the theme setting now and whenever it changes. Electron's theme
 * source sets `prefers-color-scheme` for every page, so the app chrome, the
 * native title bars and WhatsApp itself (while its theme is "System
 * default") all follow it live.
 */
export function followThemeSetting(
  nativeTheme: ThemePort,
  settings: Pick<SettingsService, 'current' | 'onChange'>,
): void {
  followSettings(settings, (current) => {
    nativeTheme.themeSource = current.appearance.theme;
  });
}
