/** The largest request body the server reads; MCP calls are small. */
export const MAX_BODY_BYTES = 64 * 1024;

/** An HTTP request as it arrives, before its body is read. */
export interface ArrivingRequest {
  /** The peer's address; undefined once its socket closed. */
  readonly remoteAddress: string | undefined;
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/** Why a request is turned away, as an HTTP status. */
export interface Refusal {
  readonly status: 400 | 401 | 403 | 404 | 405 | 413 | 415 | 429;
}

const LOOPBACK = new Set(['127.0.0.1', '::ffff:127.0.0.1']);

const header = (request: ArrivingRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

/** The media type of a `Content-Type`, without its parameters. */
const mediaType = (value: string | undefined): string | undefined =>
  value?.split(';')[0]?.trim().toLowerCase();

/**
 * Whether the request may go on to authentication (ADR 0019, §3). It must
 * come from this computer, name YapYap's own address as its host, so a
 * site that rebinds its name to 127.0.0.1 cannot reach it, and carry no
 * `Origin`, which every browser page sends and agents do not.
 */
export function refusalOf(request: ArrivingRequest, port: number): Refusal | undefined {
  return fromThisComputer(request, port) ? shapeRefusal(request) : { status: 403 };
}

function fromThisComputer(request: ArrivingRequest, port: number): boolean {
  const hosts = [`127.0.0.1:${String(port)}`, `localhost:${String(port)}`];
  return (
    LOOPBACK.has(request.remoteAddress ?? '') &&
    hosts.includes(header(request, 'host') ?? '') &&
    !('origin' in request.headers)
  );
}

/** Whether the request is the one kind the server answers: a small JSON POST to `/mcp`. */
function shapeRefusal(request: ArrivingRequest): Refusal | undefined {
  if (request.url !== '/mcp') {
    return { status: 404 };
  }
  if (request.method !== 'POST') {
    return { status: 405 };
  }
  if (mediaType(header(request, 'content-type')) !== 'application/json') {
    return { status: 415 };
  }
  return Number(header(request, 'content-length') ?? 0) > MAX_BODY_BYTES
    ? { status: 413 }
    : undefined;
}

/** The token a request presents as `Authorization: Bearer <token>`, or undefined. */
export function bearerOf(request: ArrivingRequest): string | undefined {
  const [scheme, token, ...rest] = (header(request, 'authorization') ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token !== undefined && rest.length === 0
    ? token
    : undefined;
}
