import type { ReadChat } from '../../adapter/active-chat.ts';
import type { UnreadSummaryChat } from '../../adapter/unread-summary.ts';
import type { AssistantBarState, BarButtonId } from '../../shared/api/assistant-bar-api.ts';
import { en } from '../../shared/messages/en.ts';
import type { SettingsService } from '../settings/service.ts';
import { problemWords, privateWords, setupWords, type Fix, type Words } from './bar-words.ts';
import { CATCH_UP_INSTRUCTIONS, digestOf } from './catch-up.ts';
import type { AllowedChats } from './chats.ts';
import type { AssistantCore } from './core.ts';
import type { ProviderId } from './models.ts';
import type { PrivateModels } from './private/private-model.ts';
import { ProviderError } from './providers/provider.ts';
import {
  COMPOSE_INSTRUCTIONS,
  INSTRUCTIONS,
  SUMMARY_INSTRUCTIONS,
  suggestionsIn,
  transcriptOf,
} from './replies.ts';
import {
  cleanRewrite,
  rewriteInstructions,
  rewriteOf,
  rewriteOptions,
  type Rewrite,
} from './rewrites.ts';
import type { Setup } from './setup.ts';

/** What the bar needs of the account on screen; nothing here sends a message on its own. */
export interface BarAccounts {
  /** The account on screen; '' before there is one. */
  readonly active: () => string;
  /** Its open chat and last `messages` messages; null when no chat is open. */
  readonly readActiveChat: (messages: number) => Promise<ReadChat | null>;
  /** Its chats with unread messages, from the chat list alone, so none is opened or marked read. */
  readonly readUnreadSummary: () => Promise<readonly UnreadSummaryChat[]>;
  readonly readDraft: () => Promise<string | null>;
  /** Puts `text` in the open chat's message box in place of the draft; false when none is open. */
  readonly replaceDraft: (text: string) => Promise<boolean>;
  /** Presses Enter in the message box, as the user would to send. */
  readonly pressEnter: () => Promise<unknown>;
}

export interface BarDependencies {
  readonly core: AssistantCore;
  readonly settings: Pick<SettingsService, 'current' | 'update'>;
  readonly chats: Pick<AllowedChats, 'isAllowed' | 'allow'>;
  readonly accounts: BarAccounts;
  readonly privateModels: Pick<PrivateModels, 'status' | 'download' | 'smaller' | 'outOfMemory'>;
  /** The languages the bar offers to translate to. */
  readonly languages: readonly string[];
  readonly openSettings: () => void;
  readonly writeClipboard: (text: string) => unknown;
  /** Shows the bar, or takes it away. */
  readonly show: (visible: boolean) => void;
  /** Sends the bar's state to its page. */
  readonly publish: (state: AssistantBarState) => void;
}

/** A request about the open chat. */
type ChatRequest =
  | { readonly kind: 'suggest' }
  | { readonly kind: 'prompt'; readonly text: string }
  | { readonly kind: 'summarize' }
  | { readonly kind: 'rewrite'; readonly rewrite: Rewrite };

/** What the bar holds between clicks. */
interface BarContext {
  readonly deps: BarDependencies;
  state: AssistantBarState;
  /** The chat the shown suggestions or rewrite were made for, or the consent is asked in. */
  chat: string | null;
  /** The request waiting for the user to allow the assistant in its chat, whose buttons show only then. */
  pending: ChatRequest;
  /** The text the Copy or Use button acts on. */
  kept: string;
  /** Exactly what Send sends to catch the user up, once they saw it; its button shows only then. */
  catchUp: string;
  /** What the fix button does, which shows only once there is one. */
  fix: Fix;
  /** The bar shows what keeps the assistant from answering, which goes once it can. */
  blocked: boolean;
  /** A request runs; the next waits for it. */
  busy: boolean;
  /** WhatsApp drew the chat again while a request ran, so the chat is checked once it ends. */
  redrawn: boolean;
}

const text = en.assistant;
const MAX_SUGGESTION = 1000;

const EMPTY: AssistantBarState = {
  status: '',
  working: false,
  suggestions: [],
  result: null,
  buttons: [],
  choice: undefined,
  rewrites: [],
};

const button = (id: BarButtonId, label: string, primary = false) => ({ id, label, primary });
const close = button('close', text.bar.close);

