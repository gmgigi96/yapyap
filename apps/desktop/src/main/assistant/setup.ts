import { isLocalServer } from '../../shared/local-server.ts';
import type { KeyedProvider } from '../../shared/chrome-api.ts';
import type { Settings } from '../settings/schema.ts';
import { KEYED_PROVIDERS } from './keys.ts';
import { autoModel, NO_KEY, type modelsOf, type ModelOption, type ProviderId } from './models.ts';
import { anthropicProvider } from './providers/anthropic.ts';
import { openAIProvider } from './providers/openai.ts';
import { privateProvider } from './providers/private.ts';
import type { Provider } from './providers/provider.ts';
import type { EngineHost } from './private/engine-host.ts';

type AssistantSettings = Settings['assistant'];

/** What decides who answers. */
export interface SetupInputs {
  readonly settings: AssistantSettings;
  /** The user's keys, by provider; undefined where none is saved. */
  readonly keys: Readonly<Record<KeyedProvider, string | undefined>>;
  /** The downloaded private model, if it is all there. */
  readonly privateModel: { readonly id: string; readonly name: string } | undefined;
}

/**
 * Why the assistant cannot answer yet, or '' when it can: it is off,
 * nothing is set up, the chosen provider lacks its key, the private model
 * or a server address, or the provider listed no model.
 */
type Missing = '' | 'off' | 'setup' | 'key' | 'download' | 'model';

/** Who answers, with what, and what is missing. */
export interface Setup {
  readonly provider: ProviderId | undefined;
  readonly missing: Missing;
  /** The provider's models, empty until it is set up; never asked before. */
  readonly models: readonly ModelOption[];
  /** The model Auto would use. */
  readonly auto: ModelOption | undefined;
  /** The model in use: the user's pick while the provider still lists it, or Auto's. */
  readonly model: string;
  readonly key: string;
  readonly endpoint: string;
}

/**
 * Who answers (ADR 0017): the provider the user chose, or, on Automatic,
 * the first that is set up, from the most private on: the downloaded
 * private model, the model server on this computer, Claude, then OpenAI.
 */
export function chosenProvider(inputs: SetupInputs): ProviderId | undefined {
  const { provider, localServer } = inputs.settings;
  if (provider !== 'auto') {
    return provider;
  }
  if (inputs.privateModel !== undefined) {
    return 'built-in';
  }
  if (isLocalServer(localServer)) {
    return 'local';
  }
  return KEYED_PROVIDERS.find((keyed) => inputs.keys[keyed] !== undefined);
}

/** What the provider still needs before it can be asked anything, its list of models included. */
function missingFor(provider: ProviderId | undefined, inputs: SetupInputs): Missing {
  switch (provider) {
    case undefined:
      return 'setup';
    case 'built-in':
      return inputs.privateModel === undefined ? 'download' : '';
    case 'local':
      return isLocalServer(inputs.settings.localServer) ? '' : 'setup';
    default:
      return inputs.keys[provider] === undefined ? 'key' : '';
  }
}

/**
 * The setup as it stands. The provider is asked for its models only once
 * everything else is in place, so nothing is sent anywhere before the
 * assistant is set up.
 */
export async function currentSetup(
  inputs: SetupInputs,
  list: typeof modelsOf,
  fetch: typeof globalThis.fetch,
): Promise<Setup> {
  const provider = chosenProvider(inputs);
  const { key, endpoint } = reachOf(provider, inputs);
  const before = inputs.settings.enabled ? missingFor(provider, inputs) : 'off';
  const none = { provider, key, endpoint, models: [], auto: undefined, model: '' };
  if (before !== '' || provider === undefined) {
    return { ...none, missing: before };
  }
  const models = await list({ provider, key, endpoint, privateModel: inputs.privateModel }, fetch);
  return { ...none, ...picked(provider, models, inputs.settings.model) };
}

/** The key or the server address the provider is reached with. */
function reachOf(
  provider: ProviderId | undefined,
  inputs: SetupInputs,
): { readonly key: string; readonly endpoint: string } {
  if (provider === 'anthropic' || provider === 'openai') {
    return { key: inputs.keys[provider] ?? '', endpoint: '' };
  }
  return { key: '', endpoint: provider === 'local' ? inputs.settings.localServer : '' };
}

/** The model in use: the user's pick while the provider lists it, or Auto's. */
function picked(
  provider: ProviderId,
  models: readonly ModelOption[],
  pick: string,
): Pick<Setup, 'models' | 'auto' | 'model' | 'missing'> {
  const auto = autoModel(provider, models);
  const chosen = models.find(({ id }) => id === pick) ?? auto;
  return {
    models,
    auto,
    model: chosen?.id ?? '',
    missing: chosen === undefined ? 'model' : '',
  };
}

/** The provider a complete setup describes. */
export function providerFor(
  setup: Setup,
  fetch: typeof globalThis.fetch,
  engine: Pick<EngineHost, 'complete'>,
): Provider {
  const { model, key: apiKey } = setup;
  switch (setup.provider) {
    case 'anthropic':
      return anthropicProvider({ apiKey, model, fetch });
    case 'openai':
      return openAIProvider({ apiKey, model, fetch });
    case 'local':
      return openAIProvider({ model, fetch, apiKey: NO_KEY, baseURL: setup.endpoint });
    default:
      return privateProvider(engine);
  }
}
