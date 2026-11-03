/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { ChromeApi, RecoveryProblem } from '../../shared/api/chrome-api.ts';
import { Recovery } from './Recovery.tsx';

function api(
  problem: Promise<RecoveryProblem | null>,
  overrides: Partial<ChromeApi['recovery']> = {},
) {
  return fakeChromeApi({
    recovery: {
      problem: vi.fn(() => problem),
      retry: vi.fn(() => Promise.resolve()),
      clearCache: vi.fn(() => Promise.resolve()),
      copyDiagnostics: vi.fn(() => Promise.resolve()),
      ...overrides,
    },
  });
}

const problem = (kind: RecoveryProblem['kind']) =>
  Promise.resolve<RecoveryProblem>({ kind, description: 'details' });

describe('Recovery', () => {
  afterEach(() => {
    cleanup();
  });

  it.each<[RecoveryProblem['kind'], string, RegExp]>([
    ['unsupported', 'WhatsApp says this browser is not supported', /check for a YapYap update/],
    ['blank', 'WhatsApp did not finish loading', /stays blank/],
    ['load-failed', 'WhatsApp could not be reached', /internet connection/],
    ['crashed', 'WhatsApp keeps stopping', /keeps happening/],
  ])('explains a %s problem', async (kind, title, advice) => {
    render(<Recovery api={api(problem(kind))} />);
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByText(advice)).toBeTruthy();
  });

  it('falls back to the blank-page explanation when the problem is unknown', async () => {
    render(<Recovery api={api(Promise.reject(new Error('gone')))} />);
    expect(
      await screen.findByRole('heading', { name: 'WhatsApp did not finish loading' }),
    ).toBeTruthy();
  });

  it.each<[string, keyof ChromeApi['recovery'], string]>([
    ['Try Again', 'retry', 'Retrying…'],
    ['Clear Cache and Try Again', 'clearCache', 'Cache cleared. Retrying…'],
    ['Copy Diagnostics', 'copyDiagnostics', 'Diagnostics copied to the clipboard.'],
  ])('runs "%s" and announces it', async (label, action, status) => {
    const recoveryApi = api(problem('blank'));
    render(<Recovery api={recoveryApi} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(await screen.findByText(status)).toBeTruthy();
    expect(recoveryApi.recovery[action]).toHaveBeenCalledOnce();
  });

  it('announces a failed action', async () => {
    render(
      <Recovery api={api(problem('blank'), { retry: () => Promise.reject(new Error('no')) })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('That did not work. Try again.')).toBeTruthy();
  });

  it('reassures that clearing the cache keeps the login', () => {
    render(<Recovery api={api(problem('blank'))} />);
    expect(screen.getByText('Clearing the cache keeps you logged in.')).toBeTruthy();
  });
});
