import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WHATSAPP_ORIGIN, resolveWhatsAppOrigin } from './whatsapp-origin.ts';

const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

function isLoopbackHttp(candidate: string): boolean {
  const url = new URL(candidate);
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
}

describe('resolveWhatsAppOrigin properties', () => {
  it('only ever resolves to WhatsApp or a loopback HTTP origin', () => {
    const override = fc.option(fc.oneof(fc.string(), fc.webUrl()), { nil: undefined });
    fc.assert(
      fc.property(override, (candidate) => {
        const { origin, overridden, rejectedOverride } = resolveWhatsAppOrigin(candidate);
        expect(overridden ? LOOPBACK_ORIGIN.test(origin) : origin === WHATSAPP_ORIGIN).toBe(true);
        expect(overridden && rejectedOverride).toBe(false);
      }),
    );
  });

  it('rejects every web URL that does not point at loopback over HTTP', () => {
    const remote = fc
      .webUrl({
        withQueryParameters: true,
        withFragments: true,
        authoritySettings: { withIPv4: true, withPort: true, withUserInfo: true },
      })
      .filter((candidate) => !isLoopbackHttp(candidate));
    fc.assert(
      fc.property(remote, (candidate) => {
        expect(resolveWhatsAppOrigin(candidate)).toEqual({
          origin: WHATSAPP_ORIGIN,
          overridden: false,
          rejectedOverride: true,
        });
      }),
    );
  });

  it('accepts a bare loopback origin on any port', () => {
    const host = fc.constantFrom('127.0.0.1', 'localhost');
    const port = fc.integer({ min: 1, max: 65_535 });
    fc.assert(
      fc.property(host, port, (hostname, portNumber) => {
        const candidate = `http://${hostname}:${String(portNumber)}`;
        expect(resolveWhatsAppOrigin(candidate)).toEqual({
          origin: new URL(candidate).origin,
          overridden: true,
          rejectedOverride: false,
        });
      }),
    );
  });
});