/** What the bar shows while the model answers. */
const THINKING: Partial<AssistantBarState> = {
  status: text.status.thinking,
  working: true,
  buttons: [],
  result: null,
  suggestions: [],
};

function update(bar: BarContext, next: Partial<AssistantBarState>): void {
  bar.state = { ...bar.state, ...next };
  bar.deps.publish(bar.state);
}

/** Shows `words`, with its fix as a button, and nothing else. */
function say(
  bar: BarContext,
  { status, fix }: Words,
  extra: Partial<AssistantBarState> = {},
): void {
  bar.fix = fix?.action ?? bar.fix;
  const buttons = fix === undefined ? [] : [button('fix', fix.label, true)];
  update(bar, { status, buttons, suggestions: [], result: null, working: false, ...extra });
}

/** The model chip: Auto, which names the model it picks, then every model the provider lists. */
function choiceOf(setup: Setup, picked: string): AssistantBarState['choice'] {
  if (setup.models.length === 0) {
    return undefined;
  }
  const auto =
    setup.auto === undefined
      ? text.settings.model.auto
      : text.settings.model.autoNamed({ model: setup.auto.label });
  const listed = setup.models.some(({ id }) => id === picked);
  return {
    label: text.bar.model,
    current: listed ? picked : 'auto',
    options: [
      { value: 'auto', label: auto },
      ...setup.models.map(({ id, label }) => ({ value: id, label })),
    ],
  };
}

/** The setup, if the assistant can answer; else the bar says what is missing and how to fix it. */
async function ready(bar: BarContext): Promise<Setup | undefined> {
  const setup = await bar.deps.core.setup();
  const choice = choiceOf(setup, bar.deps.settings.current().assistant.model);
  if (setup.missing !== '') {
    bar.blocked = true;
    say(bar, setupWords(setup, await bar.deps.privateModels.status()), { choice });
    return undefined;
  }
  if (bar.blocked) {
    bar.blocked = false;
    say(bar, { status: '' }, { choice });
  } else {
    update(bar, { choice });
  }
  return setup;
}

const messages = (bar: BarContext): number =>
  Number(bar.deps.settings.current().assistant.messages);

/** What `request` sends about `chat`: its instructions and its text, or why there is nothing. */
async function material(
  bar: BarContext,
  request: ChatRequest,
  chat: ReadChat,
): Promise<{ readonly instructions: string; readonly text: string } | undefined> {
  const transcript = transcriptOf(chat, messages(bar));
  switch (request.kind) {
    case 'suggest':
      return { instructions: INSTRUCTIONS, text: transcript };
    case 'prompt':
      return {
        instructions: COMPOSE_INSTRUCTIONS,
        text: `${transcript}\n\nWhat I want to say: ${request.text}`,
      };
    case 'summarize':
      return { instructions: SUMMARY_INSTRUCTIONS, text: transcript };
    default: {
      const draft = await bar.deps.accounts.readDraft();
      return draft === null || draft.trim() === ''
        ? undefined
        : { instructions: rewriteInstructions(request.rewrite), text: draft };
    }
  }
}

/** Explains a failed request; a private model short of memory offers the smaller one. */
async function failed(bar: BarContext, setup: Setup, error: unknown): Promise<void> {
  const kind = error instanceof ProviderError ? error.kind : 'failed';
  if (kind === 'out-of-memory') {
    bar.deps.privateModels.outOfMemory();
  }
  const { smaller } = await bar.deps.privateModels.status();
  say(bar, problemWords(kind, setup.provider, smaller));
}

/** Shows what the model answered to `request`, as suggestions or a text to read or use. */
function answered(bar: BarContext, request: ChatRequest, answer: string): void {
  if (request.kind === 'summarize') {
    bar.kept = answer.trim();
    say(bar, { status: '' }, { result: bar.kept, buttons: [button('copy', text.bar.copy), close] });
    return;
  }
  if (request.kind === 'rewrite') {
    bar.kept = cleanRewrite(answer);
    const use = button('use', text.bar.useRewrite, true);
    say(
      bar,
      { status: '' },
      { result: bar.kept, buttons: [use, button('copy', text.bar.copy), close] },
    );
    return;
  }
  const found = request.kind === 'suggest' ? suggestionsIn(answer) : [cleanRewrite(answer)];
  const suggestions = found
    .filter((item) => item !== '')
    .map((item) => item.slice(0, MAX_SUGGESTION));
  say(bar, { status: suggestions.length === 0 ? text.status.nothing : '' }, { suggestions });
}

