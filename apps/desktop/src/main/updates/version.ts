/**
 * Dotted numbers with an optional `v` and prerelease. More release numbers
 * than semantic versioning's three are allowed, so dated tags such as
 * `26.08` sort the same way.
 */
const VERSION = /^v?(?<release>\d+(?:\.\d+)*)(?:-(?<pre>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const NUMERIC = /^\d+$/;

interface Parts {
  readonly release: readonly number[];
  readonly pre: readonly string[];
}

function parts(version: string): Parts {
  const groups = VERSION.exec(version)?.groups;
  return {
    release: groups?.['release']?.split('.').map(Number) ?? [],
    pre: groups?.['pre']?.split('.') ?? [],
  };
}

/** Orders lists of numbers; a missing one counts as 0, so release `1.0` equals `1.0.0`. */
function compareNumbers(
  a: readonly (number | undefined)[],
  b: readonly (number | undefined)[],
): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const order = (a[index] ?? 0) - (b[index] ?? 0);
    if (order !== 0) {
      return order;
    }
  }
  return 0;
}

/**
 * Semantic versioning's order of two prerelease identifiers: numbers below
 * words, numbers by value, and words by ASCII.
 */
function compareIdentifiers(a: string, b: string): number {
  const [numberA, numberB] = [NUMERIC.test(a), NUMERIC.test(b)];
  if (numberA && numberB) {
    return Number(a) - Number(b);
  }
  if (numberA !== numberB) {
    return numberA ? -1 : 1;
  }
  // By code point, so the order is ASCII's whatever the user's locale. No
  // code point is 0, so a word that runs out first sorts first.
  return compareNumbers(codePoints(a), codePoints(b));
}

function codePoints(text: string): (number | undefined)[] {
  return Array.from(text, (character) => character.codePointAt(0));
}

function comparePre(a: readonly string[], b: readonly string[]): number {
  // A release outranks its prereleases: 1.0.0 is newer than 1.0.0-beta.1.
  if (a.length === 0 || b.length === 0) {
    return b.length - a.length;
  }
  for (const [index, identifier] of a.entries()) {
    const other = b[index];
    // The shorter list of otherwise equal identifiers is the older one.
    if (other === undefined) {
      return 1;
    }
    const order = compareIdentifiers(identifier, other);
    if (order !== 0) {
      return order;
    }
  }
  return a.length - b.length;
}

/**
 * Orders two versions by semantic versioning's precedence: negative when `a`
 * is older, positive when newer, zero when equal. A leading `v` is ignored,
 * missing release numbers count as 0, and anything that is not a version
 * counts as `0.0.0`.
 */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [parts(a), parts(b)];
  return compareNumbers(left.release, right.release) || comparePre(left.pre, right.pre);
}
