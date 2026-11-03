import { describe, expect, it } from 'vitest';
import { resolveWhatsAppOrigin, WHATSAPP_ORIGIN } from './whatsapp-origin.ts';

const real = { origin: WHATSAPP_ORIGIN, overridden: false, rejectedOverride: false };
const rejected = { origin: WHATSAPP_ORIGIN, overridden: false, rejectedOverride: true };

describe('WHATSAPP_ORIGIN', () => {
  it('is the official WhatsApp Web origin', () => {
    expect(WHATSAPP_ORIGIN).toBe('https://web.whatsapp.com');
  });
});

describe('resolveWhatsAppOrigin', () => {
  it('uses the real WhatsApp origin when no override is set', () => {
    expect(resolveWhatsAppOrigin(undefined)).toEqual(real);
    expect(resolveWhatsAppOrigin('')).toEqual(real);
  });

  it.each(['http://127.0.0.1:5173', 'http://localhost:8080', 'http://127.0.0.1:5173/'])(
    'accepts the loopback origin %s',
    (candidate) => {
      const result = resolveWhatsAppOrigin(candidate);
      expect(result.overridden).toBe(true);
      expect(result.rejectedOverride).toBe(false);
      expect(result.origin).toBe(new URL(candidate).origin);
    },
  );

  it.each([
    'not a url',
    'https://127.0.0.1:5173',
    'http://example.com',
    'http://127.0.0.2:5173',
    'http://localhost.example.com',
    'http://127.0.0.1:5173/path',
    'http://127.0.0.1:5173/?q=1',
    'http://127.0.0.1:5173/#frag',
    'http://user@127.0.0.1:5173',
    'http://:secret@127.0.0.1:5173',
    'file:///etc/passwd',
  ])('rejects %s and falls back to the real origin', (candidate) => {
    expect(resolveWhatsAppOrigin(candidate)).toEqual(rejected);
  });
});
