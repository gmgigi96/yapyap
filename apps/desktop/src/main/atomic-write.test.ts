import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMissing, readIfPresent, textFileAt, writeTextAtomicallyAsync } from './atomic-write.ts';

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

describe('writeTextAtomicallyAsync', () => {
  it('replaces the whole file, leaving no temporary file', async () => {
    const path = join(dir, 'records.json');
    writeFileSync(path, 'old');
    await writeTextAtomicallyAsync(path, 'one');
    await writeTextAtomicallyAsync(path, 'two');
    expect(textFileAt(path).read()).toBe('two');
    expect(readdirSync(dir)).toEqual(['records.json']);
  });

  it('removes its temporary file when the rename fails', async () => {
    const path = join(dir, 'records.json');
    mkdirSync(path);
    writeFileSync(join(path, 'keep'), '');
    await expect(writeTextAtomicallyAsync(path, 'text')).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(['records.json']);
  });

  it('fails without leaving anything when the folder does not exist', async () => {
    await expect(
      writeTextAtomicallyAsync(join(dir, 'missing', 'a.json'), 'text'),
    ).rejects.toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('isMissing', () => {
  it('knows the error of a file that does not exist, and no other', () => {
    expect(isMissing(Object.assign(new Error('gone'), { code: 'ENOENT' }))).toBe(true);
    expect(isMissing(Object.assign(new Error('busy'), { code: 'EBUSY' }))).toBe(false);
  });
});