/** Asks the model about `chat`, which the user allowed, and shows the answer. */
async function run(bar: BarContext, setup: Setup, request: ChatRequest, chat: ReadChat) {
  const sent = await material(bar, request, chat);
  if (sent === undefined) {
    say(bar, { status: text.status.emptyDraft });
    return;
  }
  update(bar, THINKING);
  try {
    answered(bar, request, await bar.deps.core.ask(setup, sent.instructions, sent.text));
  } catch (error) {
    await failed(bar, setup, error);
  }
}

/** Asks the user to allow the assistant in this chat, before anything of it is read for the model. */
function askConsent(bar: BarContext, setup: Setup, request: ChatRequest): void {
  bar.pending = request;
  const status =
    setup.provider === 'built-in' || setup.provider === 'local'
      ? text.status.consentPrivate
      : text.status.consent({ provider: text.providers[setup.provider as ProviderId] });
  say(
    bar,
    { status },
    {
      buttons: [button('allow', text.bar.allow, true), button('what-sent', text.bar.whatSent)],
    },
  );
}

/**
 * Answers a request about the open chat. Nothing about a chat is read for
 * the model until the user allows the assistant there (#107).
 */
async function aboutChat(bar: BarContext, request: ChatRequest): Promise<void> {
  const setup = await ready(bar);
  if (setup === undefined) {
    return;
  }
  const chat = await bar.deps.accounts.readActiveChat(messages(bar));
  bar.chat = chat?.name ?? null;
  if (chat === null) {
    say(bar, { status: text.status.noChat });
    return;
  }
  const account = bar.deps.accounts.active();
  if (!bar.deps.chats.isAllowed(account, chat.name)) {
    askConsent(bar, setup, request);
    return;
  }
  await run(bar, setup, request, chat);
}

/** The open chat, if it is still the one the bar's offer was made for. */
async function sameChat(bar: BarContext): Promise<ReadChat | undefined> {
  const chat = await bar.deps.accounts.readActiveChat(messages(bar));
  if (chat?.name !== bar.chat) {
    say(bar, { status: text.status.chatChanged });
    return undefined;
  }
  return chat;
}

/** Shows exactly what would be sent about the chat, before the user allows it. */
async function whatSent(bar: BarContext): Promise<void> {
  const chat = await sameChat(bar);
  if (chat === undefined) {
    return;
  }
  const sent = await material(bar, bar.pending, chat);
  const result = sent === undefined ? null : `${sent.instructions}\n\n${sent.text}`;
  update(bar, {
    result,
    status: sent === undefined ? text.status.emptyDraft : text.status.preview,
    buttons: [button('allow', text.bar.allow, true), close],
  });
}

/** Allows the assistant in the chat the consent was asked in, while it is still open, and answers. */
async function allow(bar: BarContext): Promise<void> {
  const request = bar.pending;
  const chat = await sameChat(bar);
  if (chat === undefined) {
    return;
  }
  await bar.deps.chats.allow(bar.deps.accounts.active(), chat.name);
  const setup = await ready(bar);
  if (setup !== undefined) {
    await run(bar, setup, request, chat);
  }
}

/**
 * Previews exactly what catching up sends (#106): each unread chat's
 * name, count and latest message, from the chat list alone. Send is the
 * user's consent for that one text, and allows the assistant in no chat.
 */
async function catchUp(bar: BarContext): Promise<void> {
  if ((await ready(bar)) === undefined) {
    return;
  }
  const digest = digestOf(await bar.deps.accounts.readUnreadSummary());
  if (digest === '') {
    say(bar, { status: text.status.noUnread });
    return;
  }
  bar.catchUp = digest;
  say(
    bar,
    { status: text.status.catchUp },
    {
      result: `${CATCH_UP_INSTRUCTIONS}\n\n${digest}`,
      buttons: [button('send', text.bar.send, true), close],
    },
  );
}

/** Sends the catch-up the user saw, and only that, then shows what the model made of it. */
async function sendCatchUp(bar: BarContext): Promise<void> {
  const digest = bar.catchUp;
  const setup = await ready(bar);
  if (setup === undefined) {
    return;
  }
  update(bar, THINKING);
  try {
    const answer = await bar.deps.core.ask(setup, CATCH_UP_INSTRUCTIONS, digest);
    answered(bar, { kind: 'summarize' }, answer);
  } catch (error) {
    await failed(bar, setup, error);
  }
}

