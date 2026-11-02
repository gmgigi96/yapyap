import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentAnswer, AgentRequest } from './handler.ts';
import { AGENT_HOST, listenForAgents, type AgentListener } from './listener.ts';
import { MAX_BODY_BYTES } from './request-checks.ts';

let open: AgentListener | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

interface Sent {
  readonly status: number | undefined;
  readonly headers: Record<string, unknown>;
  readonly body: string;
}

/** Sends one request to the listener, as an agent on this computer would. */
function send(
  port: number,
  options: { method?: string; path?: string; headers?: Record<string, string>; body?: string },
): Promise<Sent> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: AGENT_HOST,
        port,
        method: options.method ?? 'POST',
        path: options.path ?? '/mcp',
        headers: {
          host: `127.0.0.1:${String(port)}`,
          'content-type': 'application/json',
          ...options.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end(options.body);
  });
}

const answered: AgentAnswer = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: '{"ok":true}',
};

async function listen(
  answer = vi.fn<(request: AgentRequest) => Promise<AgentAnswer>>(() => Promise.resolve(answered)),
) {
  const warn = vi.fn();
  open = await listenForAgents(0, answer, warn);
  return { port: open.port, answer, warn };
}

describe('listenForAgents', () => {
  it('passes a checked request with its body on, and returns the answer uncached', async () => {
    const { port, answer } = await listen();
    const sent = await send(port, { body: '{"jsonrpc":"2.0"}' });
    expect(sent).toMatchObject({ status: 200, body: '{"ok":true}' });
    expect(sent.headers['cache-control']).toBe('no-store');
    expect(answer).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteAddress: '127.0.0.1',
        method: 'POST',
        url: '/mcp',
        body: '{"jsonrpc":"2.0"}',
      }),
    );
  });

  it('turns a browser page away before reading its body', async () => {
    const { port, answer } = await listen();
    const sent = await send(port, { headers: { origin: 'https://example.com' }, body: '{}' });
    expect(sent.status).toBe(403);
    expect(answer).not.toHaveBeenCalled();
  });

  it('stops reading a body that grows past the limit, whatever its length said', async () => {
    const { port, answer } = await listen();
    const sent = await send(port, {
      headers: { 'transfer-encoding': 'chunked' },
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    });
    expect(sent.status).toBe(413);
    expect(answer).not.toHaveBeenCalled();
  });

  it('drops the connection when answering fails, and says so in the log', async () => {
    const { port, warn } = await listen(vi.fn(() => Promise.reject(new Error('Broken.'))));
    await expect(send(port, { body: '{}' })).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith('The MCP server could not answer a request.');
  });

  it('refuses a port that is taken, and closes cleanly', async () => {
    const { port } = await listen();
    await expect(listenForAgents(port, vi.fn(), vi.fn())).rejects.toThrow();
    await open?.close();
    open = undefined;
    await expect(send(port, { body: '{}' })).rejects.toThrow();
  });
});
