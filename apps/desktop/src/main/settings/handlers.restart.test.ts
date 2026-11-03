import { describe, expect, it, vi } from 'vitest';
import { fakeSettings } from '../../../test/fake-settings.ts';
import { settingsHandlers } from './handlers.ts';

vi.mock('../../shared/settings-fields.ts', () => ({
  SETTING_FIELDS: [
    { id: 'general.startMinimized', label: 'L', description: 'D', restart: false },
    { id: 'reliability.hardwareAcceleration', label: 'L', description: 'D', restart: true },
  ],
}));

describe('settingsHandlers with settings that apply at once', () => {
  it('asks for a restart only when a setting that needs one has changed', async () => {
    const service = fakeSettings();
    const set = settingsHandlers(service, vi.fn(), 'linux').find(
      (handler) => handler.channel === 'settings:set',
    );
    const call = { sender: {} };
    expect(await set?.handle(call, 'general.startMinimized', true)).toEqual({
      values: { 'general.startMinimized': true, 'reliability.hardwareAcceleration': true },
      restartPending: false,
      problems: {},
    });
    expect(await set?.handle(call, 'reliability.hardwareAcceleration', false)).toEqual(
      expect.objectContaining({ restartPending: true }),
    );
  });
});
