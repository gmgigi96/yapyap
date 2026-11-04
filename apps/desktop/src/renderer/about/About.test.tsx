/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { AboutInfo, ChromeApi } from '../../shared/api/chrome-api.ts';
import { About, LINKS, SUPPORTER } from './About.tsx';

const INFO: AboutInfo = {
  name: 'YapYap',
  version: '0.1.0',
  channel: 'appimage',
  electron: '44.9.0',
  chromium: '152.0.7977.167',
  node: '24.22.0',
  os: 'linux 7.0.0 (x64)',
  license: 'MIT',
  graphics: 'software rendering (safe mode)',
};

function api(overrides: Partial<ChromeApi['about']> = {}): ChromeApi {
  return fakeChromeApi({
    about: {
      info: vi.fn(() => Promise.resolve(INFO)),
      copyTechnicalDetails: vi.fn(() => Promise.resolve()),
      ...overrides,
    },
  });
}

describe('About', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the version, channel, engines, OS, graphics and license', async () => {
    render(<About api={api()} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(await screen.findByText('0.1.0 (appimage)')).toBeTruthy();
    for (const value of ['44.9.0', '152.0.7977.167', '24.22.0', 'linux 7.0.0 (x64)', 'MIT']) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(screen.getByText('software rendering (safe mode)')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'YapYap' })).toBeTruthy();
  });

  it('says so when the details cannot be loaded', async () => {
    render(<About api={api({ info: () => Promise.reject(new Error('rejected')) })} />);
    expect(await screen.findByText('Details are unavailable.')).toBeTruthy();
  });

  it('states that YapYap is unofficial', () => {
    render(<About api={api()} />);
    expect(
      screen.getByText(/not affiliated with, endorsed by, or sponsored by WhatsApp or Meta/),
    ).toBeTruthy();
  });

  it('links to the website, source, issues, privacy policy and sponsorship, then the supporter, in new windows', () => {
    render(<About api={api()} />);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ...LINKS.map(({ label, href }) => [label, href]),
      ['Ensita', 'https://www.ensita.org/'],
    ]);
    expect(links.every((link) => link.getAttribute('target') === '_blank')).toBe(true);
    expect(screen.getByText(/Development supported by/).textContent).toBe(
      `Development supported by ${SUPPORTER.name}.`,
    );
  });

  it('copies the technical details and announces the result', async () => {
    const about = api();
    render(<About api={about} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Technical Details' }));
    expect(await screen.findByText('Copied to the clipboard.')).toBeTruthy();
    expect(about.about.copyTechnicalDetails).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('Copied to the clipboard.');
  });

  it('announces when copying fails', async () => {
    render(<About api={api({ copyTechnicalDetails: () => Promise.reject(new Error('no')) })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Technical Details' }));
    expect(await screen.findByText('Could not copy the details.')).toBeTruthy();
  });
});
