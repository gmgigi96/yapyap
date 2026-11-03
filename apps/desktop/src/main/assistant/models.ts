import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { KeyedProvider } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { kindOf } from './providers/errors.ts';
import { REQUEST_TIMEOUT_MS, type ProviderErrorKind } from './providers/provider.ts';

/** Who answers: the private model on this computer, a service, or a model server on this computer. */
export type ProviderId = 'built-in' | 'anthropic' | 'openai' | 'local';

/** A model the user can switch to, under a name people can read. */
export interface ModelOption {
  readonly id: string;
  readonly label: string;
}

/** As many models as the bar and Settings list. */
export const MAX_MODELS = 20;

/** What a provider's list depends on. */
export interface ListTarget {
  readonly provider: ProviderId;
  /** The user's key; empty for a provider that needs none. */
  readonly key: string;
  /** The model server on this computer, for `local`. */
  readonly endpoint: string;
  /** The downloaded private model, for `built-in`. */
  readonly privateModel: { readonly id: string; readonly name: string } | undefined;
}

/**
 * OpenAI lists every model it serves, most of which cannot chat: images,
 * speech, embeddings and moderation would only clutter the list.
 */
const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search/i;

/** Local servers mostly take any key or none; the SDK still needs one to send. */
export const NO_KEY = 'no-key';

const common = (apiKey: string, fetch: typeof globalThis.fetch) => ({
  apiKey,
  fetch,
  timeout: REQUEST_TIMEOUT_MS,
  maxRetries: 1,
});

/** Claude's models, newest first, by the names Anthropic gives them. */
async function claudeModels(key: string, fetch: typeof globalThis.fetch): Promise<ModelOption[]> {
  const client = new Anthropic(common(key, fetch));
  const page = await client.models.list({ limit: MAX_MODELS });
  return page.data.map((model) => ({ id: model.id, label: model.display_name }));
}

/**
 * Ollama, Alpaca's server among them, reports each model's size, which the
 * OpenAI-style list leaves out; smaller models answer faster. Other servers
 * have no such list, so their own order stands.
 */
async function sizesOf(endpoint: string, fetch: typeof globalThis.fetch) {
  try {
    const response = await fetch(`${new URL(endpoint).origin}/api/tags`);
    const body = (await response.json()) as { models?: { name?: unknown; size?: unknown }[] };
    return new Map(
      (body.models ?? []).flatMap(({ name, size }) =>
        typeof name === 'string' && typeof size === 'number' ? [[name, size] as const] : [],
      ),
    );
  } catch {
    return new Map<string, number>();
  }
}

const bySize =
  (sizes: ReadonlyMap<string, number>) =>
  (a: ModelOption, b: ModelOption): number =>
    (sizes.get(a.id) ?? Infinity) - (sizes.get(b.id) ?? Infinity);

/** What OpenAI or a server on this computer lists, such as the models Ollama has installed. */
async function servedModels(
  target: ListTarget,
  fetch: typeof globalThis.fetch,
): Promise<ModelOption[]> {
  const local = target.provider === 'local';
  // The SDK refuses an empty key, which a server on this computer never needs.
  const client = new OpenAI({
    ...common(target.key || NO_KEY, fetch),
    ...(local ? { baseURL: target.endpoint } : {}),
  });
  const page = await client.models.list();
  // Newest first, as Anthropic lists Claude's, so the first fitting model is the newest.
  const options = [...page.data]
    .sort((a, b) => b.created - a.created)
    .map((model) => model.id)
    .filter((id) => local || !NOT_CHAT.test(id))
    .map((id) => ({ id, label: id }));
  return local ? options.sort(bySize(await sizesOf(target.endpoint, fetch))) : options;
}

/**
 * The tier of each provider's models made for quick, inexpensive answers,
 * which suits short chat replies: Claude's Haiku and OpenAI's mini models.
 * Naming a tier rather than a model keeps Auto on the newest one.
 */
const QUICK: Readonly<Record<ProviderId, RegExp | undefined>> = {
  anthropic: /haiku/i,
  openai: /mini/i,
  local: undefined,
  'built-in': undefined,
};

/**
 * The model Auto uses (#467): the newest of the provider's quick tier, the
 * newest model when there is no such tier, or, on a server on this
 * computer, the smallest installed model, which answers fastest. It
 * follows what the provider lists, so a newer model takes over on its own.
 */
export function autoModel(
  provider: ProviderId,
  options: readonly ModelOption[],
): ModelOption | undefined {
  const quick = QUICK[provider];
  const fitting =
    quick === undefined ? undefined : options.find(({ id, label }) => quick.test(`${id} ${label}`));
  return fitting ?? options[0];
}

/**
 * The models a provider lists, newest or, on this computer, smallest first;
 * none when it cannot list them, such as with a wrong key or a server that
 * is not running.
 */
export async function modelsOf(
  target: ListTarget,
  fetch: typeof globalThis.fetch,
): Promise<ModelOption[]> {
  if (target.provider === 'built-in') {
    const model = target.privateModel;
    return model === undefined
      ? []
      : [{ id: model.id, label: en.assistant.privateModel({ name: model.name }) }];
  }
  try {
    const listed =
      target.provider === 'anthropic'
        ? await claudeModels(target.key, fetch)
        : await servedModels(target, fetch);
    return listed.slice(0, MAX_MODELS);
  } catch {
    return [];
  }
}

/**
 * What is wrong with `key`, found by asking the provider for its models:
 * '' when it answers, else the kind of failure, such as `auth`.
 */
export async function keyProblem(
  provider: KeyedProvider,
  key: string,
  fetch: typeof globalThis.fetch,
): Promise<ProviderErrorKind | ''> {
  try {
    await (provider === 'anthropic'
      ? claudeModels(key, fetch)
      : servedModels({ provider, key, endpoint: '', privateModel: undefined }, fetch));
    return '';
  } catch (error) {
    return kindOf(error, provider === 'anthropic' ? Anthropic : OpenAI);
  }
}

/** How long a provider's list is kept before asking again: ten minutes. */
const MODELS_FOR_MS = 600_000;

/**
 * {@link modelsOf}, kept a while per provider and key, so answering in the
 * bar or Settings does not wait on the provider's list each time.
 */
export function keptModels(
  list: typeof modelsOf = modelsOf,
  now: () => number = Date.now,
): typeof modelsOf {
  const kept = new Map<string, { readonly at: number; readonly models: ModelOption[] }>();
  return async (target, fetch) => {
    const signature = JSON.stringify(target);
    const known = kept.get(signature);
    if (known !== undefined && now() - known.at <= MODELS_FOR_MS) {
      return known.models;
    }
    const models = await list(target, fetch);
    // An empty list is a provider that did not answer, which is asked again next time.
    if (models.length > 0) {
      kept.set(signature, { at: now(), models });
    }
    return models;
  };
}