/** Puts the kept rewrite in place of the draft, if its chat is still open. */
async function useRewrite(bar: BarContext): Promise<void> {
  if ((await sameChat(bar)) !== undefined && (await bar.deps.accounts.replaceDraft(bar.kept))) {
    say(bar, { status: '' });
  }
}

const FIXES: Readonly<Record<Fix, (deps: BarDependencies) => unknown>> = {
  settings: (deps) => {
    deps.openSettings();
  },
  resume: (deps) => {
    deps.privateModels.download();
  },
  smaller: (deps) => deps.privateModels.smaller(),
};

const BUTTONS: Readonly<Record<BarButtonId, (bar: BarContext) => unknown>> = {
  allow,
  'what-sent': whatSent,
  send: sendCatchUp,
  copy: (bar) => {
    bar.deps.writeClipboard(bar.kept);
    update(bar, { status: text.status.copied });
  },
  use: useRewrite,
  close: (bar) => {
    say(bar, { status: '' });
  },
  fix: (bar) => FIXES[bar.fix](bar.deps),
};

/** Puts the suggestion at `index` in the message box, if the chat it was made for is still open. */
async function pick(bar: BarContext, index: number): Promise<boolean> {
  const suggestion = bar.state.suggestions[index];
  if (suggestion === undefined || (await sameChat(bar)) === undefined) {
    return false;
  }
  return bar.deps.accounts.replaceDraft(suggestion);
}

/** Switches to an offered model, and asks again with it if suggestions were showing (#467). */
async function choose(bar: BarContext, value: string): Promise<void> {
  const offered = bar.state.choice?.options.some((option) => option.value === value) === true;
  if (!offered) {
    return;
  }
  bar.deps.settings.update((settings) => ({
    ...settings,
    assistant: { ...settings.assistant, model: value },
  }));
  if (bar.state.suggestions.length > 0) {
    await aboutChat(bar, { kind: 'suggest' });
  }
}

/** Asks for suggestions when a message arrives, only where the assistant may already read the chat. */
async function suggestOnArrival(bar: BarContext): Promise<void> {
  const setup = await bar.deps.core.setup();
  const chat = setup.missing === '' ? await bar.deps.accounts.readActiveChat(messages(bar)) : null;
  const account = bar.deps.accounts.active();
  if (chat === null || !bar.deps.chats.isAllowed(account, chat.name)) {
    return;
  }
  bar.chat = chat.name;
  await run(bar, setup, { kind: 'suggest' }, chat);
}

/** Whether the bar shows nothing the user is reading or waiting for. */
const idle = (bar: BarContext): boolean =>
  !bar.busy && bar.state.result === null && bar.state.suggestions.length === 0;

/** Shows how the setup stands. */
async function refresh(bar: BarContext): Promise<void> {
  if (idle(bar)) {
    await ready(bar);
  }
}

/** What the bar does with the user's clicks, and with messages as they arrive. */
export interface AssistantBar {
  readonly state: () => AssistantBarState;
  /** Shows or hides the bar as the settings say, and how the setup stands. */
  readonly refresh: () => Promise<void>;
  readonly suggest: () => Promise<void>;
  readonly suggestOnArrival: () => Promise<void>;
  readonly prompt: (text: string) => Promise<void>;
  readonly summarize: () => Promise<void>;
  readonly rewrite: (value: string) => Promise<void>;
  readonly catchUp: () => Promise<void>;
  readonly use: (index: number) => Promise<void>;
  readonly send: (index: number) => Promise<void>;
  readonly choose: (value: string) => Promise<void>;
  readonly button: (id: string) => Promise<void>;
  /** The private model changed; its download's progress shows while the bar has nothing else to. */
  readonly privateModelChanged: () => Promise<void>;
  /** WhatsApp drew the open chat again, which it does when the user opens another. */
  readonly chatRedrawn: () => Promise<void>;
}

/** Answers a request about the open chat, unless another request runs. */
const chatRequest = (bar: BarContext, request: ChatRequest): Promise<void> =>
  once(bar, () => aboutChat(bar, request));

/** Rewrites the draft in one of the offered ways; anything else is dropped. */
async function rewriteDraft(bar: BarContext, value: string): Promise<void> {
  const rewrite = rewriteOf(value, bar.deps.languages);
  if (rewrite !== undefined) {
    await chatRequest(bar, { kind: 'rewrite', rewrite });
  }
}

