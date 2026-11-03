/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { AssistantView, SettingsSnapshot } from '../../shared/chrome-api.ts';
import { AssistantSection } from './Assistant.tsx';

const VIEW: AssistantView = {
  inUse: 'anthropic',
  status: '',
  keys: { anthropic: true, openai: false },
  privateModel: { size: '1.1 GB', status: 'Not downloaded yet.', actions: ['download'] },
  models: [
    { id: 'claude-opus', label: 'Opus' },
    { id: 'claude-haiku', label: 'Haiku' },
  ],
  auto: 'Haiku',
  chats: [
    {
      account: 'a',
      accountName: 'Home',
      chats: [
        { id: 'f'.repeat(64), name: 'Ana' },
        { id: 'e'.repeat(64), name: null },
      ],
    },
  ],
};

const SNAPSHOT: SettingsSnapshot = {
  values: {
    'assistant.enabled': true,
    'assistant.provider': 'auto',
    'assistant.model': 'claude-opus',
    'assistant.autoSuggest': true,
    'assistant.messages': '10',
    'assistant.localServer': '',
  },
  restartPending: false,
  problems: {},
};

function setup(view: AssistantView = VIEW, snapshot: SettingsSnapshot = SNAPSHOT) {
  let current = view;
  const assistant = {
    view: vi.fn(() => Promise.resolve(current)),
    saveKey: vi.fn(() => Promise.resolve(true)),
    forgetKey: vi.fn(() => Promise.resolve()),
    testKey: vi.fn(() => Promise.resolve('')),
    findServers: vi.fn(() =>
      Promise.resolve([
        { server: 'localhost:11434', endpoint: 'http://localhost:11434/v1', models: ['tiny'] },
        { server: 'localhost:1234', endpoint: 'http://localhost:1234/v1', models: [] },
      ]),
    ),
    privateModel: vi.fn(() => Promise.resolve()),
    forgetChat: vi.fn(() => Promise.resolve()),
  };
  const onChange = vi.fn();
  const api = fakeChromeApi({ assistant });
  render(<AssistantSection api={api} snapshot={snapshot} onChange={onChange} />);
  return {
    assistant,
    onChange,
    setView: (next: AssistantView) => {
      current = next;
    },
  };
}

