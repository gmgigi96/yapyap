/** The item at `index`, failing the test when there is none. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item ${String(index)}.`);
  }
  return item;
}
