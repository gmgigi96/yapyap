import { describe, expect, it } from 'vitest';
import { livePages } from './live-pages.ts';

const page = (destroyed: boolean) => ({ isDestroyed: () => destroyed });

describe('livePages', () => {
  it('forgets the pages that are gone and returns the others in order', () => {
    const open = page(false);
    const gone = page(true);
    const later = page(false);
    const pages = new Map([
      [open, 'a'],
      [gone, 'b'],
      [later, 'c'],
    ]);
    expect(livePages(pages)).toEqual([
      [open, 'a'],
      [later, 'c'],
    ]);
    expect([...pages.keys()]).toEqual([open, later]);
  });
});
