import {
  CHROME_CHANNELS,
  type AssistantView,
  type KeyedProvider,
  type PrivateModelAction,
} from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { argumentsOf, isString, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import { problemWords, privateWords, setupWords } from './bar-words.ts';
import { isChatId, type AllowedChats } from './chats.ts';
import type { AssistantCore } from './core.ts';
import { KEYED_PROVIDERS, pastedKey, type AssistantKeys } from './keys.ts';
import type { LocalServer } from './local-servers.ts';
import { keyProblem } from './models.ts';
import { sizeText } from './private/catalog.ts';
import type { PrivateModels, PrivateModelStatus } from './private/private-model.ts';

export interface AssistantSettingsDependencies {
  readonly core: Pick<AssistantCore, 'setup'>;
  readonly keys: AssistantKeys;
  readonly privateModels: PrivateModels;
  readonly chats: Pick<AllowedChats, 'list' | 'forget'>;
  /** Every account, to name the ones with allowed chats. */
  readonly accounts: () => readonly { readonly id: string; readonly name: string }[];
  readonly findServers: () => Promise<readonly LocalServer[]>;
  /** The assistant's confined `fetch` (ADR 0017). */
  readonly fetch: typeof globalThis.fetch;
  /** Tells the bar the setup changed. */
  readonly changed: () => void;
}

const words = en.assistant.settings.private;

/** What the user can do with the private model in each phase. */
function actionsOf({ phase, smaller }: PrivateModelStatus): readonly PrivateModelAction[] {
  switch (phase.kind) {
    case 'downloading':
      return ['pause'];
    case 'paused':
      return ['resume', 'remove'];
    case 'ready':
      return ['remove'];
    case 'out-of-memory':
      return smaller ? ['smaller', 'remove'] : ['remove'];
    default:
      return ['download'];
  }
}

function privateStatus(status: PrivateModelStatus): string {
  switch (status.phase.kind) {
    case 'none':
      return words.none;
    case 'ready':
      return words.ready({ size: sizeText(status.used) });
    default:
      return privateWords(status).status;
  }
}

async function chatsOf(deps: AssistantSettingsDependencies): Promise<AssistantView['chats']> {
  const accounts = new Map(deps.accounts().map(({ id, name }) => [id, name]));
  const listed = await deps.chats.list();
  return listed.flatMap(({ account, chats }) => {
    const accountName = accounts.get(account);
    return accountName === undefined || chats.length === 0
      ? []
      : [
          {
            account,
            accountName,
            chats: chats.map(({ id, name }) => ({ id, name: name ?? null })),
          },
        ];
  });
}

async function viewOf(deps: AssistantSettingsDependencies): Promise<AssistantView> {
  const setup = await deps.core.setup();
  const model = await deps.privateModels.status();
  const blocked = setup.missing !== '' && setup.missing !== 'off';
  return {
    inUse: setup.provider ?? null,
    status: blocked ? setupWords(setup, model).status : '',
    keys: {
      anthropic: (await deps.keys.get('anthropic')) !== undefined,
      openai: (await deps.keys.get('openai')) !== undefined,
    },
    privateModel: {
      size: sizeText(model.model.size),
      status: privateStatus(model),
      actions: actionsOf(model),
    },
    models: setup.models,
    auto: setup.auto?.label ?? null,
    chats: await chatsOf(deps),
  };
}

const isProvider = (value: unknown): value is KeyedProvider =>
  (KEYED_PROVIDERS as readonly unknown[]).includes(value);

const ACTIONS: ReadonlySet<unknown> = new Set<PrivateModelAction>([
  'download',
  'pause',
  'resume',
  'remove',
  'smaller',
]);

function runAction(models: PrivateModels, action: PrivateModelAction): Promise<void> | void {
  switch (action) {
    case 'pause':
      models.pause();
      return;
    case 'remove':
      return models.remove();
    case 'smaller':
      return models.smaller();
    default:
      models.download();
  }
}

/** Testing a key: '' when the provider answers, else what failed, in the user's words. */
async function testKey(deps: AssistantSettingsDependencies, provider: KeyedProvider) {
  const key = await deps.keys.get(provider);
  const problem = key === undefined ? 'auth' : await keyProblem(provider, key, deps.fetch);
  return problem === '' ? '' : problemWords(problem, provider, false).status;
}

/** Keys and the private model: what the bar shows changes with them. */
function setupHandlers(deps: AssistantSettingsDependencies): ChromeHandler[] {
  const changing = async <T>(work: () => Promise<T> | T): Promise<T> => {
    const result = await work();
    deps.changed();
    return result;
  };
  return [
    {
      channel: CHROME_CHANNELS.assistantSaveKey,
      accepts: argumentsOf(isProvider, (key) => pastedKey(key) !== undefined),
      handle: (_call, provider, key) =>
        changing(() => deps.keys.save(provider as KeyedProvider, String(pastedKey(key)))),
    },
    {
      channel: CHROME_CHANNELS.assistantForgetKey,
      accepts: argumentsOf(isProvider),
      handle: (_call, provider) => changing(() => deps.keys.forget(provider as KeyedProvider)),
    },
    {
      channel: CHROME_CHANNELS.assistantPrivateModel,
      accepts: argumentsOf((action) => ACTIONS.has(action)),
      handle: (_call, action) =>
        changing(() => runAction(deps.privateModels, action as PrivateModelAction)),
    },
  ];
}

/**
 * Settings › Assistant's operations (ADR 0017). Each checks its payload:
 * a key only as a short pasted text for a known provider, which is never
 * logged or sent back; a chat only by its fingerprint.
 */
export function assistantHandlers(deps: AssistantSettingsDependencies): ChromeHandler[] {
  return [
    { channel: CHROME_CHANNELS.assistantView, accepts: noArguments, handle: () => viewOf(deps) },
    ...setupHandlers(deps),
    {
      channel: CHROME_CHANNELS.assistantTestKey,
      accepts: argumentsOf(isProvider),
      handle: (_call, provider) => testKey(deps, provider as KeyedProvider),
    },
    {
      channel: CHROME_CHANNELS.assistantFindServers,
      accepts: noArguments,
      handle: () => deps.findServers(),
    },
    {
      channel: CHROME_CHANNELS.assistantForgetChat,
      accepts: argumentsOf(isString, isChatId),
      handle: (_call, account, id) => {
        deps.chats.forget(account as string, id as string);
      },
    },
  ];
}
