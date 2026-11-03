import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AgentAnswer, AgentRequest } from './handler.ts';
import { MAX_BODY_BYTES, refusalOf, TOO_LARGE, type ArrivingRequest } from './request-checks.ts';

/** The only address YapYap listens on: this computer, never the network (ADR 0019). */
export const AGENT_HOST = '127.0.0.1';
/** How long a request may take to arrive in full. */
const REQUEST_MS = 5000;

export interface AgentListener {
  readonly port: number;
  readonly close: () => Promise<void>;
}

const arriving = (request: IncomingMessage): ArrivingRequest => ({
  remoteAddress: request.socket.remoteAddress,
  method: request.method,
  url: request.url,
  headers: request.headers,
});

/** The body, or undefined once it passes {@link MAX_BODY_BYTES}. */
async function bodyOf(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      return undefined;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function reply(response: ServerResponse, { status, headers, body }: AgentAnswer): void {
  response.writeHead(status, { ...headers, 'cache-control': 'no-store' });
  response.end(body);
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  port: number,
  answer: (request: AgentRequest) => Promise<AgentAnswer>,
): Promise<void> {
  // Turned away before its body is read, so a web page cannot even make YapYap read it.
  const refusal = refusalOf(arriving(request), port);
  if (refusal !== undefined) {
    reply(response, { status: refusal.status, headers: { connection: 'close' }, body: '' });
    return;
  }
  const body = await bodyOf(request);
  if (body === undefined) {
    reply(response, { status: TOO_LARGE, headers: { connection: 'close' }, body: '' });
    return;
  }
  reply(response, await answer({ ...arriving(request), body }));
}

/** Closes the server, cutting the connections agents keep open. */
function closing(server: Server): Promise<void> {
  return new Promise((closed) => {
    server.closeAllConnections();
    server.close(() => {
      closed();
    });
  });
}

/**
 * Listens for AI agents on `127.0.0.1:port` (ADR 0019), the only port
 * YapYap ever opens, and only while the user has the MCP server on. Port 0
 * picks a free one. Rejects when the port is taken.
 */
export function listenForAgents(
  port: number,
  answer: (request: AgentRequest) => Promise<AgentAnswer>,
  warn: (message: string) => void,
): Promise<AgentListener> {
  const server = createServer((request, response) => {
    handle(request, response, (server.address() as AddressInfo).port, answer).catch(() => {
      warn('The MCP server could not answer a request.');
      response.destroy();
    });
  });
  server.requestTimeout = REQUEST_MS;
  server.headersTimeout = REQUEST_MS;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: AGENT_HOST, exclusive: true, port }, () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => closing(server),
      });
    });
  });
}
