import { extname, join, normalize, sep } from 'node:path';
import { PRODUCT_NAME } from '../identity/product.ts';
import { isSameOrigin } from '../navigation/link-policy.ts';

export const CHROME_SCHEME = 'app';
export const CHROME_ORIGIN = 'app://chrome';

/** How YapYap knows a web contents showing one of its own pages (ADR 0001). */
export const CHROME_VIEW = { zone: 'chrome', home: CHROME_ORIGIN, label: PRODUCT_NAME } as const;

/** The app chrome CSP from ADR 0001: only its own scripts, styles, fonts and images. */
export const CHROME_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.woff2', 'font/woff2'],
]);

const NOT_FOUND = 404;

export interface ChromeAsset {
  readonly path: string;
  readonly contentType: string;
}

function decodePath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

/**
 * Maps an `app://chrome/...` URL to a file under `root`. Other hosts, paths
 * that escape `root` and unknown file types resolve to nothing.
 */
export function resolveChromeAsset(url: string, root: string): ChromeAsset | undefined {
  const pathname = isSameOrigin(url, CHROME_ORIGIN) ? decodePath(new URL(url).pathname) : undefined;
  if (pathname === undefined) {
    return undefined;
  }
  const path = normalize(join(root, pathname));
  const contentType = CONTENT_TYPES.get(extname(path));
  const inside = path.startsWith(normalize(root) + sep);
  return inside && contentType !== undefined ? { path, contentType } : undefined;
}

/** Serves chrome assets with the CSP as a header, so a page cannot opt out of it. */
export function createChromeHandler(
  root: string,
  readFile: (path: string) => Promise<Uint8Array>,
): (request: { readonly url: string }) => Promise<Response> {
  return async ({ url }) => {
    const asset = resolveChromeAsset(url, root);
    const body = asset && (await readFile(asset.path).catch(() => undefined));
    if (asset === undefined || body === undefined) {
      return new Response(null, { status: NOT_FOUND });
    }
    return new Response(body, {
      headers: {
        'content-type': asset.contentType,
        'content-security-policy': CHROME_CSP,
        'x-content-type-options': 'nosniff',
      },
    });
  };
}
