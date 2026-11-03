/** A list the bar shows, such as the model in use (#467): what the user sees of it. */
interface BarChoice {
  readonly label: string;
  readonly current: string;
  readonly options: readonly BarOption[];
}

interface BarOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A button the bar shows under its status line, for what the assistant
 * asks or offers now: allowing it in this chat, seeing what is sent,
 * sending a catch-up, copying or using a result, closing it, or a
 * one-click fix of the setup.
 */
export type BarButtonId = 'allow' | 'what-sent' | 'send' | 'copy' | 'use' | 'close' | 'fix';

export const BAR_BUTTON_IDS: readonly BarButtonId[] = [
  'allow',
  'what-sent',
  'send',
  'copy',
  'use',
  'close',
  'fix',
];

interface BarButton {
  readonly id: BarButtonId;
  readonly label: string;
  /** The button the status line is about. */
  readonly primary: boolean;
}

/** What the assistant bar above the message box shows (ADR 0013, ADR 0017). */
export interface AssistantBarState {
  /** A short line, such as "Thinking…"; empty for none. */
  readonly status: string;
  /** Waiting for the model. */
  readonly working: boolean;
  /** Reply suggestions, as plain text, never markup. */
  readonly suggestions: readonly string[];
  /** A longer text, such as a summary, a rewrite or exactly what is sent; null for none. */
  readonly result: string | null;
  readonly buttons: readonly BarButton[];
  /** The model in use, and the others to switch to; undefined before the assistant is set up. */
  readonly choice: BarChoice | undefined;
  /** How a draft can be rewritten: the styles, and the languages to translate it to. */
  readonly rewrites: readonly BarOption[];
}

/**
 * The global the WhatsApp preload exposes in the adapter's isolated world,
 * never in WhatsApp's own, for the bar's buttons (ADR 0013).
 */
export const ASSISTANT_BAR_BRIDGE = 'yapyapAssistantBar';

/** Fixed channels, one per user action, from the bar in WhatsApp's page to the main process. */
export const ASSISTANT_BAR_CHANNELS = {
  suggest: 'whatsapp:assistant-bar-suggest',
  summarize: 'whatsapp:assistant-bar-summarize',
  rewrite: 'whatsapp:assistant-bar-rewrite',
  catchUp: 'whatsapp:assistant-bar-catch-up',
  prompt: 'whatsapp:assistant-bar-prompt',
  use: 'whatsapp:assistant-bar-use',
  send: 'whatsapp:assistant-bar-send',
  choose: 'whatsapp:assistant-bar-choose',
  button: 'whatsapp:assistant-bar-button',
  settings: 'whatsapp:assistant-bar-settings',
} as const;

/**
 * What the bar's controls call. The main process checks every argument, since
 * anything in the adapter's world could call these.
 */
export interface AssistantBarBridge {
  readonly suggest: () => void;
  readonly summarize: () => void;
  /** Rewrites the draft in one of the offered ways. */
  readonly rewrite: (value: string) => void;
  readonly catchUp: () => void;
  /** Writes the message the user described. */
  readonly prompt: (text: string) => void;
  /** Puts the suggestion in the message box. */
  readonly use: (index: number) => void;
  /** Puts the suggestion in the message box and sends it, on this click only. */
  readonly send: (index: number) => void;
  /** Switches to another model. */
  readonly choose: (value: string) => void;
  /** Presses one of the buttons under the status line. */
  readonly button: (id: string) => void;
  /** Opens Settings, at the assistant. */
  readonly settings: () => void;
}
