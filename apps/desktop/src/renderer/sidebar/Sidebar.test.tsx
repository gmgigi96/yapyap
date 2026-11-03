/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { SidebarState } from '../../shared/api/chrome-api.ts';
import { Sidebar } from './Sidebar.tsx';

const STATE: SidebarState = {
  accounts: [
    {
      id: 'a',
      name: 'personal',
      color: 'green',
      unread: 3,
      muted: false,
      active: false,
      sharing: false,
      avatar: undefined,
    },
    {
      id: 'b',
      name: 'Work',
      color: 'blue',
      unread: 0,
      muted: false,
      active: true,
      sharing: false,
      avatar: undefined,
    },
    {
      id: 'c',
      name: 'Shop',
      color: 'red',
      unread: 0,
      muted: true,
      active: false,
      sharing: false,
      avatar: undefined,
    },
    {
      id: 'd',
      name: 'Club',
      color: 'teal',
      unread: 120,
      muted: false,
      active: false,
      sharing: false,
      avatar: undefined,
    },
  ],
  compact: false,
  doNotDisturb: false,
};

function setup(state: () => Promise<SidebarState> = () => Promise.resolve(STATE)) {
  let push: ((next: SidebarState) => void) | undefined;
  const sidebar = {
    state: vi.fn(state),
    switchTo: vi.fn(() => Promise.resolve()),
    setCompact: vi.fn(() => Promise.resolve()),
    stopSharing: vi.fn(() => Promise.resolve()),
    onState: vi.fn((listener: (next: SidebarState) => void) => {
      push = listener;
    }),
  };
  render(<Sidebar api={fakeChromeApi({ sidebar })} />);
  return {
    sidebar,
    push: (next: SidebarState) => {
      void act(() => {
        push?.(next);
      });
    },
  };
}

afterEach(() => {
  cleanup();
});

describe('Sidebar', () => {
  it('lists the accounts with their initials, unread badges and muted marks', async () => {
    setup();
    const work = await screen.findByRole('button', { name: 'Work' });
    expect(work.getAttribute('aria-current')).toBe('page');
    const personal = screen.getByRole('button', { name: 'personal, 3 unread chats' });
    expect(personal.textContent).toBe('Ppersonal3');
    expect(personal.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'Shop, muted' }).querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Club, 120 unread chats' }).textContent).toBe(
      'CClub99+',
    );
    expect(screen.queryByText('Do not disturb')).toBeNull();
  });

  it('shows an account’s WhatsApp photo in place of its initial, once there is one', async () => {
    const t = setup();
    await screen.findByRole('button', { name: 'Work' });
    const photo = 'data:image/png;base64,AAAA';
    t.push({
      ...STATE,
      accounts: STATE.accounts.map((account) =>
        account.id === 'b' ? { ...account, avatar: photo } : account,
      ),
    });
    const work = screen.getByRole('button', { name: 'Work' });
    expect(work.querySelector('img')?.getAttribute('src')).toBe(photo);
    expect(work.textContent).toBe('Work');
    expect(screen.getByRole('button', { name: 'Shop, muted' }).querySelector('img')).toBeNull();
  });

  it('shows a running share beside its account, with a way to stop it', async () => {
    const t = setup();
    await screen.findByRole('button', { name: 'Work' });
    expect(screen.queryByRole('button', { name: /Stop sharing/ })).toBeNull();
    const sharing = STATE.accounts.map((account) => ({ ...account, sharing: account.id === 'b' }));
    t.push({ ...STATE, accounts: sharing });
    const stop = screen.getByRole('button', { name: 'Stop sharing your screen in Work' });
    expect(stop.textContent).toBe('Sharing');
    fireEvent.click(stop);
    expect(t.sidebar.stopSharing).toHaveBeenCalledWith('b');
    t.push({ ...STATE, accounts: sharing, compact: true });
    expect(
      screen.getByRole('button', { name: 'Stop sharing your screen in Work' }).textContent,
    ).toBe('');
  });

  it('switches to the account clicked', async () => {
    const t = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Work' }));
    expect(t.sidebar.switchTo).toHaveBeenCalledWith('b');
  });

  it('shows avatars only when compact, and switches between the layouts', async () => {
    const t = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Show only avatars' }));
    expect(t.sidebar.setCompact).toHaveBeenCalledWith(true);
    t.push({ ...STATE, compact: true, doNotDisturb: true });
    const work = screen.getByRole('button', { name: 'Work' });
    expect(work.textContent).toBe('W');
    expect(work.getAttribute('title')).toBe('Work');
    // The words are hidden from the eye only.
    expect(screen.getByText('Do not disturb').className).toBe('visually-hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Show account names' }));
    expect(t.sidebar.setCompact).toHaveBeenLastCalledWith(false);
  });

  it('says when do not disturb is on', async () => {
    const t = setup();
    await screen.findByRole('button', { name: 'Work' });
    t.push({ ...STATE, doNotDisturb: true });
    expect(screen.getByTitle('Do not disturb').textContent).toBe('Do not disturb');
  });

  it('keeps a state YapYap pushed before its first answer arrived', async () => {
    let answer: (state: SidebarState) => void = () => undefined;
    const t = setup(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    t.push({ ...STATE, accounts: [] });
    await act(async () => {
      answer(STATE);
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Work' })).toBeNull();
  });

  it('shows nothing until there is a state, or when asking fails', async () => {
    setup(() => Promise.reject(new Error('gone')));
    await act(() => Promise.resolve());
    expect(document.body.textContent).toBe('');
    cleanup();
    setup(() => new Promise<never>(() => undefined));
    await act(() => Promise.resolve());
    expect(document.body.textContent).toBe('');
  });
});
