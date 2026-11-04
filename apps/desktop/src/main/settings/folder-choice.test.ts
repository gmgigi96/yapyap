import { describe, expect, it, vi } from 'vitest';
import { CHROME_CHANNELS } from '../../shared/api/chrome-api.ts';
import { defaultSettings } from './decode.ts';
import { folderChoiceHandlers } from './folder-choice.ts';
import type { Settings } from './schema.ts';

function setup(chosen: string | undefined) {
  let settings: Settings = defaultSettings();
  const service = {
    current: () => settings,
    update: vi.fn((change: (current: Settings) => Settings) => {
      settings = change(settings);
    }),
  };
  const choose = vi.fn<(sender: object) => Promise<string | undefined>>(() =>
    Promise.resolve(chosen),
  );
  const [handler] = folderChoiceHandlers(service, choose);
  if (handler?.channel !== CHROME_CHANNELS.settingsChooseFolder) {
    throw new Error('No folder handler.');
  }
  return { handler, service, choose, settings: () => settings };
}

const sender = {};

describe('folderChoiceHandlers', () => {
  it('saves the folder the user picked in the system dialog over their window', async () => {
    const t = setup('/home/someone/Saved');
    await t.handler.handle({ sender }, 'downloads.folder');
    expect(t.choose).toHaveBeenCalledExactlyOnceWith(sender);
    expect(t.settings().downloads.folder).toBe('/home/someone/Saved');
  });

  it('changes nothing when the user cancels, or the folder is too long', async () => {
    const cancelled = setup(undefined);
    await cancelled.handler.handle({ sender }, 'downloads.folder');
    expect(cancelled.service.update).not.toHaveBeenCalled();
    const tooLong = setup(`/${'x'.repeat(5000)}`);
    await tooLong.handler.handle({ sender }, 'downloads.folder');
    expect(tooLong.service.update).not.toHaveBeenCalled();
  });

  it('chooses only folder settings', () => {
    const { accepts } = setup(undefined).handler;
    expect(accepts(['downloads.folder'])).toBe(true);
    expect(accepts(['downloads.askWhere'])).toBe(false);
    expect(accepts(['downloads.folder', 'extra'])).toBe(false);
  });
});
