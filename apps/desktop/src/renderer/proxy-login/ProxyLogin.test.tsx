/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { ProxyLoginRequest } from '../../shared/api/chrome-api.ts';
import { ProxyLogin } from './ProxyLogin.tsx';

function api(request: Partial<ProxyLoginRequest> = {}) {
  return fakeChromeApi({
    proxyLogin: {
      request: vi.fn(() =>
        Promise.resolve({
          host: 'proxy.example.org',
          port: 3128,
          failed: false,
          canRemember: true,
          ...request,
        }),
      ),
      answer: vi.fn(() => Promise.resolve()),
    },
  });
}

const signIn = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Sign In' });
const remember = () =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: 'Remember on this computer' });

describe('ProxyLogin', () => {
  afterEach(() => {
    cleanup();
  });

  it('names the proxy and signs in once a username is given', async () => {
    const yapyap = api();
    render(<ProxyLogin api={yapyap} />);
    expect(
      await screen.findByText('The proxy proxy.example.org:3128 asks for a username and password.'),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(signIn().disabled).toBe(true);
    fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'ana' } });
    const password = screen.getByLabelText<HTMLInputElement>('Password');
    expect(password.type).toBe('password');
    fireEvent.input(password, { target: { value: 'hunter2' } });
    fireEvent.click(remember());
    fireEvent.click(signIn());
    expect(yapyap.proxyLogin.answer).toHaveBeenCalledExactlyOnceWith({
      username: 'ana',
      password: 'hunter2',
      remember: true,
    });
  });

  it('says when the last attempt failed, and cancels', async () => {
    const yapyap = api({ failed: true });
    render(<ProxyLogin api={yapyap} />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The proxy did not accept that username and password. Try again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(yapyap.proxyLogin.answer).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('cannot remember where the computer has no keychain', async () => {
    const yapyap = api({ canRemember: false });
    render(<ProxyLogin api={yapyap} />);
    await screen.findByText(/asks for a username/);
    expect(remember().disabled).toBe(true);
    expect(screen.getByText(/no keychain YapYap can use/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'ana' } });
    fireEvent.click(signIn());
    expect(yapyap.proxyLogin.answer).toHaveBeenCalledWith(
      expect.objectContaining({ remember: false }),
    );
  });
});
