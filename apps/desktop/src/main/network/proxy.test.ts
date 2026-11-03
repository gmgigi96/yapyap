import { describe, expect, it, vi } from 'vitest';
import { fakeSettings } from '../../../test/fake-settings.ts';
import type { Settings } from '../settings/schema.ts';
import { followProxySetting, launchProxyOf, proxyConfigOf, webRtcPolicyOf } from './proxy.ts';

const network = (proxyMode: Settings['network']['proxyMode'], proxyServer = '') => ({
  proxyMode,
  proxyServer,
});

const BLOCKED = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:1' };
const SYSTEM = { mode: 'system' } as const;

const session = () => ({
  setProxy: vi.fn<(config: unknown) => Promise<void>>(() => Promise.resolve()),
  closeAllConnections: vi.fn(() => Promise.resolve()),
});

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('proxyConfigOf', () => {
  it('follows the system, goes direct, or uses the proxy named', () => {
    expect(proxyConfigOf(network('system'), SYSTEM)).toEqual({ mode: 'system' });
    expect(proxyConfigOf(network('direct'), SYSTEM)).toEqual({ mode: 'direct' });
    expect(proxyConfigOf(network('manual', 'socks5://127.0.0.1:1080'), SYSTEM)).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'socks5://127.0.0.1:1080',
    });
  });

  it('blocks connections when a manual proxy has no address, rather than going direct', () => {
    expect(proxyConfigOf(network('manual'), SYSTEM)).toEqual(BLOCKED);
  });

  it('lets proxy switches on the command line stand in for the system, and only for it', () => {
    const launch = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:9' } as const;
    expect(proxyConfigOf(network('system'), launch)).toBe(launch);
    expect(proxyConfigOf(network('direct'), launch)).toEqual({ mode: 'direct' });
  });
});

describe('launchProxyOf', () => {
  const switches = (values: Record<string, string>) => ({
    hasSwitch: (name: string) => name in values,
    getSwitchValue: (name: string) => values[name] ?? '',
  });

  it('follows the system when the command line names no proxy', () => {
    expect(launchProxyOf(switches({}))).toEqual({ mode: 'system' });
  });

  it('takes Chromium’s proxy switches, as any Chromium browser does', () => {
    expect(launchProxyOf(switches({ 'no-proxy-server': '' }))).toEqual({ mode: 'direct' });
    expect(
      launchProxyOf(switches({ 'proxy-pac-url': 'http://wpad.example.org/proxy.pac' })),
    ).toEqual({
      mode: 'pac_script',
      pacScript: 'http://wpad.example.org/proxy.pac',
    });
    expect(launchProxyOf(switches({ 'proxy-server': 'socks5://127.0.0.1:1080' }))).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'socks5://127.0.0.1:1080',
    });
    expect(
      launchProxyOf(
        switches({ 'proxy-server': 'http://127.0.0.1:3128', 'proxy-bypass-list': '*.example.org' }),
      ),
    ).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'http://127.0.0.1:3128',
      proxyBypassRules: '*.example.org',
    });
  });
});

describe('webRtcPolicyOf', () => {
  it('keeps calls inside a manual proxy, and local addresses private otherwise', () => {
    expect(webRtcPolicyOf(network('manual', 'http://p:8080'))).toBe('disable_non_proxied_udp');
    expect(webRtcPolicyOf(network('system'))).toBe('default_public_interface_only');
    expect(webRtcPolicyOf(network('direct'))).toBe('default_public_interface_only');
  });
});

