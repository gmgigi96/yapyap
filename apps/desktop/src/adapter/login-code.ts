import { LANDMARKS } from './page-state.ts';

interface CodePixels {
  readonly data: ArrayLike<number>;
}

interface CodeCanvas {
  readonly width: number;
  readonly height: number;
  getContext(kind: '2d'): {
    getImageData(x: number, y: number, width: number, height: number): CodePixels;
  } | null;
}

interface CodeDocument {
  querySelector(selectors: string): unknown;
}

/** A QR code's smallest and largest sizes, in modules a side. */
const MIN_MODULES = 21;
const MAX_MODULES = 177;

/**
 * The login QR code WhatsApp draws on the canvas inside `selector`, as rows
 * of `1` (dark) and `0` (light) modules, or null while there is none (ADR
 * 0021). Runs inside the page as source text, so it stays self-contained.
 * The top-left finder pattern, 7 modules wide, gives the module size, and
 * the top-right one where the code ends; each module is read at its middle.
 * It returns no pixels and no text, and the logged-out page holds no chats.
 */
export function readLoginCode(doc: CodeDocument, selector: string): string[] | null {
  const canvas = doc.querySelector(`${selector} canvas`) as CodeCanvas | null;
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === null || context === null) {
    return null;
  }
  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const dark = (x: number, y: number): boolean => {
    const at = (y * width + x) * 4;
    // Transparent pixels read as light, whatever their color.
    return (
      Number(data[at + 3]) > 127 &&
      Number(data[at]) + Number(data[at + 1]) + Number(data[at + 2]) < 384
    );
  };
  /** The first position from `from`, moving by `step`, where `going` stops holding. */
  const scan = (from: number, step: number, going: (at: number) => boolean): number => {
    let at = from;
    while (going(at)) {
      at += step;
    }
    return at;
  };
  // The first dark pixel on the diagonal is the top-left finder's corner.
  const start = scan(0, 1, (at) => at < Math.min(width, height) && !dark(at, at));
  const end = scan(width, -1, (at) => at > start && !dark(at - 1, start));
  const size = (scan(start, 1, (at) => dark(at, start)) - start) / 7;
  const count = Math.round((end - start) / size);
  const middle = (index: number): number => Math.floor(start + (index + 0.5) * size);
  const row = (y: number): string =>
    Array.from({ length: count }, (_cell, x) => (dark(middle(x), middle(y)) ? '1' : '0')).join('');
  // A blank canvas has no finder, which makes the count NaN.
  return count >= 21 && count <= 177 ? Array.from({ length: count }, (_row, y) => row(y)) : null;
}

/** Accepts only a QR code's shape: a square of 21 to 177 modules a side, in steps of 4. */
export function parseLoginCode(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const size = value.length;
  const square = value.every(
    (row: unknown) => typeof row === 'string' && row.length === size && /^[01]+$/.test(row),
  );
  const shaped = size >= MIN_MODULES && size <= MAX_MODULES && (size - MIN_MODULES) % 4 === 0;
  return square && shaped ? (value as string[]) : undefined;
}

/** The probe as code for `executeJavaScriptInIsolatedWorld`. */
export const LOGIN_CODE = `(${readLoginCode.toString()})(document, ${JSON.stringify(LANDMARKS.loginCode)})`;
