import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareVersions } from '../../../apps/desktop/src/main/updates/version.ts';
import { latestNodeLts } from './versions.ts';

const version = fc
  .tuple(fc.boolean(), fc.array(fc.nat({ max: 999 }), { minLength: 1, maxLength: 4 }))
  .map(([prefixed, parts]) => `${prefixed ? 'v' : ''}${parts.join('.')}`);

describe('latestNodeLts properties', () => {
  it('picks an LTS release that no other LTS release is newer than', () => {
    const release = fc.record({ version, lts: fc.oneof(fc.constant(false as const), fc.string()) });
    fc.assert(
      fc.property(fc.array(release, { minLength: 1 }), (index) => {
        const lts = index
          .filter((entry) => entry.lts !== false)
          .map((entry) => entry.version.replace(/^v/, ''));
        const picked = latestNodeLts(index);
        expect(picked === undefined).toBe(lts.length === 0);
        expect(lts.filter((v) => picked !== undefined && compareVersions(v, picked) > 0)).toEqual(
          [],
        );
        if (picked !== undefined) {
          expect(lts).toContain(picked);
        }
      }),
    );
  });
});
