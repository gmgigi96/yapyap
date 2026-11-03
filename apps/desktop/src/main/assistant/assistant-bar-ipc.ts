import { MAX_PROMPT } from '../../adapter/assistant-bar.ts';
import { ASSISTANT_BAR_CHANNELS, BAR_BUTTON_IDS } from '../../shared/assistant-bar-api.ts';
import { argumentsOf, noArguments, type PayloadCheck } from '../ipc/arguments.ts';
import {
  registerWhatsAppListeners,
  type WhatsAppIpc,
  type WhatsAppListener,
  type WhatsAppSenders,
} from '../ipc/whatsapp.ts';
import type { AssistantBar } from './bar.ts';

/** More suggestions than the bar ever shows. */
const MAX_SUGGESTIONS = 5;

export interface BarIpcDependencies extends WhatsAppSenders {
  /** The page of the account on screen, the only one whose bar is shown. */
  readonly activePage: () => object;
  /** Opens Settings, where the assistant is the first section. */
  readonly openSettings: () => void;
}

const isIndex = (index: unknown): boolean =>
  Number.isInteger(index) && Number(index) >= 0 && Number(index) < MAX_SUGGESTIONS;

const isPrompt = (text: unknown): boolean =>
  typeof text === 'string' && text.trim() !== '' && text.length <= MAX_PROMPT;

/** The bar's lists offer at most this long a value; the bar then checks it was offered. */
const MAX_CHOICE = 200;

const isChoice = (value: unknown): boolean =>
  typeof value === 'string' && value !== '' && value.length <= MAX_CHOICE;

const isButton = (id: unknown): boolean => (BAR_BUTTON_IDS as readonly unknown[]).includes(id);

type BarActions = Pick<
  AssistantBar,
  'suggest' | 'summarize' | 'rewrite' | 'catchUp' | 'prompt' | 'use' | 'send' | 'choose' | 'button'
>;

/**
 * Hears the bar's clicks from WhatsApp's page (ADR 0013). Only the active
 * account's WhatsApp view is heard, and only with the arguments each action
 * takes; anything else is dropped and logged without its content.
 */
export function listenToAssistantBar(
  ipc: WhatsAppIpc,
  bar: BarActions,
  deps: BarIpcDependencies,
): void {
  const on = (
    channel: string,
    accepts: PayloadCheck,
    act: (...args: never[]) => unknown,
  ): WhatsAppListener => ({
    channel,
    accepts,
    handle: ({ sender }, ...args) => {
      if (sender !== deps.activePage()) {
        deps.warn('Ignored an assistant bar message from outside the bar.');
        return;
      }
      Promise.resolve()
        .then(() => act(...(args as never[])))
        .catch(() => {
          deps.warn('An assistant bar action failed.');
        });
    },
  });
  const channels = ASSISTANT_BAR_CHANNELS;
  registerWhatsAppListeners(ipc, deps, [
    on(channels.suggest, noArguments, bar.suggest),
    on(channels.summarize, noArguments, bar.summarize),
    on(channels.rewrite, argumentsOf(isChoice), bar.rewrite),
    on(channels.catchUp, noArguments, bar.catchUp),
    on(channels.prompt, argumentsOf(isPrompt), (text: string) => bar.prompt(text.trim())),
    on(channels.use, argumentsOf(isIndex), bar.use),
    on(channels.send, argumentsOf(isIndex), bar.send),
    on(channels.choose, argumentsOf(isChoice), bar.choose),
    on(channels.button, argumentsOf(isButton), bar.button),
    on(channels.settings, noArguments, deps.openSettings),
  ]);
}
