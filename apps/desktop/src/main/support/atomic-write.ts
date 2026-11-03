import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import type { Static, TSchema } from 'typebox';
import { Value } from 'typebox/value';

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

/**
 * The file's JSON when it matches `schema`, or undefined when the file is
 * missing, damaged or of another version, so a store starts empty instead.
 */
export function readChecked<Schema extends TSchema>(
  file: TextFile,
  schema: Schema,
): Static<Schema> | undefined {
  try {
    const value: unknown = JSON.parse(file.read());
    return Value.Check(schema, value) ? value : undefined;
  } catch {
    return undefined;
  }
}
