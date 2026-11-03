import type { KeyedProvider } from '../../shared/api/chrome-api.ts';
import type { SecretStore } from '../secrets/secret-store.ts';

/** The services the user brings a key for. */
export const KEYED_PROVIDERS: readonly KeyedProvider[] = ['anthropic', 'openai'];

/** Longer than any provider's keys. */
export const MAX_KEY = 8192;

/** Where each provider's key is kept among YapYap's secrets. */
const keyName = (provider: KeyedProvider): string => `assistant/key/${provider}`;

/** The user's API keys, kept encrypted by the system's keychain, never in settings. */
export interface AssistantKeys {
  readonly get: (provider: KeyedProvider) => Promise<string | undefined>;
  /** Keeps a key; false when the system cannot keep it safely. */
  readonly save: (provider: KeyedProvider, key: string) => Promise<boolean>;
  readonly forget: (provider: KeyedProvider) => Promise<void>;
  /** Whether keys can be kept on this system at all. */
  readonly canKeep: () => Promise<boolean>;
}

/** A key as the user pasted it, or undefined when it is blank or too long. */
export function pastedKey(value: unknown): string | undefined {
  const key = typeof value === 'string' ? value.trim() : '';
  return key !== '' && key.length <= MAX_KEY ? key : undefined;
}

export function assistantKeys(
  secrets: Pick<SecretStore, 'canKeep' | 'get' | 'set'>,
): AssistantKeys {
  return {
    get: (provider) => secrets.get(keyName(provider)),
    save: (provider, key) => secrets.set(keyName(provider), key),
    forget: async (provider) => {
      await secrets.set(keyName(provider), undefined);
    },
    canKeep: () => secrets.canKeep(),
  };
}
