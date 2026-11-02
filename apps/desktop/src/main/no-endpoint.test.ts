import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, '..');

/** Every TypeScript source file of the app, tests aside. */
function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * What a local server or socket needs; YapYap's code has no use for any of
 * it. The one import of `node:net` allowed connects out to the session bus,
 * for the Background portal (#234, C33 in ADR 0008): a client, never a
 * server, so nothing can connect to YapYap.
 */
const ENDPOINT =
  /createServer|\.listen\(|from 'node:(?:http|https|http2|dgram)'|import (?!\{ createConnection \} from 'node:net')[^;]*from 'node:net'/;

describe('local endpoints', () => {
  // Nothing else on this computer can drive YapYap from outside, because
  // YapYap listens on no port or socket.
  it('are never opened by YapYap’s own code', () => {
    const files = sources(SOURCE);
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((file) => ENDPOINT.test(readFileSync(file, 'utf8')))).toEqual([]);
  });

  it('allow only connecting out over node:net, never listening', () => {
    expect(ENDPOINT.test("import { createConnection } from 'node:net';")).toBe(false);
    expect(ENDPOINT.test("import { createServer } from 'node:net';")).toBe(true);
    expect(ENDPOINT.test("import { createConnection, Server } from 'node:net';")).toBe(true);
    expect(ENDPOINT.test("import * as net from 'node:net';")).toBe(true);
    expect(ENDPOINT.test("import { request } from 'node:http';")).toBe(true);
  });
});
