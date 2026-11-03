/** Forgets the pages in `pages` that are gone, and returns the others with their values. */
export function livePages<Page extends { isDestroyed(): boolean }, Value>(
  pages: Map<Page, Value>,
): [Page, Value][] {
  for (const page of [...pages.keys()].filter((each) => each.isDestroyed())) {
    pages.delete(page);
  }
  return [...pages];
}
