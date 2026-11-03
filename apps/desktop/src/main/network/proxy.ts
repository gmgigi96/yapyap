import type { Settings } from '../settings/schema.ts';
import type { SettingsService } from '../settings/service.ts';
import { livePages } from '../support/live-pages.ts';

/** Electron's proxy configuration, as far as YapYap uses it. */
type ProxyConfig =
  | { readonly mode: 'system' }
  | { readonly mode: 'direct' }
  | { readonly mode: 'pac_script'; readonly pacScript: string }
  | {
      readonly mode: 'fixed_servers';
      readonly proxyRules: string;
      readonly proxyBypassRules?: string;
    };

export interface ProxiedSession {
  setProxy(config: ProxyConfig): Promise<void>;
  /** Drops connections made under the old setting, so none outlives a change. */
  closeAllConnections(): Promise<void>;
}

/** How WebRTC may pick network paths (Electron's `setWebRTCIPHandlingPolicy`). */
export type WebRtcPolicy = 'default_public_interface_only' | 'disable_non_proxied_udp';

export interface WebRtcPage {
  setWebRTCIPHandlingPolicy(policy: WebRtcPolicy): void;
  isDestroyed(): boolean;
}

/**
 * Where nothing can go: a closed port on this computer. A proxy setting that
 * cannot be used blocks connections instead of letting them go direct.
 */
const BLOCKED: ProxyConfig = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:1' };

/** Chromium's command line, which can name a proxy for one launch. */
export interface ProxySwitches {
  hasSwitch(name: string): boolean;
  getSwitchValue(name: string): string;
}

/**
 * What following the system means for this launch. Chromium's own proxy
 * switches win over the system's settings, as in any Chromium browser, and
 * the system mode would silently drop them.
 */
export function launchProxyOf(switches: ProxySwitches): ProxyConfig {
  if (switches.hasSwitch('no-proxy-server')) {
    return { mode: 'direct' };
  }
  const pac = switches.getSwitchValue('proxy-pac-url');
  if (pac !== '') {
    return { mode: 'pac_script', pacScript: pac };
  }
  const server = switches.getSwitchValue('proxy-server');
  if (server === '') {
    return { mode: 'system' };
  }
  const bypass = switches.getSwitchValue('proxy-bypass-list');
  return {
    mode: 'fixed_servers',
    proxyRules: server,
    ...(bypass === '' ? {} : { proxyBypassRules: bypass }),
  };
}

export function proxyConfigOf(
  { proxyMode, proxyServer }: Settings['network'],
  launch: ProxyConfig,
): ProxyConfig {
  if (proxyMode === 'system') {
    return launch;
  }
  if (proxyMode === 'direct') {
    return { mode: 'direct' };
  }
  return proxyServer === '' ? BLOCKED : { mode: 'fixed_servers', proxyRules: proxyServer };
}

/**
 * Calls must not reveal the real address around a manual proxy, so WebRTC
 * then sends only through it, which may leave calls to relays. Otherwise
 * WebRTC still keeps local addresses private (ADR 0008, C23).
 */
export function webRtcPolicyOf(network: Settings['network']): WebRtcPolicy {
  return network.proxyMode === 'manual'
    ? 'disable_non_proxied_udp'
    : 'default_public_interface_only';
}

async function applyTo(
  session: ProxiedSession,
  config: ProxyConfig,
  warn: (message: string) => void,
): Promise<void> {
  try {
    await session.setProxy(config);
  } catch {
    // The proxy address is not logged: it can name a private host.
    warn('Could not apply the proxy setting; connections stay blocked until it works.');
    await session.setProxy(BLOCKED).catch(() => undefined);
  }
}

export interface ProxyController {
  /** Applies the proxy to a session, its account's own if it has one; resolves once loads may start. */
  readonly guard: (session: ProxiedSession, account?: string) => Promise<void>;
  /** Keeps an account page's WebRTC policy in step with the proxy it uses. */
  readonly guardCalls: (page: WebRtcPage, account: string) => void;
  /** Learns each account's own proxy (#76), and applies the ones that changed. */
  readonly useAccounts: (
    accounts: readonly { readonly id: string; readonly proxy?: string }[],
  ) => void;
}

/** The sessions and pages to keep on a proxy, and the proxy each account names. */
function proxyState(
  settings: Pick<SettingsService, 'current'>,
  launch: ProxyConfig,
  warn: (message: string) => void,
) {
  const sessions = new Map<ProxiedSession, string | undefined>();
  const pages = new Map<WebRtcPage, string>();
  const own = new Map<string, string>();
  const ownOf = (account: string | undefined): string =>
    account === undefined ? '' : (own.get(account) ?? '');
  const configFor = (account: string | undefined): ProxyConfig => {
    const server = ownOf(account);
    return server === ''
      ? proxyConfigOf(settings.current().network, launch)
      : { mode: 'fixed_servers', proxyRules: server };
  };
  const callPolicy = (page: WebRtcPage, account: string): void => {
    // An account's own proxy is manual, so calls stay inside it too (C23).
    const policy =
      ownOf(account) === ''
        ? webRtcPolicyOf(settings.current().network)
        : 'disable_non_proxied_udp';
    page.setWebRTCIPHandlingPolicy(policy);
  };
  const refreshSession = (session: ProxiedSession, account: string | undefined): void => {
    void applyTo(session, configFor(account), warn).then(() => session.closeAllConnections());
  };
  return { sessions, pages, own, ownOf, configFor, callPolicy, refreshSession };
}

/** Everything, or only what belongs to one account. */
const matches = (account: string | undefined, only: string | undefined): boolean =>
  only === undefined || account === only;

/** Applies the proxy again to everything, or to one account's session and pages. */
function refresh(state: ReturnType<typeof proxyState>, only?: string): void {
  for (const [session, account] of state.sessions) {
    if (matches(account, only)) {
      state.refreshSession(session, account);
    }
  }
  for (const [page, account] of livePages(state.pages)) {
    if (matches(account, only)) {
      state.callPolicy(page, account);
    }
  }
}

/**
 * Keeps every session on its proxy through every change (#76): an account
 * with its own proxy uses that, everything else the proxy the settings name.
 */
export function followProxySetting(
  settings: Pick<SettingsService, 'current' | 'onChange'>,
  warn: (message: string) => void,
  launch: ProxyConfig,
): ProxyController {
  const state = proxyState(settings, launch, warn);
  settings.onChange(() => {
    refresh(state);
  });
  return {
    guard: (session, account) => {
      state.sessions.set(session, account);
      return applyTo(session, state.configFor(account), warn);
    },
    guardCalls: (page, account) => {
      state.pages.set(page, account);
      state.callPolicy(page, account);
    },
    useAccounts: (accounts) => {
      for (const { id, proxy = '' } of accounts) {
        if (state.ownOf(id) !== proxy) {
          state.own.set(id, proxy);
          refresh(state, id);
        }
      }
    },
  };
}
