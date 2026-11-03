import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bearerOf, MAX_BODY_BYTES, refusalOf, type ArrivingRequest } from './request-checks.ts';

const PORT = 51_234;

const request = (overrides: Partial<ArrivingRequest> = {}): ArrivingRequest => ({
  remoteAddress: '127.0.0.1',
  method: 'POST',
  url: '/mcp',
  ...overrides,
  headers: {
    host: `127.0.0.1:${String(PORT)}`,
    'content-type': 'application/json',
    ...overrides.headers,
  },
});

describe('refusalOf', () => {
  it('lets an agent’s call on this computer through', () => {
    expect(refusalOf(request(), PORT)).toBeUndefined();
    expect(refusalOf(request({ remoteAddress: '::ffff:127.0.0.1' }), PORT)).toBeUndefined();
    expect(
      refusalOf(request({ headers: { host: `localhost:${String(PORT)}` } }), PORT),
    ).toBeUndefined();
    const charset = { 'content-type': 'Application/JSON; charset=utf-8' };
    expect(refusalOf(request({ headers: charset }), PORT)).toBeUndefined();
    const length = { 'content-length': String(MAX_BODY_BYTES) };
    expect(refusalOf(request({ headers: length }), PORT)).toBeUndefined();
  });

  it.each([
    ['another computer', { remoteAddress: '192.0.2.7' }],
    ['another computer, IPv4-mapped', { remoteAddress: '::ffff:192.0.2.7' }],
    ['loopback written after another prefix', { remoteAddress: '::fffe:127.0.0.1' }],
    ['a closed socket', { remoteAddress: undefined }],
    ['IPv6 loopback, which YapYap never listens on', { remoteAddress: '::1' }],
  ])('refuses %s', (_case, overrides) => {
    expect(refusalOf(request(overrides), PORT)).toEqual({ status: 403 });
  });

  it.each([
    ['a rebound name', 'attacker.example:51234'],
    ['another port', '127.0.0.1:80'],
    ['no port', '127.0.0.1'],
  ])('refuses %s as its host, as DNS rebinding would send', (_case, host) => {
    expect(refusalOf(request({ headers: { host } }), PORT)).toEqual({ status: 403 });
  });

  it('refuses a request without a host, or with several', () => {
    expect(refusalOf(request({ headers: { host: undefined } }), PORT)).toEqual({ status: 403 });
    const twice = { host: ['127.0.0.1:51234', '127.0.0.1:51234'] };
    expect(refusalOf(request({ headers: twice }), PORT)).toEqual({ status: 403 });
  });

  it('refuses anything a browser page sends, which always names its origin', () => {
    const page = { origin: 'https://example.com' };
    expect(refusalOf(request({ headers: page }), PORT)).toEqual({ status: 403 });
    expect(refusalOf(request({ headers: { origin: 'null' } }), PORT)).toEqual({ status: 403 });
  });

  it('answers only POST on /mcp, in JSON, of a small size', () => {
    expect(refusalOf(request({ url: '/' }), PORT)).toEqual({ status: 404 });
    expect(refusalOf(request({ url: '/mcp?x=1' }), PORT)).toEqual({ status: 404 });
    expect(refusalOf(request({ method: 'GET' }), PORT)).toEqual({ status: 405 });
    expect(refusalOf(request({ method: undefined }), PORT)).toEqual({ status: 405 });
    const form = { 'content-type': 'text/plain' };
    expect(refusalOf(request({ headers: form }), PORT)).toEqual({ status: 415 });
    expect(refusalOf(request({ headers: { 'content-type': undefined } }), PORT)).toEqual({
      status: 415,
    });
    const large = { 'content-length': String(MAX_BODY_BYTES + 1) };
    expect(refusalOf(request({ headers: large }), PORT)).toEqual({ status: 413 });
  });

  it('never lets through a request that names any origin', () => {
    fc.assert(
      fc.property(fc.string(), (origin) => {
        expect(refusalOf(request({ headers: { origin } }), PORT)).toEqual({ status: 403 });
      }),
    );
  });
});

describe('bearerOf', () => {
  const withAuth = (authorization: string | undefined) => request({ headers: { authorization } });

  it('reads a bearer token, whatever the case of the scheme', () => {
    expect(bearerOf(withAuth('Bearer abc'))).toBe('abc');
    expect(bearerOf(withAuth('bearer abc'))).toBe('abc');
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer a b'])('reads none from %j', (auth) => {
    expect(bearerOf(withAuth(auth))).toBeUndefined();
  });
});