/** Sends a suggestion on the user's click: in the message box, then Enter, as the user would. */
async function send(bar: BarContext, index: number): Promise<void> {
  if (await pick(bar, index)) {
    await bar.deps.accounts.pressEnter();
    say(bar, { status: '' });
  }
}

/** Presses one of the buttons the bar shows now; any other is dropped. */
function press(bar: BarContext, id: string): Promise<void> {
  const shown = bar.state.buttons.find((offered) => offered.id === id);
  return shown === undefined
    ? Promise.resolve()
    : once(bar, () => Promise.resolve(BUTTONS[shown.id](bar)));
}

/** Runs `work` unless another request runs: one at a time, and a second click is dropped. */
async function once(bar: BarContext, work: () => Promise<unknown>): Promise<void> {
  if (bar.busy) {
    return;
  }
  bar.busy = true;
  try {
    await work();
  } finally {
    bar.busy = false;
  }
  if (bar.redrawn) {
    bar.redrawn = false;
    await once(bar, () => forgetOtherChat(bar));
  }
}

/** Whether the bar shows something made for, or asked about, its chat. */
const aboutItsChat = (bar: BarContext): boolean =>
  bar.chat !== null &&
  (bar.state.suggestions.length > 0 || bar.state.result !== null || bar.state.buttons.length > 0);

/**
 * Takes away what the bar shows for its chat once another chat is open, so
 * suggestions never sit above the wrong chat. The open chat is read only
 * then, and a chat that cannot be read leaves the bar as it is.
 */
async function forgetOtherChat(bar: BarContext): Promise<void> {
  if (!aboutItsChat(bar)) {
    return;
  }
  const chat = await bar.deps.accounts.readActiveChat(1).catch(() => undefined);
  if (chat === undefined || chat?.name === bar.chat) {
    return;
  }
  bar.chat = null;
  bar.kept = '';
  say(bar, { status: '' });
  await refresh(bar);
}

/** WhatsApp drew the chat again; a request that runs is let finish first. */
function chatRedrawn(bar: BarContext): Promise<void> {
  if (bar.busy) {
    bar.redrawn = true;
    return Promise.resolve();
  }
  return once(bar, () => forgetOtherChat(bar));
}

/** Download progress shows while the bar has nothing else to; a ready model clears it. */
async function followDownload(bar: BarContext): Promise<void> {
  if (!idle(bar)) {
    return;
  }
  const status = await bar.deps.privateModels.status();
  if (status.phase.kind === 'ready' || status.phase.kind === 'none') {
    await refresh(bar);
    return;
  }
  bar.blocked = true;
  say(bar, privateWords(status));
}

/**
 * The assistant bar above the open chat's message box (ADR 0013, ADR 0017):
 * YapYap's own assistant, which reads a chat only once the user allowed it
 * there, shows what it would send when asked, and acts only on the user's
 * clicks. It puts drafts in the message box; only the user's click on a
 * suggestion's Send sends one, after checking the chat is still the same.
 */
export function createAssistantBar(deps: BarDependencies): AssistantBar {
  const bar: BarContext = {
    deps,
    state: { ...EMPTY, rewrites: rewriteOptions(deps.languages) },
    chat: null,
    pending: { kind: 'suggest' },
    kept: '',
    catchUp: '',
    fix: 'settings',
    blocked: false,
    busy: false,
    redrawn: false,
  };
  return {
    state: () => bar.state,
    refresh: async () => {
      deps.show(deps.settings.current().assistant.enabled);
      await refresh(bar);
    },
    suggest: () => chatRequest(bar, { kind: 'suggest' }),
    suggestOnArrival: () => once(bar, () => suggestOnArrival(bar)),
    prompt: (typed) => chatRequest(bar, { kind: 'prompt', text: typed }),
    summarize: () => chatRequest(bar, { kind: 'summarize' }),
    rewrite: (value) => rewriteDraft(bar, value),
    catchUp: () => once(bar, () => catchUp(bar)),
    use: async (index) => {
      await pick(bar, index);
    },
    send: (index) => send(bar, index),
    choose: (value) => once(bar, () => choose(bar, value)),
    button: (id) => press(bar, id),
    privateModelChanged: () => followDownload(bar),
    chatRedrawn: () => chatRedrawn(bar),
  };
}
