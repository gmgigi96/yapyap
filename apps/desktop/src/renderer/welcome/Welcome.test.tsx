/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { ChromeApi, SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import { Welcome } from './Welcome.tsx';

const SNAPSHOT: SettingsSnapshot = {
  values: {
    'appearance.theme': 'system',
    'general.autostart': false,
    'privacy.notificationSender': true,
    'privacy.notificationText': true,
  },
  restartPending: false,
  problems: {},
};

function setup(get: () => Promise<SettingsSnapshot> = () => Promise.resolve(SNAPSHOT)) {
  const settings = {
    get: vi.fn(get),
    set: vi.fn<ChromeApi['settings']['set']>(() =>
      Promise.resolve({ ...SNAPSHOT, values: { ...SNAPSHOT.values, 'appearance.theme': 'dark' } }),
    ),
  };
  const assistant = {
    view: vi.fn(() => new Promise<never>(() => undefined)),
    findServers: vi.fn(() => new Promise<never>(() => undefined)),
  };
  render(<Welcome api={fakeChromeApi({ settings, assistant })} />);
  return { settings };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Welcome', () => {
  it('offers the first choices, leaving out what this platform lacks', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Welcome to YapYap' });
    expect(screen.getByText(/YapYap is in English for now/)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'New to YapYap? Read the six-step guide' })
        .getAttribute('href'),
    ).toBe('https://yapyap.guita.org/guide/get-started');
    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
    expect(screen.getByLabelText('Start at login')).toBeTruthy();
    // Close to the tray is not in the snapshot, as on macOS.
    expect(screen.queryByLabelText('Close to the tray')).toBeNull();
    expect(screen.getByText(/your system may ask/)).toBeTruthy();
  });

  it('applies each choice as it is made', async () => {
    const t = setup();
    fireEvent.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(t.settings.set).toHaveBeenCalledWith('appearance.theme', 'dark');
    expect(await screen.findByRole('radio', { name: 'Dark' })).toHaveProperty('checked', true);
  });

  it('closes when the user is ready', async () => {
    setup();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    fireEvent.click(await screen.findByRole('button', { name: 'Start Using YapYap' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows nothing while the settings cannot be read', async () => {
    const t = setup(() => Promise.reject(new Error('gone')));
    await vi.waitFor(() => {
      expect(t.settings.get).toHaveBeenCalled();
    });
    expect(document.body.textContent).toBe('');
  });
});
