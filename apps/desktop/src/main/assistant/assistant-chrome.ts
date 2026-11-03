import type { ReadChat } from '../../adapter/active-chat.ts';
import type { UnreadSummaryChat } from '../../adapter/unread-summary.ts';
import { en } from '../../shared/messages/en.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import type { SettingsService } from '../settings/service.ts';
import type { AssistantBarView } from './bar-page.ts';
import { createAssistantBar, type AssistantBar, type BarAccounts } from './bar.ts';
import type { AllowedChats } from './chats.ts';
import { assistantCore, type AssistantCore } from './core.ts';
import type { AssistantKeys } from './keys.ts';
import type { LocalServer } from './local-servers.ts';
import { keptModels } from './models.ts';
import type { Catalog, Hardware } from './private/catalog.ts';
import { createEngineHost, type EngineHost, type EngineWindow } from './private/engine-host.ts';
import type { ModelFiles } from './private/files.ts';
import { privateModels, type PrivateModels } from './private/private-model.ts';
import { assistantHandlers } from './settings-handlers.ts';
import type { AssistantState } from './state.ts';

/** The accounts as the assistant reaches them: the one on screen, and its open chat. */
export interface AssistantAccounts {
  readonly entries: readonly {
    readonly id: string;
    readonly name: string;
    readonly active: boolean;
  }[];
  readonly readActiveChat: (messages: number) => Promise<ReadChat | null>;
  readonly readUnreadSummary: () => Promise<readonly UnreadSummaryChat[]>;
  readonly readDraft: () => Promise<string | null>;
  readonly replaceDraft: (text: string) => Promise<boolean>;
  readonly pressEnter: () => Promise<boolean>;
}

/** What the assistant is made of, which `index.ts` puts together from Electron. */
export interface AssistantSources {
  /** The assistant's confined `fetch` (ADR 0017). */
  readonly fetch: typeof globalThis.fetch;
  readonly catalog: Catalog;
  readonly hardware: () => Hardware;
  readonly files: ModelFiles;
  readonly state: AssistantState;
  readonly chats: AllowedChats;
  readonly keys: AssistantKeys;
  /** The system's languages, to offer translating to. */
  readonly languages: readonly string[];
  readonly findServers: () => Promise<readonly LocalServer[]>;
  /** Passes the engine page's events on, as they come over IPC. */
  readonly listenToEngine: (hear: EngineHost['hear']) => void;
  readonly now: () => number;
}

