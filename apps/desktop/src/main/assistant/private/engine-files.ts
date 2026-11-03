import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ENGINE_ORIGIN } from '../../../shared/api/engine-api.ts';
import { isSameOrigin } from '../../navigation/link-policy.ts';

/**
 * The engine page's CSP (ADR 0017): only YapYap's own scripts, which may
 * compile WebAssembly but never eval JavaScript, workers from `blob:`
 * URLs, which wllama builds its threads from and which inherit this
 * policy, and requests to its own origin alone, for the engine's `.wasm`
 * and the model. Nothing reaches the network.
 */
export const ENGINE_CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Cross-origin isolation gives the page `SharedArrayBuffer`, which the
 * engine needs for threads. Every response carries it, since a worker
 * takes its policy from its script's response.
 */
const HEADERS = {
  'Content-Security-Policy': ENGINE_CSP,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

const OK = 200;
const NOT_FOUND = 404;
const PARTIAL = 206;
const NOT_SATISFIABLE = 416;

const notFound = (): Response => new Response(null, { status: NOT_FOUND, headers: HEADERS });

/** The page, its scripts and the engine's `.wasm`: nothing else of the renderer is served here. */
function assetOf(pathname: string): { readonly file: string; readonly type: string } | undefined {
  if (pathname === '/engine.html') {
    return { file: 'engine.html', type: 'text/html; charset=utf-8' };
  }
  if (pathname === '/wllama.wasm') {
    // Streaming compilation refuses WebAssembly served under any other type.
    return { file: 'wllama.wasm', type: 'application/wasm' };
  }
  const script = /^\/assets\/(engine-[\w-]+\.js)$/.exec(pathname)?.[1];
  return script === undefined
    ? undefined
    : { file: join('assets', script), type: 'text/javascript; charset=utf-8' };
}

const BYTES = /^bytes=(\d*)-(\d*)$/;

/** The first and last byte of `first-last`, `first-` or `-last` (the last so many bytes). */
function bounds(first: string, last: string, size: number): [number, number] {
  if (first === '') {
    return [Math.max(0, size - Number(last)), size - 1];
  }
  return [Number(first), last === '' ? size - 1 : Math.min(Number(last), size - 1)];
}

/**
 * The bytes a `Range: bytes=a-b` header asks for: null for the whole file,
 * undefined for a range this file cannot give.
 */
export function rangeOf(header: string | null, size: number): [number, number] | null | undefined {
  if (header === null) {
    return null;
  }
  // A header that is no single byte range reads as `-`, which no file can give.
  const [, first = '', last = ''] = BYTES.exec(header.trim()) ?? [];
  if (first + last === '') {
    return undefined;
  }
  const [start, end] = bounds(first, last, size);
  return start <= end ? [start, end] : undefined;
}

/** The model's file, whole or the range asked for, streamed from disk. */
async function modelResponse(path: string, header: string | null): Promise<Response> {
  const { size } = await stat(path);
  const range = rangeOf(header, size);
  if (range === undefined) {
    const refused = { ...HEADERS, 'Content-Range': `bytes */${String(size)}` };
    return new Response(null, { status: NOT_SATISFIABLE, headers: refused });
  }
  const [start, end] = range ?? [0, size - 1];
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  const headers = {
    ...HEADERS,
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    ...(range === null
      ? {}
      : { 'Content-Range': `bytes ${String(start)}-${String(end)}/${String(size)}` }),
  };
  return new Response(body, { headers, status: range === null ? OK : PARTIAL });
}

/** Where the engine page's files come from. */
export interface EngineFileSources {
  /** The built renderer, where `engine.html`, its scripts and `wllama.wasm` are. */
  readonly root: string;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  /** The downloaded private model's file, while it is ready. */
  readonly model: () => string | undefined;
}

/**
 * Serves `app://engine/` on the engine's own session (ADR 0017): its page,
 * scripts and `.wasm` from the built renderer, and the downloaded model at
 * `model.gguf`, with `Range` support, under the engine's CSP and
 * cross-origin isolation. Anything else is a 404.
 */
export function serveEngineFiles(
  sources: EngineFileSources,
): (request: { readonly url: string; readonly headers: Headers }) => Promise<Response> {
  return async ({ url, headers }) => {
    if (!isSameOrigin(url, ENGINE_ORIGIN)) {
      return notFound();
    }
    const { pathname } = new URL(url);
    const model = sources.model();
    try {
      if (pathname === '/model.gguf') {
        return model === undefined ? notFound() : await modelResponse(model, headers.get('range'));
      }
      const asset = assetOf(pathname);
      if (asset === undefined) {
        return notFound();
      }
      const bytes = await sources.readFile(join(sources.root, asset.file));
      return new Response(bytes, { headers: { ...HEADERS, 'Content-Type': asset.type } });
    } catch {
      return notFound();
    }
  };
}