/** The `index`th of `items`, which the test knows is there. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item ${String(index)}.`);
  }
  return item;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AssistantSection', () => {
  it('shows every place the assistant can think, the one in use, the models and the chats', async () => {
    const t = setup();
    const section = screen.getByRole('region', { name: 'Assistant' });
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(section.getAttribute('aria-busy')).toBe('true');
    expect(await screen.findByText('In use')).toBeTruthy();
    expect(section.getAttribute('aria-busy')).toBe('false');
    expect(screen.getByRole('radio', { name: /Automatic/ })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: /Private, on this computer/ })).toBeTruthy();
    expect(screen.getByText(/downloads once \(1\.1 GB\)/)).toBeTruthy();
    expect(screen.getByLabelText('Model')).toHaveProperty('value', 'claude-opus');
    expect(screen.getByRole('option', { name: 'Auto (recommended): Haiku' })).toBeTruthy();
    expect(screen.getByText('Home: Ana')).toBeTruthy();
    expect(screen.getByText('Home: A chat allowed before (its name was not kept)')).toBeTruthy();
    expect(screen.getByText('Right now, it goes to Anthropic, at api.anthropic.com.')).toBeTruthy();
    for (const name of ['Show the assistant in chats', 'Suggest replies as messages arrive']) {
      expect(screen.getByRole('checkbox', { name })).toBeTruthy();
    }
    expect(screen.getByRole('group', { name: 'Messages the assistant reads' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'claude-haiku' } });
    expect(t.onChange).toHaveBeenCalledWith('assistant.model', 'claude-haiku');
  });

  it('switches where the assistant thinks, and says what is missing', async () => {
    const t = setup({
      ...VIEW,
      inUse: null,
      status: 'Set up the assistant.',
      models: [],
      auto: null,
    });
    expect(await screen.findByText('Set up the assistant.')).toBeTruthy();
    expect(
      screen.getByText('Right now, it goes nowhere: the assistant is not set up yet.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Model')).toHaveProperty('disabled', true);
    expect(screen.getByRole('option', { name: 'Auto (recommended)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /OpenAI/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Automatic/ }));
    expect(t.onChange.mock.calls).toEqual([
      ['assistant.provider', 'openai'],
      ['assistant.provider', 'auto'],
    ]);
  });

  it('saves, tests and forgets a key, which it never shows', async () => {
    const t = setup();
    const key = await screen.findByLabelText('API key for Claude (Anthropic)');
    fireEvent.click(nth(screen.getAllByRole('button', { name: 'Save Key' }), 0));
    expect(await screen.findByText('Paste a key first.')).toBeTruthy();
    fireEvent.input(key, { target: { value: 'sk-ant' } });
    fireEvent.click(nth(screen.getAllByRole('button', { name: 'Save Key' }), 0));
    await waitFor(() => {
      expect(t.assistant.saveKey).toHaveBeenCalledWith('anthropic', 'sk-ant');
    });
    expect(key).toHaveProperty('value', '');
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('The key works.')).toBeTruthy();
    t.assistant.testKey.mockResolvedValueOnce('Claude (Anthropic) did not accept your key.');
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('Claude (Anthropic) did not accept your key.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Forget Key' }));
    await waitFor(() => {
      expect(t.assistant.forgetKey).toHaveBeenCalledWith('anthropic');
    });
    t.assistant.saveKey.mockResolvedValueOnce(false);
    const openai = screen.getByLabelText('API key for OpenAI');
    fireEvent.input(openai, { target: { value: 'sk-openai' } });
    fireEvent.click(nth(screen.getAllByRole('button', { name: 'Save Key' }), 1));
    expect(await screen.findByText(/cannot keep the key safely/)).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: /Get a key from/ })
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      'https://console.anthropic.com/settings/keys',
      'https://platform.openai.com/api-keys',
    ]);
  });

  it('downloads the private model, and follows its download', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const t = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    expect(t.assistant.privateModel).toHaveBeenCalledWith('download');
    t.setView({
      ...VIEW,
      privateModel: { ...VIEW.privateModel, status: 'Downloading: 5%', actions: ['pause'] },
    });
    expect(await screen.findByText('Downloading: 5%')).toBeTruthy();
    t.setView({
      ...VIEW,
      privateModel: {
        ...VIEW.privateModel,
        status: 'Paused at 9%.',
        actions: ['resume', 'remove'],
      },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await screen.findByText('Paused at 9%.')).toBeTruthy();
    const views = t.assistant.view.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.assistant.view.mock.calls).toHaveLength(views);
    for (const name of ['Resume', 'Remove']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('finds model servers on this computer, and uses one or a typed address', async () => {
    const t = setup(VIEW, {
      ...SNAPSHOT,
      values: { ...SNAPSHOT.values, 'assistant.localServer': 'http://localhost:8080/v1' },
    });
    expect(await screen.findByText('Using http://localhost:8080/v1.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('localhost:11434: tiny')).toBeTruthy();
    expect(screen.getByText('localhost:1234: no models yet')).toBeTruthy();
    fireEvent.click(nth(screen.getAllByRole('button', { name: 'Use' }), 0));
    expect(t.onChange.mock.calls).toEqual([
      ['assistant.localServer', 'http://localhost:11434/v1'],
      ['assistant.provider', 'local'],
    ]);
    const address = screen.getByLabelText('Or type its address');
    fireEvent.input(address, { target: { value: 'example.org:80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use This Address' }));
    expect(await screen.findByText(/Type an address on this computer/)).toBeTruthy();
    fireEvent.input(address, { target: { value: 'localhost:1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use This Address' }));
    expect(t.onChange).toHaveBeenCalledWith('assistant.localServer', 'http://localhost:1234/v1');
    t.assistant.findServers.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText(/No model server answers/)).toBeTruthy();
  });

  it('stops reading a chat on request, and says when none may be read', async () => {
    const t = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop reading Ana' }));
    await waitFor(() => {
      expect(t.assistant.forgetChat).toHaveBeenCalledWith('a', 'f'.repeat(64));
    });
    cleanup();
    setup({ ...VIEW, chats: [] });
    expect(await screen.findByText('None yet.')).toBeTruthy();
  });

  it('keeps loading while the view cannot be read', async () => {
    const t = setup();
    t.assistant.view.mockRejectedValue(new Error('busy'));
    cleanup();
    render(
      <AssistantSection
        api={fakeChromeApi({ assistant: t.assistant })}
        snapshot={SNAPSHOT}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(t.assistant.view).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('marks the private model in use when Automatic picks it', async () => {
    setup(
      { ...VIEW, inUse: 'built-in' },
      { ...SNAPSHOT, values: { ...SNAPSHOT.values, 'assistant.provider': 'built-in' } },
    );
    expect(await screen.findByText('In use')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Private, on this computer/ })).toHaveProperty(
      'checked',
      true,
    );
  });
});
