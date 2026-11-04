/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { ChromeApi, SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import type { SettingValue } from '../../shared/settings-fields.ts';
import { Field } from './Field.tsx';
import { Settings } from './Settings.tsx';

const HARDWARE = 'reliability.hardwareAcceleration';
const THEME = 'appearance.theme';

const snapshot = (overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot => ({
  values: { [THEME]: 'system', [HARDWARE]: true },
  restartPending: false,
  problems: {},
  ...overrides,
});

function api(overrides: Partial<ChromeApi['settings']> = {}) {
  return fakeChromeApi({
    settings: {
      get: vi.fn(() => Promise.resolve(snapshot())),
      set: vi.fn((id: string, value: SettingValue) =>
        Promise.resolve(
          snapshot({
            values: { ...snapshot().values, [id]: value },
            restartPending: id === HARDWARE && value === false,
          }),
        ),
      ),
      restart: vi.fn(() => Promise.resolve()),
      export: vi.fn(() =>
        Promise.resolve({ outcome: 'done' as const, message: 'Settings exported.' }),
      ),
      import: vi.fn(() =>
        Promise.resolve({ outcome: 'done' as const, message: 'Settings imported.' }),
      ),
      chooseFolder: vi.fn(() => Promise.resolve()),
      ...overrides,
    },
  });
}

const toggle = () =>
  screen.findByRole<HTMLInputElement>('checkbox', { name: 'Use hardware acceleration' });

describe('Settings', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists the settings by section, each explained', async () => {
    render(<Settings api={api()} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
    const box = await toggle();
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    expect(screen.getByRole('region', { name: 'Reliability' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'General' })).toBeNull();
    expect(box.getAttribute('aria-describedby')).toBe(`${HARDWARE}-hint`);
    expect(document.getElementById(`${HARDWARE}-hint`)?.textContent).toMatch(
      /flickers or stays blank\. Takes effect after a restart\.$/,
    );
    expect(screen.queryByRole('button', { name: 'Restart Now' })).toBeNull();
  });

  it('puts the assistant first, in a section of its own', async () => {
    const values = {
      'assistant.enabled': true,
      'assistant.provider': 'auto',
      'assistant.autoSuggest': true,
      [HARDWARE]: true,
    };
    const settings = api({ get: vi.fn(() => Promise.resolve(snapshot({ values }))) });
    vi.mocked(settings.assistant.view).mockReturnValue(new Promise<never>(() => undefined));
    render(<Settings api={settings} />);
    const section = await screen.findByRole('region', { name: 'Assistant' });
    expect(document.querySelector('main section')).toBe(section);
    expect(screen.getByRole('checkbox', { name: 'Show the assistant in chats' })).toBeTruthy();
    expect(screen.getAllByRole('region', { name: 'Assistant' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show the assistant in chats' }));
    expect(settings.settings.set).toHaveBeenCalledWith('assistant.enabled', false);
  });

  it('puts the agents right after the assistant, in a section of their own', async () => {
    const values = { 'assistant.enabled': true, 'agents.enabled': false, [HARDWARE]: true };
    const settings = api({ get: vi.fn(() => Promise.resolve(snapshot({ values }))) });
    vi.mocked(settings.assistant.view).mockReturnValue(new Promise<never>(() => undefined));
    vi.mocked(settings.agents.view).mockReturnValue(new Promise<never>(() => undefined));
    render(<Settings api={settings} />);
    const section = await screen.findByRole('region', { name: 'Agents' });
    expect(document.querySelectorAll('main section')[1]).toBe(section);
    expect(screen.getAllByRole('region', { name: 'Agents' })).toHaveLength(1);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect([...nav.querySelectorAll('a')].map((link) => link.textContent).slice(0, 2)).toEqual([
      'Assistant',
      'Agents',
    ]);
  });

  it('lists the sections it shows at the top, each a jump to its heading', async () => {
    const withAssistant = { 'assistant.enabled': true, [HARDWARE]: true, 'general.unknown': 1 };
    const settings = api({
      get: vi.fn(() => Promise.resolve(snapshot({ values: withAssistant }))),
    });
    vi.mocked(settings.assistant.view).mockReturnValue(new Promise<never>(() => undefined));
    render(<Settings api={settings} />);
    const nav = await screen.findByRole('navigation', { name: 'Settings sections' });
    // A value without a field here, such as general.unknown, adds no section.
    const links = [...nav.querySelectorAll('a')].map((link) => [
      link.textContent,
      link.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Assistant', '#assistant-title'],
      ['Reliability', '#reliability-title'],
      ['Backup', '#backup-title'],
    ]);
    for (const [, href] of links) {
      expect(document.getElementById(String(href).slice(1))).not.toBeNull();
    }
    cleanup();
    render(<Settings api={api()} />);
    const without = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(without.textContent).toBe('AppearanceReliabilityBackup');
  });

  it('saves a change and offers a restart when it needs one', async () => {
    const t = api();
    render(<Settings api={t} />);
    fireEvent.click(await toggle());
    expect(t.settings.set).toHaveBeenCalledExactlyOnceWith(HARDWARE, false);
    const restart = await screen.findByRole('button', { name: 'Restart Now' });
    expect(screen.getByText('Restart YapYap to apply your changes.')).toBeTruthy();
    expect((await toggle()).checked).toBe(false);
    fireEvent.click(restart);
    expect(t.settings.restart).toHaveBeenCalledOnce();
  });

  it('says when a change could not be saved, until one is', async () => {
    const set = vi
      .fn<ChromeApi['settings']['set']>()
      .mockRejectedValueOnce(new Error('rejected'))
      .mockResolvedValueOnce(snapshot({ restartPending: true }));
    render(<Settings api={api({ set })} />);
    fireEvent.click(await toggle());
    expect(await screen.findByText('Could not save that setting.')).toBeTruthy();
    fireEvent.click(await toggle());
    await screen.findByRole('button', { name: 'Restart Now' });
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('shows unchecked switches for settings that are off', async () => {
    const off = snapshot({ values: { [THEME]: 'dark', [HARDWARE]: false } });
    render(<Settings api={api({ get: () => Promise.resolve(off) })} />);
    expect((await toggle()).checked).toBe(false);
  });

  it('says when the settings cannot be loaded', async () => {
    render(<Settings api={api({ get: () => Promise.reject(new Error('rejected')) })} />);
    expect(await screen.findByText('Settings are unavailable.')).toBeTruthy();
  });

  it('offers the theme as a group of choices that applies without a restart', async () => {
    const t = api();
    render(<Settings api={t} />);
    const group = await screen.findByRole('group', { name: 'Theme' });
    expect(group.getAttribute('aria-describedby')).toBe(`${THEME}-hint`);
    expect(document.getElementById(`${THEME}-hint`)?.textContent).toMatch(/System default\.$/);
    const system = screen.getByRole<HTMLInputElement>('radio', { name: 'Same as the system' });
    expect(system.checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(t.settings.set).toHaveBeenCalledExactlyOnceWith(THEME, 'dark');
    await vi.waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Dark' }).checked).toBe(true);
    });
    expect(screen.queryByRole('button', { name: 'Restart Now' })).toBeNull();
  });

  it('adds no restart hint to a setting that applies at once', () => {
    const field = {
      id: 'general.example',
      label: 'Example',
      description: 'Applies at once.',
      restart: false,
    } as const;
    render(<Field field={field} snapshot={snapshot()} onChange={vi.fn()} />);
    expect(document.getElementById('general.example-hint')?.textContent).toBe('Applies at once.');
  });

  it('explains under a setting why its change did not take effect', () => {
    const field = {
      id: 'general.example',
      label: 'Example',
      description: 'Does something.',
      restart: false,
    } as const;
    render(
      <Field
        field={field}
        snapshot={snapshot({ problems: { 'general.example': 'The system refused.' } })}
        onChange={vi.fn()}
      />,
    );
    expect(document.getElementById('general.example-hint')?.textContent).toBe(
      'Does something.The system refused.',
    );
  });

  it('exports the settings and says how it went', async () => {
    const t = api();
    render(<Settings api={t} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export Settings…' }));
    expect(await screen.findByText('Settings exported.')).toBeTruthy();
    expect(t.settings.export).toHaveBeenCalledOnce();
    expect(t.settings.get).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: 'Backup' }).textContent).toContain(
      'never includes your WhatsApp login or chats',
    );
  });

  it('shows the imported settings once an import is done', async () => {
    const get = vi
      .fn<ChromeApi['settings']['get']>()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ values: { [THEME]: 'system', [HARDWARE]: false } }));
    const t = api({ get });
    render(<Settings api={t} />);
    expect((await toggle()).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Import Settings…' }));
    expect(await screen.findByText('Settings imported.')).toBeTruthy();
    await vi.waitFor(async () => {
      expect((await toggle()).checked).toBe(false);
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('keeps the settings when an import is cancelled or rejected', async () => {
    const t = api({
      import: vi
        .fn<ChromeApi['settings']['import']>()
        .mockResolvedValueOnce({ outcome: 'cancelled', message: '' })
        .mockResolvedValueOnce({
          outcome: 'failed',
          message: 'That file is not a YapYap settings file.',
        })
        .mockRejectedValueOnce(new Error('ipc')),
    });
    render(<Settings api={t} />);
    const button = await screen.findByRole('button', { name: 'Import Settings…' });
    fireEvent.click(button);
    await vi.waitFor(() => {
      expect(t.settings.import).toHaveBeenCalledOnce();
    });
    fireEvent.click(button);
    expect(await screen.findByText('That file is not a YapYap settings file.')).toBeTruthy();
    fireEvent.click(button);
    expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
    expect(t.settings.get).toHaveBeenCalledOnce();
  });
});

describe('a text setting', () => {
  afterEach(() => {
    cleanup();
  });

  const field = {
    id: 'network.proxyServer' as const,
    label: 'Proxy address',
    description: 'A proxy.',
    restart: false,
    text: { placeholder: 'socks5://127.0.0.1:1080' },
  };

  it('saves on Enter or when focus leaves, trimmed, and only when it changed', () => {
    const onChange = vi.fn();
    render(
      <Field
        field={field}
        snapshot={snapshot({ values: { 'network.proxyServer': '' } })}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Proxy address');
    expect(input.placeholder).toBe('socks5://127.0.0.1:1080');
    fireEvent.keyDown(input, { key: 'a' });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    input.value = ' socks5://10.0.0.2:1080 ';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('network.proxyServer', 'socks5://10.0.0.2:1080');
    input.value = 'http://p:8080';
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith('network.proxyServer', 'http://p:8080');
  });

  it('starts empty for a value it does not have', () => {
    render(<Field field={field} snapshot={snapshot()} onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Proxy address').value).toBe('');
  });
});

describe('a folder setting', () => {
  afterEach(() => {
    cleanup();
  });

  const field = {
    id: 'downloads.folder' as const,
    label: 'Save files to',
    description: 'Where files go.',
    restart: false,
    folder: { defaultName: 'Your Downloads folder', useDefault: 'Use Downloads Folder' },
  };

  it('shows the Downloads folder until another is chosen, and goes back to it', () => {
    const onChange = vi.fn();
    const onChooseFolder = vi.fn();
    const { rerender } = render(
      <Field
        field={field}
        snapshot={snapshot()}
        onChange={onChange}
        onChooseFolder={onChooseFolder}
      />,
    );
    expect(screen.getByText('Your Downloads folder')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use Downloads Folder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose… Save files to' }));
    expect(onChooseFolder).toHaveBeenCalledExactlyOnceWith('downloads.folder');
    rerender(
      <Field
        field={field}
        snapshot={snapshot({ values: { 'downloads.folder': '/home/someone/Saved' } })}
        onChange={onChange}
        onChooseFolder={onChooseFolder}
      />,
    );
    expect(screen.getByText('/home/someone/Saved')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use Downloads Folder' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('downloads.folder', '');
  });

  it('chooses nothing where no folder dialog is offered', () => {
    render(<Field field={field} snapshot={snapshot()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose… Save files to' }));
    expect(screen.getByText('Your Downloads folder')).toBeTruthy();
  });

  it('asks main for the folder, then shows what was saved', async () => {
    const withFolder = snapshot({ values: { ...snapshot().values, 'downloads.folder': '' } });
    const yapyap = api({ get: vi.fn(() => Promise.resolve(withFolder)) });
    render(<Settings api={yapyap} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choose… Save files to' }));
    expect(yapyap.settings.chooseFolder).toHaveBeenCalledExactlyOnceWith('downloads.folder');
    await vi.waitFor(() => {
      expect(yapyap.settings.get).toHaveBeenCalledTimes(2);
    });
  });
});
