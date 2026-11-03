import { describe, expect, it } from 'vitest';
import { fakeSettings } from '../../../test/fake-settings.ts';
import { followThemeSetting, type ThemePort } from './theme.ts';

describe('followThemeSetting', () => {
  it('applies the theme at once and on every change', () => {
    const nativeTheme: ThemePort = { themeSource: 'light' };
    const settings = fakeSettings();
    followThemeSetting(nativeTheme, settings);
    expect(nativeTheme.themeSource).toBe('system');
    settings.change({ appearance: { theme: 'dark' } });
    expect(nativeTheme.themeSource).toBe('dark');
  });
});
