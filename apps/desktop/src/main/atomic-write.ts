import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';

/**
 * Writes `text` to a temporary file, flushes it to disk, then renames it
 * over `path`, so a crash or power cut leaves the old file or the new one,
 * never half of one. `mode` sets the permissions of a new file.
 */
export function writeTextAtomically(path: string, text: string, mode = 0o666): void {
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, 'w', mode);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}

/**
 * The same as `writeTextAtomically`, without blocking. Each write has a
 * temporary file of its own, so writes that overlap never mix, and a failed
 * one leaves none behind.
 */
export async function writeTextAtomicallyAsync(path: string, text: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx');
    try {
      await file.writeFile(text);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** A small file YapYap reads whole and replaces whole, such as `window-state.json`. */
export interface TextFile {
  /** May throw, for example when nothing was saved yet. */
  readonly read: () => string;
  readonly write: (text: string) => void;
}

/** The file at `path`, always replaced atomically. */
export function textFileAt(path: string, mode?: number): TextFile {
  return {
    read: () => readFileSync(path, 'utf8'),
    write: (text) => {
      writeTextAtomically(path, text, mode);
    },
  };
}

/** The file's text, or undefined when it is missing or cannot be read. */
export function readIfPresent(file: TextFile): string | undefined {
  try {
    return file.read();
  } catch {
    return undefined;
  }
}

/** True for the error of a file or folder that does not exist. */
export function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
