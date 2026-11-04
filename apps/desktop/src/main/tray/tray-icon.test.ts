import { describe, expect, it, vi } from 'vitest';
import { fakeSettings } from '../../../test/fake-settings.ts';
import { darkPanel, followTrayIconSetting, trayImage } from './tray-icon.ts';

const images = () => {
  const made = { setTemplateImage: vi.fn() };
  return {
    made,
    factory: { fromPath: vi.fn(() => made), fromBitmap: vi.fn(() => made) },
  };
};

describe('trayImage', () => {
  it('loads the app icon from disk', () => {
    const t = images();
    expect(trayImage('color', t.factory, '/icons/32x32.png')).toBe(t.made);
    expect(t.factory.fromPath).toHaveBeenCalledWith('/icons/32x32.png');
  });

  it('draws the symbolic icon, light or dark, and marks templates for macOS', () => {
    const t = images();
    trayImage('light', t.factory, '');
    trayImage('template', t.factory, '');
    const [light, template] = t.factory.fromBitmap.mock.calls as unknown as [Buffer, object][];
    expect(light?.[1]).toEqual({ width: 32, height: 32, scaleFactor: 2 });
    // A light glyph is white where the front bubble is solid; a template is black.
    const solid = (13 * 32 + 5) * 4;
    expect(light?.[0][solid]).toBe(255);
    expect(template?.[0][solid]).toBe(0);
    expect(t.made.setTemplateImage.mock.calls).toEqual([[false], [true]]);
  });
});

describe('darkPanel', () => {
  const scheme = {
    shouldUseDarkColors: true,
    shouldUseDarkColorsForSystemIntegratedUI: false,
    on: vi.fn(),
  };

  it('reads the taskbar on Windows, and the scheme elsewhere', () => {
    expect(darkPanel(scheme, 'win32')).toBe(false);
    expect(darkPanel(scheme, 'linux')).toBe(true);
  });
});

describe('followTrayIconSetting', () => {
  it('shows the chosen icon, again when the setting or the scheme changes', () => {
    const settings = fakeSettings();
    let schemeChanged: (() => void) | undefined;
    const scheme = {
      shouldUseDarkColors: false,
      shouldUseDarkColorsForSystemIntegratedUI: false,
      on: vi.fn((_event: 'updated', listener: () => void) => {
        schemeChanged = listener;
      }),
    };
    const tray = { setImage: vi.fn() };
    followTrayIconSetting(tray, {
      platform: 'linux',
      settings,
      scheme,
      image: (choice) => choice,
    });
    settings.change({ appearance: { trayIcon: 'auto' } });
    scheme.shouldUseDarkColors = true;
    schemeChanged?.();
    expect(tray.setImage.mock.calls).toEqual([['color'], ['dark'], ['light']]);
  });
});
