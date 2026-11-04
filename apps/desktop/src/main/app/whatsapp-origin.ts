export const WHATSAPP_ORIGIN = 'https://web.whatsapp.com';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

export interface OriginResolution {
  readonly origin: string;
  readonly overridden: boolean;
  readonly rejectedOverride: boolean;
}

function isBareOrigin(url: URL): boolean {
  return (
    [url.search, url.hash, url.username, url.password].every((part) => part === '') &&
    url.pathname === '/'
  );
}

function parseLoopbackOrigin(candidate: string): string | undefined {
  if (!URL.canParse(candidate)) {
    return undefined;
  }
  const url = new URL(candidate);
  // Only plain-HTTP loopback is accepted so that a tampered environment can at
  // worst point YapYap at the user's own machine, never at a remote host.
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && isBareOrigin(url)
    ? url.origin
    : undefined;
}

/**
 * Resolves the origin YapYap loads as WhatsApp. Tests and package smoke tests
 * point it at a local fake page; anything else falls back to the real origin.
 */
export function resolveWhatsAppOrigin(override: string | undefined): OriginResolution {
  if (override === undefined || override === '') {
    return { origin: WHATSAPP_ORIGIN, overridden: false, rejectedOverride: false };
  }
  const origin = parseLoopbackOrigin(override);
  return origin === undefined
    ? { origin: WHATSAPP_ORIGIN, overridden: false, rejectedOverride: true }
    : { origin, overridden: true, rejectedOverride: false };
}
