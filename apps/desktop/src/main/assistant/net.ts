import { isLocalServer } from '../../shared/local-server.ts';

/** The services the assistant may call, over HTTPS only. */
const PROVIDER_HOSTS: ReadonlySet<string> = new Set(['api.anthropic.com', 'api.openai.com']);

/**
 * Where the private model downloads from: Hugging Face, which redirects
 * the file to its own content hosts under `hf.co`.
 */
const isModelHost = (host: string): boolean => host === 'huggingface.co' || host.endsWith('.hf.co');

/** What the assistant may reach besides the providers. */
export interface ConfinementSources {
  /** The model server on this computer the user chose, or '' for none. */
  readonly localServer: () => string;
  /** The private model's address when it is no catalog model, as in E2E tests; else undefined. */
  readonly testModel: string | undefined;
}

const urlOf = (address: string): URL | undefined =>
  URL.canParse(address) ? new URL(address) : undefined;

/**
 * Whether the assistant may send a request to `address` (ADR 0017): the
 * providers and Hugging Face over HTTPS, and the one model server on this
 * computer the user chose. Nothing else on the internet or the local
 * network, and no other service on this computer.
 */
export function assistantMayReach(address: string, sources: ConfinementSources): boolean {
  const url = urlOf(address);
  if (url === undefined) {
    return false;
  }
  if (url.protocol === 'https:' && (PROVIDER_HOSTS.has(url.host) || isModelHost(url.host))) {
    return true;
  }
  const local = sources.localServer();
  const origins = [isLocalServer(local) ? local : undefined, sources.testModel];
  return origins.some((origin) => origin !== undefined && urlOf(origin)?.origin === url.origin);
}

/** Thrown for a request the assistant may not send; it never leaves YapYap. */
export class RequestRefused extends TypeError {
  constructor() {
    super('The assistant may not reach this address.');
    this.name = 'RequestRefused';
  }
}

/**
 * The assistant's `fetch`: refuses what {@link assistantMayReach} does not
 * allow before anything is sent, and sends no cookies and keeps no cache.
 * The session's request guard checks redirects the same way.
 */
export function confinedFetch(
  fetch: (input: string | Request, init: RequestInit) => Promise<Response>,
  allowed: (address: string) => boolean,
): typeof globalThis.fetch {
  return (input, init) => {
    // Electron's `fetch` takes no URL object.
    const target = input instanceof URL ? input.href : input;
    if (!allowed(target instanceof Request ? target.url : target)) {
      return Promise.reject(new RequestRefused());
    }
    return fetch(target, { ...init, credentials: 'omit', cache: 'no-store' });
  };
}

/** The part of an Electron session the guard uses. */
export interface GuardedRequests {
  readonly webRequest: {
    onBeforeRequest(
      listener: (
        details: { readonly url: string },
        callback: (response: { readonly cancel: boolean }) => void,
      ) => void,
    ): void;
  };
}

/**
 * The assistant's own session, which cancels every request it may not
 * send, redirects included, so a provider or model host cannot send the
 * assistant anywhere else. It is opened and guarded on first use, which
 * comes only once the app is ready and sessions exist.
 */
export function guardedAssistantSession<Session extends GuardedRequests>(
  open: () => Session,
  allowed: (address: string) => boolean,
): () => Session {
  let opened: Session | undefined;
  return () => {
    if (opened === undefined) {
      opened = open();
      opened.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: !allowed(details.url) });
      });
    }
    return opened;
  };
}
