import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readIfPresent, textFileAt } from './atomic-write.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'yapyap-atomic-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('textFileAt', () => {
  it('throws on a read before anything is saved', () => {
    const file = textFileAt(join(dir, 'state.json'));
    expect(() => file.read()).toThrow();
  });

  it('replaces the whole file, leaving no temporary file', () => {
    const file = textFileAt(join(dir, 'state.json'));
    file.write('{"a":1}');
    file.write('{}');
    expect(file.read()).toBe('{}');
    expect(readdirSync(dir)).toEqual(['state.json']);
  });

  it.skipIf(process.platform === 'win32')('creates the file with the mode it is given', () => {
    textFileAt(join(dir, 'private.json'), 0o600).write('{}');
    expect(statSync(join(dir, 'private.json')).mode & 0o777).toBe(0o600);
  });
});

describe('readIfPresent', () => {
  it('reads a saved file, and nothing from one that is missing', () => {
    const file = textFileAt(join(dir, 'state.json'));
    expect(readIfPresent(file)).toBeUndefined();
    file.write('{}');
    expect(readIfPresent(file)).toBe('{}');
  });
});
