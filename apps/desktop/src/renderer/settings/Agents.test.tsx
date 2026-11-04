/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import { nth } from '../../../test/nth.ts';
import {
  DEFAULT_AGENT_LIMITS,
  type AgentsView,
  type AgentTokenCreated,
  type AgentTokenView,
} from '../../shared/api/agents-api.ts';
import type { SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import { AgentsSection } from './Agents.tsx';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const OTHER = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const TOKEN = `yapyap_mcp_${'2'.repeat(16)}_${'1'.repeat(64)}`;

const READER: AgentTokenView = {
  id: '2'.repeat(16),
  name: 'Claude Code',
  scopes: ['chat:read-active'],
  accounts: [ACCOUNT, 'gone'],
  chats: 'all',
  limits: DEFAULT_AGENT_LIMITS,
  expires: null,
  notify: true,
  lastUsed: null,
};

const SENDER: AgentTokenView = {
  ...READER,
  id: '3'.repeat(16),
  name: 'Bot',
  scopes: ['messages:send'],
  chats: [
    { id: 'a'.repeat(64), name: 'Ana', phone: '+447700900123' },
    { id: 'b'.repeat(64), name: null, phone: null },
  ],
  limits: { callsPerMinute: null, sendsPerMinute: 5, sendsPerDay: null },
  expires: Date.UTC(2099, 0, 1),
  lastUsed: Date.UTC(2026, 10, 2),
};

const VIEW: AgentsView = {
  address: 'http://127.0.0.1:50000/mcp',
  problem: '',
  tokens: [READER, SENDER, { ...READER, id: '4'.repeat(16), name: 'Old', expires: 1 }],
  activity: [
    { time: 0, token: 'Claude Code', tool: 'read_chat', account: 'Personal', result: 'ok' },
  ],
  accounts: [
    { id: ACCOUNT, name: 'Personal' },
    { id: OTHER, name: 'Work' },
  ],
};

const snapshot = (on: boolean): SettingsSnapshot => ({
  values: { 'agents.enabled': on },
  restartPending: false,
  problems: {},
});

function setup(view: AgentsView = VIEW, on = true) {
  let created: AgentTokenCreated = { token: TOKEN, address: VIEW.address };
  const agents = {
    view: vi.fn(() => Promise.resolve(view)),
    create: vi.fn(() => Promise.resolve(created)),
    revoke: vi.fn(() => Promise.resolve()),
    narrow: vi.fn(() => Promise.resolve(true)),
    newPort: vi.fn(() => Promise.resolve()),
    openChat: vi.fn((): Promise<string | null> => Promise.resolve('Rui')),
    copy: vi.fn(() => Promise.resolve()),
  };
  const onChange = vi.fn();
  const api = fakeChromeApi({ agents });
  const rendered = render(<AgentsSection api={api} snapshot={snapshot(on)} onChange={onChange} />);
  return {
    agents,
    onChange,
    rendered,
    refuseWith: (problem: string) => {
      created = { problem };
    },
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const button = (name: string | RegExp) => screen.getByRole('button', { name });

/** The `index`th of `items`, which the test knows is there. */
describe('AgentsSection', () => {
  it('shows the switch, where agents connect, the tokens and recent activity', async () => {
    const t = setup();
    expect(screen.getByText('Loading…')).toBeTruthy();
    await screen.findByText('http://127.0.0.1:50000/mcp');
    expect(screen.getByRole('checkbox', { name: 'Let AI agents connect' })).toBeTruthy();
    fireEvent.click(button('Copy'));
    expect(t.agents.copy).toHaveBeenCalledWith('http://127.0.0.1:50000/mcp');
    expect(screen.getByRole('heading', { name: 'Claude Code' })).toBeTruthy();
    expect(screen.getByText(/60 calls a minute · Never expires · Not used yet/)).toBeTruthy();
    expect(
      screen.getByText(/Unlimited calls a minute; 5 messages a minute, Unlimited a day/),
    ).toBeTruthy();
    expect(screen.getByText(/Expired/)).toBeTruthy();
    expect(screen.getByText(/Last used/)).toBeTruthy();
    expect(screen.getAllByText('All chats').length).toBeGreaterThan(0);
    expect(screen.getByText(/A chat YapYap couldn’t keep the name of/)).toBeTruthy();
    expect(screen.getByText(/Claude Code · read_chat in Personal: ok/)).toBeTruthy();
  });

  it('narrows a token one scope, account or chat at a time, and revokes it', async () => {
    const t = setup();
    await screen.findByText('http://127.0.0.1:50000/mcp');
    fireEvent.click(button('Remove Send messages, without asking you'));
    expect(t.agents.narrow).toHaveBeenCalledWith(SENDER.id, { scope: 'messages:send' });
    fireEvent.click(button('Remove Ana · +447700900123'));
    expect(t.agents.narrow).toHaveBeenCalledWith(SENDER.id, { chat: 'a'.repeat(64) });
    fireEvent.click(nth(screen.getAllByRole('button', { name: 'Remove gone' }), 0));
    expect(t.agents.narrow).toHaveBeenCalledWith(READER.id, { account: 'gone' });
    fireEvent.click(nth(screen.getAllByRole('button', { name: 'Revoke' }), 0));
    expect(t.agents.revoke).toHaveBeenCalledWith(READER.id);
    await waitFor(() => {
      expect(t.agents.view.mock.calls.length).toBeGreaterThan(2);
    });
  });

  it('says why agents cannot connect, and moves to another port', async () => {
    const t = setup({ ...VIEW, address: null, problem: 'Port 50000 is taken.' });
    await screen.findByText('Port 50000 is taken.');
    fireEvent.click(button('Pick Another Port'));
    expect(t.agents.newPort).toHaveBeenCalledOnce();
  });

  it('asks to turn the server on, and waits for its address once it is', async () => {
    const off = setup({ ...VIEW, address: null, tokens: [], activity: [] }, false);
    await screen.findByText(/Turn on “Let AI agents connect”/);
    expect(screen.getByText('No tokens yet.')).toBeTruthy();
    expect(screen.getByText('No agent has connected since YapYap started.')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Let AI agents connect' }));
    expect(off.onChange).toHaveBeenCalledWith('agents.enabled', true);
    cleanup();
    setup({ ...VIEW, address: null }, true);
    await waitFor(() => {
      expect(document.querySelector('[aria-busy="true"]')?.textContent).toBe('Loading…');
    });
  });

  it('reads the view again every few seconds while the server is on, and stops after', async () => {
    vi.useFakeTimers();
    const t = setup();
    await vi.advanceTimersByTimeAsync(0);
    const before = t.agents.view.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.agents.view.mock.calls).toHaveLength(before + 1);
    t.rendered.unmount();
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.agents.view.mock.calls).toHaveLength(before + 1);
  });

  it('keeps showing what it had when the view cannot be read', async () => {
    const t = setup();
    await screen.findByText('http://127.0.0.1:50000/mcp');
    t.agents.view.mockRejectedValueOnce(new Error('Gone.'));
    fireEvent.click(nth(screen.getAllByRole('button', { name: 'Revoke' }), 0));
    await waitFor(() => {
      expect(t.agents.revoke).toHaveBeenCalled();
    });
    expect(screen.getByText('http://127.0.0.1:50000/mcp')).toBeTruthy();
  });
});

describe('creating a token', () => {
  async function openForm() {
    const t = setup();
    await screen.findByText('http://127.0.0.1:50000/mcp');
    fireEvent.click(button('Create a Token…'));
    fireEvent.input(screen.getByRole('textbox', { name: /Name/ }), {
      target: { value: 'Laptop' },
    });
    return t;
  }

  it('creates a read-only token for the first account, and shows it once', async () => {
    const t = await openForm();
    fireEvent.click(button('Create Token'));
    await screen.findByText('Your new token');
    expect(t.agents.create).toHaveBeenCalledWith({
      name: 'Laptop',
      scopes: ['chat:read-unread-summary', 'chat:read-active'],
      accounts: [ACCOUNT],
      chats: 'all',
      limits: DEFAULT_AGENT_LIMITS,
      expiresInDays: 30,
      notify: true,
    });
    const command = `claude mcp add --transport http yapyap http://127.0.0.1:50000/mcp --header "Authorization: Bearer ${TOKEN}"`;
    expect(screen.getByText(command)).toBeTruthy();
    const copies = screen.getAllByRole('button', { name: 'Copy' });
    for (const copy of copies) {
      fireEvent.click(copy);
    }
    expect(t.agents.copy).toHaveBeenCalledWith(TOKEN);
    expect(t.agents.copy).toHaveBeenCalledWith(command);
    expect(t.agents.copy).toHaveBeenCalledWith(`Authorization: Bearer ${TOKEN}`);
    fireEvent.click(button('Done'));
    expect(screen.queryByText('Your new token')).toBeNull();
  });

  it('names a placeholder address when the server is not listening', async () => {
    const t = await openForm();
    t.agents.create.mockResolvedValueOnce({ token: TOKEN, address: null });
    fireEvent.click(button('Create Token'));
    expect(await screen.findByText(/http:\/\/127\.0\.0\.1:<port>\/mcp/)).toBeTruthy();
  });

  it('shows why YapYap refused the token, keeping the form', async () => {
    const t = await openForm();
    t.refuseWith('One of the accounts no longer exists.');
    fireEvent.click(button('Create Token'));
    await screen.findByText('One of the accounts no longer exists.');
    expect(button('Create Token')).toBeTruthy();
    fireEvent.click(button('Cancel'));
    expect(screen.queryByRole('button', { name: 'Create Token' })).toBeNull();
  });

  it('picks accounts and what the token may do, presets included', async () => {
    const t = await openForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Work' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Personal' }));
    fireEvent.click(button('Read and Draft'));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Read what is typed in the message box' }),
    );
    fireEvent.click(button('Read Only'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Read the open chat’s latest messages' }));
    fireEvent.click(button('Create Token'));
    await waitFor(() => {
      expect(t.agents.create).toHaveBeenCalledWith(
        expect.objectContaining({ accounts: [OTHER], scopes: ['chat:read-unread-summary'] }),
      );
    });
  });

  it('makes a sending token list its chats, expire soon, and warns about it', async () => {
    const t = await openForm();
    fireEvent.change(screen.getByRole('combobox', { name: /Expires/ }), {
      target: { value: 'never' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send messages, without asking you' }));
    expect(screen.getByText(/can be tricked by a message someone sends you/)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'All chats' }).disabled).toBe(true);
    const expiry = screen.getByRole<HTMLSelectElement>('combobox', { name: /Expires/ });
    expect(expiry.value).toBe('30');
    expect([...expiry.options].map((option) => option.value)).toEqual(['1', '7', '30']);
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: /Chat name/ });
    const number = screen.getByRole('textbox', { name: /International number/ });
    expect(button('Add').hasAttribute('disabled')).toBe(true);
    fireEvent.input(name, { target: { value: ' Eva ' } });
    fireEvent.click(button('Add'));
    // The open chat's name goes in the field, for a number to go with it.
    fireEvent.click(button('Use the Open Chat'));
    await waitFor(() => {
      expect(name.value).toBe('Rui');
    });
    fireEvent.input(number, { target: { value: '+44 7700 900123' } });
    fireEvent.click(button('Add'));
    // Enter adds the chat rather than creating the token before it is listed.
    fireEvent.keyDown(number, { key: 'Enter' });
    expect(t.agents.create).not.toHaveBeenCalled();
    fireEvent.keyDown(name, { key: 'a' });
    fireEvent.input(number, { target: { value: '+44 7700 900456' } });
    fireEvent.keyDown(number, { key: 'Enter' });
    // The same entry again replaces it rather than listing it twice.
    fireEvent.input(number, { target: { value: '+44 7700 900456' } });
    fireEvent.click(button('Add'));
    await screen.findByText('Rui · +44 7700 900123');
    expect(screen.getAllByText('+44 7700 900456')).toHaveLength(1);
    fireEvent.click(button('Remove Eva'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Notify me each time it sends' }));
    fireEvent.change(expiry, { target: { value: '7' } });
    fireEvent.click(button('Create Token'));
    await waitFor(() => {
      expect(t.agents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: ['chat:read-unread-summary', 'chat:read-active', 'messages:send'],
          chats: [
            { name: 'Rui', phone: '+44 7700 900123' },
            { name: null, phone: '+44 7700 900456' },
          ],
          expiresInDays: 7,
          notify: false,
        }),
      );
    });
  });

  it('says when no chat is open to add, and keeps the list as it was', async () => {
    const t = await openForm();
    t.agents.openChat.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('radio', { name: 'Only these chats' }));
    fireEvent.click(button('Use the Open Chat'));
    await screen.findByText('No chat is open in that account.');
    fireEvent.click(screen.getByRole('radio', { name: 'All chats' }));
    expect(screen.queryByRole('button', { name: 'Use the Open Chat' })).toBeNull();
    fireEvent.click(button('Create Token'));
    await waitFor(() => {
      expect(t.agents.create).toHaveBeenCalledWith(expect.objectContaining({ chats: 'all' }));
    });
  });

  it('cannot add the open chat with no account chosen', async () => {
    await openForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Personal' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Only these chats' }));
    expect(screen.queryByRole('button', { name: 'Use the Open Chat' })).toBeNull();
  });

  it('sets limits, lifts them, and warns when sending is unlimited', async () => {
    const t = await openForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send messages, without asking you' }));
    const calls = screen.getByRole('spinbutton', { name: /Calls a minute/ });
    fireEvent.input(calls, { target: { value: '12.4' } });
    fireEvent.input(screen.getByRole('spinbutton', { name: /Messages sent a minute/ }), {
      target: { value: '0' },
    });
    fireEvent.input(screen.getByRole('spinbutton', { name: /Messages sent a day/ }), {
      target: { value: '9999999' },
    });
    const unlimited = screen.getAllByRole('checkbox', { name: 'Unlimited' });
    fireEvent.click(nth(unlimited, 1));
    expect(screen.getByText(/With no limit, nothing slows down/)).toBeTruthy();
    fireEvent.click(nth(unlimited, 0));
    fireEvent.click(nth(unlimited, 0));
    fireEvent.input(screen.getByRole('textbox', { name: /Chat name/ }), {
      target: { value: 'Ana' },
    });
    fireEvent.click(button('Add'));
    fireEvent.click(button('Create Token'));
    await waitFor(() => {
      expect(t.agents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          limits: { callsPerMinute: 60, sendsPerMinute: null, sendsPerDay: 100_000 },
        }),
      );
    });
  });

  it('turns a number it cannot read into the lowest limit', async () => {
    const t = await openForm();
    fireEvent.input(screen.getByRole('spinbutton', { name: /Calls a minute/ }), {
      target: { value: 'abc' },
    });
    fireEvent.click(button('Create Token'));
    await waitFor(() => {
      expect(t.agents.create).toHaveBeenCalledWith(
        expect.objectContaining({ limits: { ...DEFAULT_AGENT_LIMITS, callsPerMinute: 1 } }),
      );
    });
  });

  it('lets a token that only reads last forever, ignoring a choice the list does not offer', async () => {
    const t = await openForm();
    fireEvent.change(screen.getByRole('combobox', { name: /Expires/ }), {
      target: { value: 'never' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /Expires/ }), {
      target: { value: 'soon' },
    });
    fireEvent.click(button('Create Token'));
    await waitFor(() => {
      expect(t.agents.create).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInDays: null }),
      );
    });
  });
});
