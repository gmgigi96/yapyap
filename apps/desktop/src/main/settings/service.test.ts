import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { tempDir } from '../../../../../test/temp-dir.ts';
import { defaultSettings } from './decode.ts';
import { openSettings } from './service.ts';

const fresh = () => tempDir('yapyap-settings-');

describe('openSettings', () => {
  it('serves the loaded settings and saves changes', () => {
    const dir = fresh();
    const settings = openSettings(dir, 1);
    const listener = vi.fn();
    settings.onChange(listener);
    expect(settings.current()).toEqual(defaultSettings());
    expect(settings.notice).toBeUndefined();
    settings.update((current) => ({
      ...current,
      general: { ...current.general, autostart: true },
    }));
    expect(settings.current().general.autostart).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(settings.current());
    const saved = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as {
      general: object;
    };
    expect(saved.general).toEqual({
      language: 'system',
      startMinimized: false,
      autostart: true,
      closeToTray: false,
      betaUpdates: false,
      doNotDisturb: false,
    });
  });

  it('knows the first launch, and that every later one is not', () => {
    const dir = fresh();
    const first = openSettings(dir, 1);
    expect(first.firstRun).toBe(true);
    first.update((current) => current);
    expect(openSettings(dir, 2).firstRun).toBe(false);
  });
});
