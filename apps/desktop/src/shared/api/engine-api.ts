/**
 * The private model's engine page (ADR 0017): a hidden, sandboxed window on
 * `app://engine`, which runs the model with wllama and talks to the main
 * process over two fixed channels, never the chrome API.
 */
export const ENGINE_ORIGIN = 'app://engine';

/** The global the engine preload exposes in the engine page. */
export const ENGINE_BRIDGE = 'yapyapEngine';

export const ENGINE_CHANNELS = {
  /** From the main process: what the page should do. */
  command: 'engine:command',
  /** From the page: what came of it. */
  event: 'engine:event',
} as const;

/** One message of the conversation the model continues. */
export interface EngineTurn {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** What the main process asks of the engine page; each command has its own number. */
export type EngineCommand =
  /** Loads the downloaded model, which the page reads from `app://engine/model.gguf`. */
  | { readonly type: 'load'; readonly id: number }
  /** Continues the conversation, streaming the text as it comes. */
  | { readonly type: 'complete'; readonly id: number; readonly turns: readonly EngineTurn[] }
  /** Stops the completion with number `id`. */
  | { readonly type: 'cancel'; readonly id: number };

/** Why the engine failed, in the words the assistant explains. */
export type EngineFailure = 'out-of-memory' | 'cancelled' | 'failed';

/** What the engine page tells the main process about the command with number `id`. */
export type EngineEvent =
  | { readonly type: 'text'; readonly id: number; readonly text: string }
  | { readonly type: 'done'; readonly id: number; readonly truncated: boolean }
  | { readonly type: 'failed'; readonly id: number; readonly kind: EngineFailure };

/** What the engine preload gives the page: its commands, and a way to answer them. */
export interface EngineBridge {
  readonly onCommand: (listener: (command: EngineCommand) => void) => void;
  readonly send: (event: EngineEvent) => void;
}
