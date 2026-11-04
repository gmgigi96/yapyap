/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { AssistantView, FoundServer } from '../../shared/api/chrome-api.ts';
import { AssistantStep } from './AssistantStep.tsx';

const VIEW: AssistantView = {
  inUse: null,
  status: '',
  keys: { anthropic: false, openai: false },
  privateModel: { size: '1.1 GB', status: '', actions: ['download'] },
  models: [],
  auto: null,
  chats: [],
};

const SERVERS: readonly FoundServer[] = [
  { server: 'localhost:1234', endpoint: 'http://localhost:1234/v1', models: [] },
  { server: 'localhost:11434', endpoint: 'http://localhost:11434/v1', models: ['tiny'] },
];

function setup(servers: () => Promise<readonly FoundServer[]> = () => Promise.resolve(SERVERS)) {
  const assistant = {
    view: vi.fn(() => Promise.resolve(VIEW)),
    findServers: vi.fn(servers),
    privateModel: vi.fn(() => Promise.resolve()),
    saveKey: vi.fn(() => Promise.resolve(true)),
  };
  const onChange = vi.fn();
  render(<AssistantStep api={fakeChromeApi({ assistant })} onChange={onChange} />);
  return { assistant, onChange };
}

afterEach(() => {
  cleanup();
});

describe('AssistantStep', () => {
  it('offers the model server it found on this computer first', async () => {
    const t = setup();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use the Model Server on This Computer (localhost:11434)',
      }),
    );
    expect(t.onChange.mock.calls).toEqual([
      ['assistant.localServer', 'http://localhost:11434/v1'],
      ['assistant.provider', 'local'],
    ]);
    expect(screen.getByText(/^Done\./)).toBeTruthy();
  });

  it('downloads the private model, with its size', async () => {
    const t = setup(() => Promise.resolve([]));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download a Private Model (1.1 GB)' }),
    );
    expect(t.assistant.privateModel).toHaveBeenCalledWith('download');
    expect(t.onChange).toHaveBeenCalledWith('assistant.provider', 'built-in');
    expect(screen.queryByRole('button', { name: /model server/ })).toBeNull();
  });

  it('asks for a key for Claude or OpenAI, and leaves everything as it is for later', async () => {
    const t = setup(() => Promise.reject(new Error('busy')));
    fireEvent.click(await screen.findByRole('button', { name: 'Use Claude with My API Key' }));
    expect(t.onChange).toHaveBeenCalledWith('assistant.provider', 'anthropic');
    fireEvent.input(screen.getByLabelText('API key for Claude (Anthropic)'), {
      target: { value: 'sk-ant' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await waitFor(() => {
      expect(t.assistant.saveKey).toHaveBeenCalledWith('anthropic', 'sk-ant');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use OpenAI with My API Key' }));
    expect(screen.getByLabelText('API key for OpenAI')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByLabelText('API key for OpenAI')).toBeNull();
    expect(t.onChange).toHaveBeenCalledTimes(2);
  });
});
