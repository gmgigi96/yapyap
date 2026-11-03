import type { ProxyLoginAnswer, ProxyLoginRequest } from '../../shared/api/chrome-api.ts';
import type { SecretStore } from '../secrets/secret-store.ts';

/** The part of Electron's `login` event `authInfo` that matters here. */
export interface AuthInfo {
  readonly isProxy: boolean;
  readonly host: string;
  readonly port: number;
}

export type LoginCallback = (username?: string, password?: string) => void;

export interface ProxyLoginDependencies {
  readonly secrets: Pick<SecretStore, 'canKeep' | 'get' | 'set'>;
  /** Asks the user; undefined when they cancel. */
  readonly ask: (request: ProxyLoginRequest) => Promise<ProxyLoginAnswer | undefined>;
  readonly now: () => number;
}

/**
 * After a cancel, WhatsApp keeps retrying its connections; asking again at
 * once would trap the user in the window. They can retry after this long.
 */
export const DECLINE_MS = 60_000;

const secretName = (info: AuthInfo): string => `proxy:${info.host}:${String(info.port)}`;

async function saved(
  secrets: Pick<SecretStore, 'get'>,
  name: string,
): Promise<ProxyLoginAnswer | undefined> {
  try {
    const parsed = JSON.parse(
      (await secrets.get(name)) ?? 'null',
    ) as Partial<ProxyLoginAnswer> | null;
    return typeof parsed?.username === 'string' && typeof parsed.password === 'string'
      ? { username: parsed.username, password: parsed.password, remember: true }
      : undefined;
  } catch {
    return undefined;
  }
}

export interface ProxyLogin {
  /** Answers Electron's `login` event; `owner` is the session the request came from. */
  readonly handle: (
    event: { preventDefault(): void },
    owner: object,
    info: AuthInfo,
    callback: LoginCallback,
  ) => void;
}

/** One window per proxy: requests that arrive while it is open wait for its answer. */
function asker(deps: ProxyLoginDependencies, declined: Map<string, number>) {
  const pending = new Map<string, LoginCallback[]>();
  return (name: string, info: AuthInfo, failed: boolean, callback: LoginCallback): void => {
    const waiting = pending.get(name);
    if (waiting !== undefined) {
      waiting.push(callback);
      return;
    }
    const callbacks = [callback];
    pending.set(name, callbacks);
    void deps.secrets
      .canKeep()
      .then((canRemember) => deps.ask({ failed, canRemember, host: info.host, port: info.port }))
      .then((credentials) => {
        pending.delete(name);
        if (credentials === undefined) {
          declined.set(name, deps.now());
        } else {
          void deps.secrets.set(
            name,
            credentials.remember ? JSON.stringify(credentials) : undefined,
          );
        }
        for (const answer of callbacks) {
          answer(credentials?.username, credentials?.password);
        }
      });
  };
}

/**
 * Signs in to proxies that ask for a password: with saved credentials once
 * per session, otherwise by asking the user. Credentials are never logged (#76).
 */
export function createProxyLogin(deps: ProxyLoginDependencies): ProxyLogin {
  const tried = new WeakMap<object, Set<string>>();
  const declined = new Map<string, number>();
  const ask = asker(deps, declined);
  const respond = async (
    attempts: Set<string>,
    info: AuthInfo,
    callback: LoginCallback,
  ): Promise<void> => {
    const name = secretName(info);
    const known = await saved(deps.secrets, name);
    if (known !== undefined && !attempts.has(name)) {
      attempts.add(name);
      callback(known.username, known.password);
      return;
    }
    if (deps.now() - (declined.get(name) ?? -Infinity) < DECLINE_MS) {
      callback();
      return;
    }
    ask(name, info, attempts.has(name), callback);
    attempts.add(name);
  };
  return {
    handle: (event, owner, info, callback) => {
      if (!info.isProxy) {
        // Only proxies sign in through YapYap; sites get Chromium's refusal.
        return;
      }
      event.preventDefault();
      const attempts = tried.get(owner) ?? new Set<string>();
      tried.set(owner, attempts);
      void respond(attempts, info, callback);
    },
  };
}
