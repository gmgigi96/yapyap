/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { AccountList, ChromeApi } from '../../shared/api/chrome-api.ts';
import { Accounts } from './Accounts.tsx';

const LIST: AccountList = {
  accounts: [
    {
      id: 'a',
      name: 'Personal',
      color: 'green',
      enabled: true,
      muted: true,
      proxy: '',
      active: false,
    },
    { id: 'b', name: 'Work', color: 'blue', enabled: true, muted: false, proxy: '', active: true },
    { id: 'c', name: 'Old', color: 'pink', enabled: false, muted: false, proxy: '', active: false },
  ],
  // A color this YapYap has no name for still shows, by its key.
  colors: ['green', 'blue', 'teal', 'pink'],
};

function api(list: () => Promise<AccountList> = () => Promise.resolve(LIST)) {
  const accounts = {
    list: vi.fn(list),
    save: vi.fn<ChromeApi['accounts']['save']>(() => Promise.resolve(LIST)),
    remove: vi.fn<ChromeApi['accounts']['remove']>(() => Promise.resolve(LIST)),
    permissions: vi.fn<ChromeApi['accounts']['permissions']>(() => Promise.resolve(['video'])),
    forgetPermissions: vi.fn<ChromeApi['accounts']['forgetPermissions']>(() => Promise.resolve([])),
  };
  const fake = fakeChromeApi({ accounts });
  return { fake, accounts };
}

const name = () => screen.getByLabelText<HTMLInputElement>('Name');
const button = (label: string) => screen.getByRole<HTMLButtonElement>('button', { name: label });