describe('followProxySetting', () => {
  it('applies the setting to each session before it loads, and again on every change', async () => {
    const settings = fakeSettings({ network: network('system') });
    const proxy = followProxySetting(settings, vi.fn(), SYSTEM);
    const first = session();
    await proxy.guard(first);
    expect(first.setProxy).toHaveBeenCalledWith({ mode: 'system' });
    settings.change({ network: network('manual', 'http://proxy.example.org:3128') });
    await settle();
    expect(first.setProxy).toHaveBeenLastCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://proxy.example.org:3128',
    });
    expect(first.closeAllConnections).toHaveBeenCalledOnce();
  });

  it('blocks a session whose proxy could not be applied, saying so without the address', async () => {
    const settings = fakeSettings({ network: network('manual', 'socks5://10.0.0.2:1080') });
    const warn = vi.fn();
    const proxy = followProxySetting(settings, warn, SYSTEM);
    const broken = session();
    broken.setProxy.mockRejectedValueOnce(new Error('bad rules'));
    await proxy.guard(broken);
    expect(broken.setProxy).toHaveBeenLastCalledWith(BLOCKED);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Could not apply the proxy setting; connections stay blocked until it works.',
    );
    const worse = session();
    worse.setProxy.mockRejectedValue(new Error('gone'));
    await expect(proxy.guard(worse)).resolves.toBeUndefined();
  });
});

describe('calls and accounts with their own proxy', () => {
  const page = () => ({ setWebRTCIPHandlingPolicy: vi.fn(), isDestroyed: vi.fn(() => false) });

  it('keeps a page’s WebRTC policy in step with the proxy it uses', () => {
    const settings = fakeSettings({ network: network('system') });
    const proxy = followProxySetting(settings, vi.fn(), SYSTEM);
    const work = page();
    proxy.guardCalls(work, 'work');
    settings.change({ network: network('manual', 'http://p:8080') });
    expect(work.setWebRTCIPHandlingPolicy.mock.calls).toEqual([
      ['default_public_interface_only'],
      ['disable_non_proxied_udp'],
    ]);
  });

  it('puts an account with its own proxy on it, and the others on the setting', async () => {
    const settings = fakeSettings({ network: network('direct') });
    const proxy = followProxySetting(settings, vi.fn(), SYSTEM);
    proxy.useAccounts([{ id: 'work', proxy: 'socks5://10.0.0.2:1080' }, { id: 'home' }]);
    const work = session();
    const home = session();
    const shared = session();
    await proxy.guard(work, 'work');
    await proxy.guard(home, 'home');
    await proxy.guard(shared);
    expect(work.setProxy).toHaveBeenLastCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'socks5://10.0.0.2:1080',
    });
    expect(home.setProxy).toHaveBeenLastCalledWith({ mode: 'direct' });
    expect(shared.setProxy).toHaveBeenLastCalledWith({ mode: 'direct' });
    const calls = page();
    proxy.guardCalls(calls, 'work');
    expect(calls.setWebRTCIPHandlingPolicy).toHaveBeenLastCalledWith('disable_non_proxied_udp');
  });

  it('applies a changed account proxy to that account alone, and skips pages that are gone', async () => {
    const settings = fakeSettings({ network: network('system') });
    const proxy = followProxySetting(settings, vi.fn(), SYSTEM);
    proxy.useAccounts([{ id: 'work' }, { id: 'home' }]);
    const work = session();
    const home = session();
    await proxy.guard(work, 'work');
    await proxy.guard(home, 'home');
    const gone = page();
    gone.isDestroyed.mockReturnValue(true);
    proxy.guardCalls(gone, 'work');
    const homeCalls = page();
    proxy.guardCalls(homeCalls, 'home');
    proxy.useAccounts([{ id: 'work', proxy: 'http://proxy.example.org:3128' }, { id: 'home' }]);
    await settle();
    expect(work.setProxy).toHaveBeenLastCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://proxy.example.org:3128',
    });
    expect(work.closeAllConnections).toHaveBeenCalledOnce();
    expect(home.setProxy).toHaveBeenCalledOnce();
    expect(gone.setWebRTCIPHandlingPolicy).toHaveBeenCalledOnce();
    expect(homeCalls.setWebRTCIPHandlingPolicy).toHaveBeenCalledOnce();
    proxy.useAccounts([{ id: 'work', proxy: 'http://proxy.example.org:3128' }]);
    expect(work.setProxy).toHaveBeenCalledTimes(2);
  });
});
