import { runInNewContext } from 'node:vm';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LOGIN_CODE, parseLoginCode, readLoginCode } from './login-code.ts';
import { LANDMARKS } from './page-state.ts';

/** A code of `size` modules a side: the three finder patterns, and `fill` everywhere else. */
function codeOf(size: number, fill: (x: number, y: number) => boolean): string[] {
  const finder = (x: number, y: number): boolean | undefined => {
    const corners = [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ] as const;
    for (const [left, top] of corners) {
      const dx = x - left;
      const dy = y - top;
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        return ring !== 2 && ring !== 4;
      }
    }
    return undefined;
  };
  return Array.from({ length: size }, (_row, y) =>
    Array.from({ length: size }, (_cell, x) => ((finder(x, y) ?? fill(x, y)) ? '1' : '0')).join(''),
  );
}

interface Drawing {
  readonly module: number;
  readonly quiet: number;
  readonly dark?: readonly number[];
  readonly light?: readonly number[];
}

const DARK = [0x12, 0x2e, 0x31, 255];
const LIGHT = [255, 255, 255, 255];

/** Whether the pixel at (`x`, `y`) falls on a dark module. */
function onDark(
  code: readonly string[],
  { module, quiet }: Drawing,
  x: number,
  y: number,
): boolean {
  const row = code[Math.floor((y - quiet) / module)];
  return row?.[Math.floor((x - quiet) / module)] === '1' && x >= quiet && y >= quiet;
}

/** The page's canvas with `code` drawn on it, `module` pixels a module, inside a quiet zone. */
function canvasOf(code: readonly string[], drawing: Drawing) {
  const width = code.length * drawing.module + 2 * drawing.quiet;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = onDark(code, drawing, x, y) ? (drawing.dark ?? DARK) : (drawing.light ?? LIGHT);
      data.set(color, (y * width + x) * 4);
    }
  }
  return {
    width,
    height: width,
    getContext: (kind: string) => (kind === '2d' ? { getImageData: () => ({ data }) } : null),
  };
}

function pageWith(canvas: unknown) {
  const asked: string[] = [];
  return {
    asked,
    querySelector: (selectors: string) => {
      asked.push(selectors);
      return canvas;
    },
  };
}

const checkered = (x: number, y: number): boolean => (x * 7 + y * 3) % 5 < 2;

describe('readLoginCode', () => {
  it('reads each module of the code inside the login landmark', () => {
    const code = codeOf(25, checkered);
    const page = pageWith(canvasOf(code, { module: 4, quiet: 12 }));
    expect(readLoginCode(page, LANDMARKS.loginCode)).toEqual(code);
    expect(page.asked).toEqual([`${LANDMARKS.loginCode} canvas`]);
  });

  it('reads codes of every size and scale, with or without a quiet zone', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        (version, module, quiet, seed) => {
          const size = 21 + version * 4;
          const code = codeOf(size, (x, y) => ((x * 31 + y * 17 + seed) * 2654435761) % 7 < 3);
          const read = readLoginCode(pageWith(canvasOf(code, { module, quiet })), 'x');
          expect(read).toEqual(code);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('reads light modules from transparent pixels and from light colors', () => {
    const code = codeOf(21, checkered);
    const transparent = canvasOf(code, { module: 3, quiet: 6, light: [0, 0, 0, 0] });
    expect(readLoginCode(pageWith(transparent), 'x')).toEqual(code);
    const grey = canvasOf(code, {
      module: 3,
      quiet: 6,
      dark: [127, 128, 128, 255],
      light: [128, 128, 128, 255],
    });
    expect(readLoginCode(pageWith(grey), 'x')).toEqual(code);
    const faint = canvasOf(code, {
      module: 3,
      quiet: 6,
      dark: [0, 0, 0, 128],
      light: [0, 0, 0, 127],
    });
    expect(readLoginCode(pageWith(faint), 'x')).toEqual(code);
  });

  it('reads nothing without a canvas, a context, or a code on it', () => {
    expect(readLoginCode(pageWith(null), 'x')).toBeNull();
    expect(
      readLoginCode(pageWith({ width: 4, height: 4, getContext: () => null }), 'x'),
    ).toBeNull();
    const blank = canvasOf(
      Array.from({ length: 21 }, () => '0'.repeat(21)),
      { module: 2, quiet: 4 },
    );
    expect(readLoginCode(pageWith(blank), 'x')).toBeNull();
  });

  it('reads nothing from a drawing too small or too large to be a code', () => {
    expect(readLoginCode(pageWith(canvasOf(['1111111'], { module: 2, quiet: 2 })), 'x')).toBeNull();
    const wide = codeOf(181, checkered);
    expect(readLoginCode(pageWith(canvasOf(wide, { module: 1, quiet: 0 })), 'x')).toBeNull();
    const largest = codeOf(177, checkered);
    expect(readLoginCode(pageWith(canvasOf(largest, { module: 1, quiet: 0 })), 'x')).toEqual(
      largest,
    );
  });

  it.skipIf(LOGIN_CODE.includes('stryMutAct'))('runs as standalone source text', () => {
    const code = codeOf(21, checkered);
    const document = pageWith(canvasOf(code, { module: 2, quiet: 4 }));
    expect(runInNewContext(LOGIN_CODE, { document })).toEqual(code);
  });
});

describe('parseLoginCode', () => {
  it('accepts square codes of every QR size', () => {
    for (const size of [21, 25, 101, 177]) {
      const code = codeOf(size, checkered);
      expect(parseLoginCode(code)).toEqual(code);
    }
  });

  it('refuses anything else', () => {
    const code = codeOf(21, checkered);
    expect(parseLoginCode('1'.repeat(21))).toBeUndefined();
    expect(parseLoginCode(null)).toBeUndefined();
    expect(parseLoginCode(codeOf(17, checkered))).toBeUndefined();
    expect(parseLoginCode(codeOf(22, checkered))).toBeUndefined();
    expect(parseLoginCode(codeOf(181, checkered))).toBeUndefined();
    expect(parseLoginCode([...code.slice(1), 1])).toBeUndefined();
    expect(parseLoginCode([...code.slice(1), `${'0'.repeat(20)}2`])).toBeUndefined();
    expect(parseLoginCode([...code.slice(1), '0'.repeat(20)])).toBeUndefined();
    expect(parseLoginCode([...code.slice(1), `x${'0'.repeat(20)}`])).toBeUndefined();
  });
});