async function shown() {
  const t = api();
  render(<Accounts api={t.fake} />);
  await waitFor(() => {
    expect(name().value).toBe('Work');
  });
  return t;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Accounts', () => {
  it('lists every account, marking the one on screen and those that are off or muted', async () => {
    await shown();
    expect(screen.getByRole('list', { name: 'Your accounts' }).textContent).toContain('Old');
    expect(button('Work On screen').getAttribute('aria-pressed')).toBe('true');
    expect(button('Old Off').getAttribute('aria-pressed')).toBe('false');
    expect(button('Personal Muted').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('radio', { name: 'Teal' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'pink' })).toBeTruthy();
  });

  it('says so while loading and when the accounts are unavailable', async () => {
    const pending = api(() => new Promise(() => undefined));
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    render(<Accounts api={pending.fake} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    cleanup();
    render(<Accounts api={api(() => Promise.reject(new Error('gone'))).fake} />);
    await screen.findByText('Accounts are unavailable.');
    cleanup();
    render(<Accounts api={api(() => Promise.resolve({ accounts: [], colors: [] })).fake} />);
    await screen.findByText('Accounts are unavailable.');
  });

  it('takes a proxy for the account, and refuses to save one that does not fit', async () => {
    const t = await shown();
    const proxy = screen.getByLabelText<HTMLInputElement>('Proxy');
    fireEvent.input(proxy, { target: { value: 'proxy.example.org' } });
    expect(proxy.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/^Use http:\/\/, https:\/\/ or socks5:\/\//)).toBeTruthy();
    expect(button('Save').disabled).toBe(true);
    fireEvent.input(proxy, { target: { value: ' socks5://10.0.0.2:1080 ' } });
    expect(button('Save').disabled).toBe(false);
    fireEvent.click(button('Save'));
    expect(t.accounts.save).toHaveBeenCalledWith(
      'b',
      expect.objectContaining({ proxy: 'socks5://10.0.0.2:1080' }),
    );
  });

  it('keeps edits as a draft until saved, then shows what YapYap saved', async () => {
    const t = await shown();
    expect(button('Save').disabled).toBe(true);
    fireEvent.input(name(), { target: { value: 'Office' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    fireEvent.click(screen.getByLabelText('Run this account'));
    fireEvent.click(screen.getByLabelText('Mute this account'));
    fireEvent.click(button('Save'));
    expect(t.accounts.save).toHaveBeenCalledWith('b', {
      name: 'Office',
      color: 'teal',
      enabled: false,
      muted: true,
      proxy: '',
    });
    await waitFor(() => {
      expect(name().value).toBe('Work');
    });
  });

  it('cannot save a blank name, and Cancel brings back the saved one', async () => {
    await shown();
    fireEvent.input(name(), { target: { value: '  ' } });
    expect(button('Save').disabled).toBe(true);
    fireEvent.click(button('Cancel'));
    expect(name().value).toBe('Work');
  });

  it('explains a refused change and a failed one', async () => {
    const t = await shown();
    t.accounts.save.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('no'));
    fireEvent.input(name(), { target: { value: 'Office' } });
    fireEvent.click(button('Save'));
    await screen.findByText(/must keep running/);
    fireEvent.click(button('Save'));
    await screen.findByText('Could not save the account. Try again.');
  });

  it('switches accounts at once when nothing changed, and asks first when something did', async () => {
    await shown();
    fireEvent.click(button('Personal Muted'));
    expect(name().value).toBe('Personal');
    fireEvent.input(name(), { target: { value: 'Home' } });
    fireEvent.click(button('Work On screen'));
    expect(screen.getByRole('alertdialog').textContent).toContain('Discard your changes');
    fireEvent.click(button('Keep Editing'));
    expect(name().value).toBe('Home');
    fireEvent.click(button('Work On screen'));
    fireEvent.click(button('Discard'));
    expect(name().value).toBe('Work');
  });

  it('closes on Escape, asking first about unsaved changes', async () => {
    await shown();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    fireEvent.input(name(), { target: { value: 'Office' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(button('Discard'));
    expect(close).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('removes the selected account through YapYap, which asks the user', async () => {
    const t = await shown();
    t.accounts.remove.mockResolvedValueOnce({ ...LIST, accounts: LIST.accounts.slice(0, 2) });
    fireEvent.click(button('Old Off'));
    fireEvent.click(button('Remove Account…'));
    expect(t.accounts.remove).toHaveBeenCalledWith('c');
    await waitFor(() => {
      expect(name().value).toBe('Work');
    });
    t.accounts.remove.mockRejectedValueOnce(new Error('no'));
    fireEvent.click(button('Remove Account…'));
    await screen.findByText('Could not save the account. Try again.');
  });

  it('says why YapYap refused a removal', async () => {
    const t = await shown();
    t.accounts.remove.mockResolvedValueOnce(null);
    fireEvent.click(button('Remove Account…'));
    await screen.findByText(
      'At least one account must keep running, so this one cannot be removed.',
      {
        selector: '[role="alert"]',
      },
    );
    expect(name().value).toBe('Work');
  });

  it('offers no removal of the last running account, and says why', async () => {
    const [personal, work, old] = LIST.accounts;
    const only = [{ ...personal, enabled: false }, work, old] as AccountList['accounts'];
    render(<Accounts api={api(() => Promise.resolve({ ...LIST, accounts: only })).fake} />);
    await waitFor(() => {
      expect(name().value).toBe('Work');
    });
    expect(button('Remove Account…').disabled).toBe(true);
    expect(button('Remove Account…').getAttribute('aria-describedby')).toBe('remove-hint');
    expect(document.getElementById('remove-hint')?.textContent).toBe(
      'At least one account must keep running, so this one cannot be removed.',
    );
    fireEvent.click(button('Old Off'));
    expect(button('Remove Account…').disabled).toBe(false);
    expect(document.getElementById('remove-hint')).toBeNull();
  });

  it('shows what the account may use, and asks again for camera and microphone when told', async () => {
    const t = await shown();
    expect(await screen.findByText('Permissions')).toBeTruthy();
    const states = [...document.querySelectorAll('.permissions dd')].map((dd) => dd.textContent);
    expect(states).toEqual([
      'Allowed until YapYap quits',
      'Asks first',
      'Allowed; mute the account to silence them',
      'Asks every time',
    ]);
    fireEvent.click(button('Ask Again for Camera and Microphone'));
    expect(t.accounts.forgetPermissions).toHaveBeenCalledWith('b');
    await waitFor(() => {
      expect(button('Ask Again for Camera and Microphone').disabled).toBe(true);
    });
  });

  it('keeps showing the permissions when forgetting them fails', async () => {
    const t = await shown();
    t.accounts.forgetPermissions.mockRejectedValueOnce(new Error('gone'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ask Again for Camera and Microphone' }),
    );
    await waitFor(() => {
      expect(t.accounts.forgetPermissions).toHaveBeenCalled();
    });
    expect(screen.getByText('Allowed until YapYap quits')).toBeTruthy();
  });

  it('leaves permissions out for an account that is off, or when they cannot be read', async () => {
    const t = await shown();
    t.accounts.permissions.mockResolvedValueOnce(null);
    fireEvent.click(button('Old Off'));
    await waitFor(() => {
      expect(screen.queryByText('Permissions')).toBeNull();
    });
    t.accounts.permissions.mockRejectedValueOnce(new Error('gone'));
    fireEvent.click(button('Work On screen'));
    await waitFor(() => {
      expect(t.accounts.permissions).toHaveBeenLastCalledWith('b');
    });
    expect(screen.queryByText('Permissions')).toBeNull();
  });
});
