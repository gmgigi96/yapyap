import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareVersions } from './version.ts';

/** The sign of an order, with -0 folded into 0, which `toBe` tells apart. */
const sign = (order: number): number => Math.sign(order) || 0;

const word = fc.stringMatching(/^[A-Za-z-][0-9A-Za-z-]{0,5}$/);
const identifier = fc.oneof(fc.nat({ max: 99 }).map(String), word);
const release = fc.array(fc.nat({ max: 999 }), { minLength: 1, maxLength: 4 });
const prerelease = fc.array(identifier, { minLength: 1, maxLength: 3 });
const version = fc
  .tuple(fc.boolean(), release, fc.option(prerelease, { nil: undefined }))
  .map(
    ([prefixed, numbers, pre]) =>
      `${prefixed ? 'v' : ''}${numbers.join('.')}${pre === undefined ? '' : `-${pre.join('.')}`}`,
  );

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.0-beta.1', '1.0.0-beta.1', 0],
    ['v1.0.0', '1.0.0', 0],
    ['26.08', '26.8.0', 0],
    ['nightly', '0.0.0', 0],
    ['1.0.0+build', '0.0.0', 0],
    ['1.0.0-', '0.0.0', 0],
    ['1.0.0-beta..1', '0.0.0', 0],
    ['0.0.1', 'nightly', 1],
    ['1.0.1', '1.0.0', 1],
    ['1.1.0', '1.0.9', 1],
    ['2.0.0', '1.9.9', 1],
    ['0.1.10', '0.1.9', 1],
    ['0.10.0', '0.9.0', 1],
    ['v24.1.0', 'v24.0.9', 1],
    ['26.08', '25.08', 1],
    ['1.0.0', '1.0.0-beta.1', 1],
    ['0.2.1-beta.2', '0.2.1-beta.1', 1],
    ['1.0.0-beta.10', '1.0.0-beta.9', 1],
    ['1.0.0-beta', '1.0.0-alpha', 1],
    ['1.0.0-beta.1', '1.0.0-beta', 1],
    ['1.0.0-rc', '1.0.0-1', 1],
    ['1.0.0-x-y.2', '1.0.0-x-y.1', 1],
    // ASCII order, whatever the locale: capitals sort before lowercase.
    ['1.0.0-a', '1.0.0-B', 1],
    ['1.0.0-beta-2', '1.0.0-beta', 1],
  ])('orders %s against %s as %i', (a, b, expected) => {
    expect(sign(compareVersions(a, b))).toBe(expected);
    expect(sign(compareVersions(b, a))).toBe(sign(-expected));
  });
});

describe('compareVersions properties', () => {
  it('is reflexive and antisymmetric', () => {
    fc.assert(
      fc.property(version, version, (a, b) => {
        expect(compareVersions(a, a)).toBe(0);
        expect(sign(compareVersions(a, b))).toBe(sign(-compareVersions(b, a)));
      }),
    );
  });

  it('is transitive', () => {
    fc.assert(
      fc.property(version, version, version, (a, b, c) => {
        const [first, second, third] = [a, b, c].sort(compareVersions);
        expect(compareVersions(first ?? '', third ?? '')).toBeLessThanOrEqual(0);
        expect(compareVersions(first ?? '', second ?? '')).toBeLessThanOrEqual(0);
        expect(compareVersions(second ?? '', third ?? '')).toBeLessThanOrEqual(0);
      }),
    );
  });

  it('puts a release after each of its prereleases', () => {
    fc.assert(
      fc.property(release, prerelease, (numbers, pre) => {
        const plain = numbers.join('.');
        expect(compareVersions(plain, `${plain}-${pre.join('.')}`)).toBeGreaterThan(0);
      }),
    );
  });

  it('orders numbered prereleases by their number', () => {
    fc.assert(
      fc.property(release, fc.nat(), fc.nat(), (numbers, a, b) => {
        const base = `${numbers.join('.')}-beta.`;
        expect(sign(compareVersions(`${base}${String(a)}`, `${base}${String(b)}`))).toBe(
          sign(a - b),
        );
      }),
    );
  });

  it('puts a raised release number after the version it raised', () => {
    fc.assert(
      fc.property(release, fc.nat(), fc.integer({ min: 1, max: 999 }), (numbers, at, by) => {
        const position = at % numbers.length;
        const raised = numbers.map((value, index) => (index === position ? value + by : value));
        expect(compareVersions(raised.join('.'), numbers.join('.'))).toBeGreaterThan(0);
      }),
    );
  });

  it('ignores a v prefix and trailing zero release numbers', () => {
    fc.assert(
      fc.property(version, fc.nat({ max: 3 }), (a, zeros) => {
        const [numbers = '', ...pre] = a.replace(/^v/, '').split('-');
        const padded = [`${numbers}${'.0'.repeat(zeros)}`, ...pre].join('-');
        expect(compareVersions(`v${padded}`, a)).toBe(0);
      }),
    );
  });
});
