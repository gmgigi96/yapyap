import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_HOST } from './agents/listener.ts';

const SOURCE = join(import.meta.dirname, '..');
/** The one file that listens: the MCP server for agents, on 127.0.0.1, while the user has it on (ADR 0019). */
const LISTENER = join(import.meta.dirname, 'agents', 'listener.ts');

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
  // Nothing else on this computer can drive YapYap from outside: YapYap
  // listens on no port or socket but the MCP server's, which the user turns on.
  it('are never opened by YapYap’s own code, but for the agents’ listener', () => {
    const files = sources(SOURCE);
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((file) => ENDPOINT.test(readFileSync(file, 'utf8')))).toEqual([LISTENER]);
  });

  it('let the agents’ listener bind this computer’s loopback address alone', () => {
    const source = readFileSync(LISTENER, 'utf8');
    expect(AGENT_HOST).toBe('127.0.0.1');
    expect(source.match(/\.listen\(/g)).toHaveLength(1);
    expect(source).toContain('server.listen({ host: AGENT_HOST, exclusive: true, port }');
  });

  it('allow only connecting out over node:net, never listening', () => {
    expect(ENDPOINT.test("import { createConnection } from 'node:net';")).toBe(false);
    expect(ENDPOINT.test("import { createServer } from 'node:net';")).toBe(true);
    expect(ENDPOINT.test("import { createConnection, Server } from 'node:net';")).toBe(true);
    expect(ENDPOINT.test("import * as net from 'node:net';")).toBe(true);
    expect(ENDPOINT.test("import { request } from 'node:http';")).toBe(true);
  });
});
