import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { fakeSettings } from '../../../test/fake-settings.ts';
import { defaultSettings } from '../settings/decode.ts';
import { changeZoom, followZoomSetting, stepZoom, type ZoomableContents } from './zoom.ts';

describe('stepZoom', () => {
  it('steps by 5% and resets to 100%', () => {
    expect(stepZoom(1, 'in')).toBe(1.05);
    expect(stepZoom(1, 'out')).toBe(0.95);
    expect(stepZoom(1.35, 'reset')).toBe(1);
  });

  it('stays between 50% and 300%', () => {
    expect(stepZoom(0.5, 'out')).toBe(0.5);
    expect(stepZoom(3, 'in')).toBe(3);
  });

  it('snaps an in-between level to whole steps', () => {
    expect(stepZoom(1.02, 'in')).toBe(1.05);
    expect(stepZoom(1.08, 'out')).toBe(1.05);
  });

  it('never drifts off the 5% grid, however often it steps', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('in' as const, 'out' as const), { maxLength: 80 }),
        (steps) => {
          const zoom = steps.reduce(stepZoom, 1);
          expect(Math.round(zoom * 100) % 5).toBe(0);
          expect(zoom).toBeGreaterThanOrEqual(0.5);
          expect(zoom).toBeLessThanOrEqual(3);
        },
      ),
    );
  });
});

describe('changeZoom', () => {
  it('stores the stepped zoom and nothing else', () => {
    const settings = fakeSettings();
    changeZoom(settings, 'in');
    changeZoom(settings, 'in');
    expect(settings.current().appearance).toEqual({ ...defaultSettings().appearance, zoom: 1.1 });
  });
});

describe('followZoomSetting', () => {
  function setup() {
    const listeners = new Map<string, (...args: never[]) => void>();
    const contents = {
      setZoomFactor: vi.fn(),
      on: vi.fn((event: string, listener: (...args: never[]) => void) => {
        listeners.set(event, listener);
      }),
    } satisfies ZoomableContents;
    const settings = fakeSettings();
    followZoomSetting(contents, settings);
    return { contents, settings, listeners };
  }

  it('applies the stored zoom now, after every load and on every change', () => {
    const t = setup();
    expect(t.contents.setZoomFactor).toHaveBeenLastCalledWith(1);
    changeZoom(t.settings, 'out');
    expect(t.contents.setZoomFactor).toHaveBeenLastCalledWith(0.95);
    t.contents.setZoomFactor.mockClear();
    t.listeners.get('did-finish-load')?.();
    expect(t.contents.setZoomFactor).toHaveBeenCalledExactlyOnceWith(0.95);
  });

  it('turns Ctrl and the mouse wheel into 5% steps', () => {
    const t = setup();
    t.listeners.get('zoom-changed')?.(...([{}, 'in'] as never[]));
    expect(t.settings.current().appearance.zoom).toBe(1.05);
    t.listeners.get('zoom-changed')?.(...([{}, 'out'] as never[]));
    expect(t.settings.current().appearance.zoom).toBe(1);
  });

  it('ignores a pinch or the wheel when pinch zoom is off, which the menu still zooms', () => {
    const t = setup();
    t.settings.update((current) => ({
      ...current,
      appearance: { ...current.appearance, pinchZoom: false },
    }));
    t.listeners.get('zoom-changed')?.(...([{}, 'in'] as never[]));
    expect(t.settings.current().appearance.zoom).toBe(1);
    changeZoom(t.settings, 'in');
    expect(t.settings.current().appearance.zoom).toBe(1.05);
  });
});
