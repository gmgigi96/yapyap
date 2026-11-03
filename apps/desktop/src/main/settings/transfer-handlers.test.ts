import { describe, expect, it, vi } from 'vitest';
import type { ChromeHandler } from '../ipc/chrome.ts';
import { fakeSettings } from '../../../test/fake-settings.ts';
import { defaultSettings } from './decode.ts';
import { settingsTransferHandlers, type SettingsFiles } from './transfer-handlers.ts';
import { exportSettings, SETTINGS_EXPORT_FORMAT } from './transfer.ts';

function setup() {
  const service = fakeSettings();
  const files = {
    chooseExport: vi.fn<SettingsFiles['chooseExport']>(() => Promise.resolve('/home/me/out.json')),
    chooseImport: vi.fn<SettingsFiles['chooseImport']>(() => Promise.resolve('/home/me/in.json')),
    confirmImport: vi.fn<SettingsFiles['confirmImport']>(() => Promise.resolve(true)),
    read: vi.fn<SettingsFiles['read']>(() => Promise.resolve('')),
    write: vi.fn<SettingsFiles['write']>(() => Promise.resolve()),
  } satisfies SettingsFiles;
  const handlers = settingsTransferHandlers(service, files);
  const find = (channel: string): ChromeHandler => {
    const handler = handlers.find((candidate) => candidate.channel === channel);
    if (handler === undefined) {
      throw new Error(`No handler for ${channel}`);
    }
    return handler;
  };
  const owner = {};
  return {
    service,
    files,
    owner,
    settings: service.current,
    exporting: find('settings:export'),
    importing: find('settings:import'),
    run: (handler: ChromeHandler) => handler.handle({ sender: owner }),
  };
}

const darkFile = (): string => {
  const settings = defaultSettings();
  settings.appearance.theme = 'dark';
  return exportSettings(settings);
};

describe('settings export', () => {
  it('takes no arguments', () => {
    expect(setup().exporting.accepts([])).toBe(true);
    expect(setup().exporting.accepts(['/etc/passwd'])).toBe(false);
  });

  it('writes the current settings to the file the user picks', async () => {
    const t = setup();
    await expect(t.run(t.exporting)).resolves.toEqual({
      outcome: 'done',
      message: 'Settings exported.',
    });
    expect(t.files.chooseExport).toHaveBeenCalledExactlyOnceWith(t.owner);
    expect(t.files.write).toHaveBeenCalledExactlyOnceWith(
      '/home/me/out.json',
      exportSettings(defaultSettings()),
    );
  });

  it('writes nothing when the user cancels', async () => {
    const t = setup();
    t.files.chooseExport.mockResolvedValueOnce(undefined);
    await expect(t.run(t.exporting)).resolves.toEqual({ outcome: 'cancelled', message: '' });
    expect(t.files.write).not.toHaveBeenCalled();
  });

  it('says when the file cannot be written', async () => {
    const t = setup();
    t.files.write.mockRejectedValueOnce(new Error('EACCES'));
    await expect(t.run(t.exporting)).resolves.toEqual({
      outcome: 'failed',
      message: 'Could not save the settings file.',
    });
  });
});

describe('settings import', () => {
  it('takes no arguments', () => {
    expect(setup().importing.accepts([])).toBe(true);
    expect(setup().importing.accepts(['/home/me/in.json'])).toBe(false);
  });

  it('applies the file after the user confirms', async () => {
    const t = setup();
    t.files.read.mockResolvedValueOnce(darkFile());
    await expect(t.run(t.importing)).resolves.toEqual({
      outcome: 'done',
      message: 'Settings imported.',
    });
    expect(t.files.chooseImport).toHaveBeenCalledExactlyOnceWith(t.owner);
    expect(t.files.read).toHaveBeenCalledExactlyOnceWith('/home/me/in.json');
    expect(t.files.confirmImport).toHaveBeenCalledExactlyOnceWith(
      t.owner,
      'Your current settings will be replaced.',
    );
    expect(t.settings().appearance.theme).toBe('dark');
  });

  it('warns how many invalid values will use their defaults', async () => {
    const t = setup();
    const one = { ...defaultSettings(), appearance: { theme: 'neon' } };
    const two = { ...defaultSettings(), appearance: { theme: 'neon', zoom: 9 } };
    t.files.read
      .mockResolvedValueOnce(JSON.stringify({ format: SETTINGS_EXPORT_FORMAT, settings: one }))
      .mockResolvedValueOnce(JSON.stringify({ format: SETTINGS_EXPORT_FORMAT, settings: two }));
    await t.run(t.importing);
    await t.run(t.importing);
    expect(t.files.confirmImport.mock.calls.map(([, detail]) => detail)).toEqual([
      'Your current settings will be replaced. 1 invalid value in the file will use the default instead.',
      'Your current settings will be replaced. 2 invalid values in the file will use the default instead.',
    ]);
  });

  it('changes nothing when the user cancels the file or the confirmation', async () => {
    const t = setup();
    t.files.chooseImport.mockResolvedValueOnce(undefined);
    await expect(t.run(t.importing)).resolves.toEqual({ outcome: 'cancelled', message: '' });
    expect(t.files.read).not.toHaveBeenCalled();
    t.files.read.mockResolvedValueOnce(darkFile());
    t.files.confirmImport.mockResolvedValueOnce(false);
    await expect(t.run(t.importing)).resolves.toEqual({ outcome: 'cancelled', message: '' });
    expect(t.service.update).not.toHaveBeenCalled();
  });

  it('says why a file is refused, without asking or applying anything', async () => {
    const t = setup();
    t.files.read.mockResolvedValueOnce('{"cookies":[]}');
    await expect(t.run(t.importing)).resolves.toEqual({
      outcome: 'failed',
      message: 'That file is not a YapYap settings file.',
    });
    expect(t.files.confirmImport).not.toHaveBeenCalled();
    expect(t.service.update).not.toHaveBeenCalled();
  });

  it('says when the file cannot be read', async () => {
    const t = setup();
    t.files.read.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(t.run(t.importing)).resolves.toEqual({
      outcome: 'failed',
      message: 'Could not read that file.',
    });
    expect(t.service.update).not.toHaveBeenCalled();
  });
});