export interface AssistantChromeDependencies {
  readonly sources: AssistantSources;
  readonly settings: SettingsService;
  /** Opens the hidden engine window, registered with the views (ADR 0017). */
  readonly openEngine: () => EngineWindow;
  /** The accounts once they are open. */
  readonly accounts: () => AssistantAccounts | undefined;
  readonly openSettings: () => void;
  readonly writeClipboard: (text: string) => unknown;
  /** A system notification, for what the user should know when the bar cannot show it. */
  readonly notify: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface AssistantChrome {
  readonly handlers: readonly ChromeHandler[];
  /** Gives the bar its view in the active account's WhatsApp, made from the bar (ADR 0013). */
  readonly attachBar: (create: (bar: AssistantBar) => AssistantBarView) => void;
  /** Shows the setup anew, as when the account on screen changes. */
  readonly refreshBar: () => void;
  /** The menu's and shortcuts' actions, which the bar answers. */
  readonly actions: Pick<AssistantBar, 'suggest' | 'summarize' | 'catchUp'>;
  /** The downloaded private model's file, for the engine page. */
  readonly modelFile: () => string | undefined;
}

/** The account on screen, as the bar reaches it; before there are accounts, there is no chat. */
export function barAccounts(current: () => AssistantAccounts | undefined): BarAccounts {
  return {
    active: () => current()?.entries.find((entry) => entry.active)?.id ?? '',
    readActiveChat: (messages) => current()?.readActiveChat(messages) ?? Promise.resolve(null),
    readUnreadSummary: () => current()?.readUnreadSummary() ?? Promise.resolve([]),
    readDraft: () => current()?.readDraft() ?? Promise.resolve(null),
    replaceDraft: (text) => current()?.replaceDraft(text) ?? Promise.resolve(false),
    pressEnter: () => current()?.pressEnter() ?? Promise.resolve(false),
  };
}

/** Runs `run` after `ms`; returns how to call it off. */
export const later = (ms: number, run: () => void): (() => void) => {
  const timer = setTimeout(run, ms);
  return () => {
    clearTimeout(timer);
  };
};

/** Where the bar's view goes once the accounts are open. */
interface ViewSlot {
  current?: AssistantBarView;
}

/** The bar, which shows itself through the view it is given once the accounts are open. */
function barOf(
  deps: AssistantChromeDependencies,
  core: AssistantCore,
  models: PrivateModels,
  view: ViewSlot,
): AssistantBar {
  return createAssistantBar({
    ...deps.sources,
    core,
    settings: deps.settings,
    privateModels: models,
    accounts: barAccounts(deps.accounts),
    openSettings: deps.openSettings,
    writeClipboard: deps.writeClipboard,
    show: (visible) => view.current?.show(visible),
    publish: (state) => view.current?.publish(state),
  });
}

/**
 * Runs a menu or shortcut action in the bar, which sits above the message
 * box: with no chat open, or the assistant turned off, there is nowhere to
 * show it, so a notice says what to do instead of nothing happening.
 */
function menuActions(
  deps: AssistantChromeDependencies,
  bar: AssistantBar,
  view: ViewSlot,
): AssistantChrome['actions'] {
  const run = (action: () => Promise<void>) => async (): Promise<void> => {
    if (!deps.settings.current().assistant.enabled) {
      deps.notify(en.assistant.status.off);
      return;
    }
    if ((await view.current?.onPage()) !== true) {
      deps.notify(en.assistant.status.openChat);
      return;
    }
    await action();
  };
  return { suggest: run(bar.suggest), summarize: run(bar.summarize), catchUp: run(bar.catchUp) };
}

/** Shows the setup anew in the bar, saying in the log when it cannot. */
function followers(deps: AssistantChromeDependencies, bar: AssistantBar) {
  const failed = (): void => {
    deps.warn('The assistant bar could not show the setup.');
  };
  return {
    refresh: (): void => {
      bar.refresh().catch(failed);
    },
    modelChanged: (): void => {
      bar.privateModelChanged().catch(failed);
    },
  };
}

/**
 * The AI assistant, part of YapYap (ADR 0017): the private model and its
 * engine window, the setup, the bar in WhatsApp's page, and Settings ›
 * Assistant's operations. The bar shows the setup anew whenever the
 * settings, the keys or the private model change.
 */
export function createAssistantChrome(deps: AssistantChromeDependencies): AssistantChrome {
  const { sources, settings } = deps;
  const engine = createEngineHost({ open: deps.openEngine, after: later, warn: deps.warn });
  sources.listenToEngine(engine.hear);
  const models = privateModels({ ...sources, closeEngine: engine.close });
  const core = assistantCore({
    ...sources,
    settings,
    privateModels: models,
    engine,
    list: keptModels(),
  });
  const view: ViewSlot = {};
  const bar = barOf(deps, core, models, view);
  const { refresh, modelChanged } = followers(deps, bar);
  settings.onChange(refresh);
  models.onChange(modelChanged);
  const handlers = assistantHandlers({
    ...sources,
    core,
    privateModels: models,
    accounts: () => deps.accounts()?.entries ?? [],
    changed: refresh,
  });
  return {
    handlers,
    attachBar: (create) => {
      view.current = create(bar);
      refresh();
    },
    refreshBar: refresh,
    actions: menuActions(deps, bar, view),
    modelFile: models.file,
  };
}
