import { Wllama, WllamaAbortError, type ChatCompletionMessage } from '@wllama/wllama/esm/index.js';
import type { EngineFailure, EngineTurn } from '../../shared/api/engine-api.ts';

/** What the engine wrote, and whether it stopped at its length limit. */
interface EngineReply {
  readonly text: string;
  readonly truncated: boolean;
}

/** A failure of the engine, with fixed text: never the engine's own, which could quote the prompt. */
export class EngineError extends Error {
  readonly kind: EngineFailure;

  constructor(kind: EngineFailure) {
    super(`The model on this computer failed: ${kind}.`);
    this.name = 'EngineError';
    this.kind = kind;
  }
}

/**
 * The engine that runs a model in this page. Behind an interface, so tests
 * run without WebAssembly or a model.
 */
export interface Engine {
  readonly load: (model: Blob) => Promise<void>;
  readonly chat: (
    turns: readonly EngineTurn[],
    onText: (text: string) => void,
    signal?: AbortSignal,
  ) => Promise<EngineReply>;
  readonly unload: () => Promise<void>;
}

/** Room for the instructions, 20 messages and the answer. */
const CONTEXT_TOKENS = 4096;

/** A few short replies or one rewritten message; small models ramble past this. */
const MAX_TOKENS = 512;

/** Memory that cannot be had, as WebAssembly and llama.cpp word it. */
const OUT_OF_MEMORY = /memory|alloc|\boom\b/i;

/** The kind of a failure the engine raised. */
export function failureOf(error: unknown): EngineFailure {
  if (error instanceof EngineError) {
    return error.kind;
  }
  if (error instanceof WllamaAbortError) {
    return 'cancelled';
  }
  return error instanceof Error && OUT_OF_MEMORY.test(error.message) ? 'out-of-memory' : 'failed';
}

/**
 * The engine's messages are its own; nothing is ever written to the
 * console, since a log line could quote a chat.
 */
const SILENT = {
  debug: () => undefined,
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** What the engine needs from the page: its `.wasm`, and whether there is a usable GPU. */
export interface EngineSetup {
  /** The address of the engine's `.wasm`, shipped with YapYap. */
  readonly wasm: string;
  readonly hasGpu: () => Promise<boolean>;
}

async function generate(
  wllama: Wllama,
  turns: readonly EngineTurn[],
  onText: (text: string) => void,
  signal: AbortSignal | undefined,
): Promise<EngineReply> {
  let text = '';
  let truncated = false;
  await wllama.createChatCompletion({
    messages: turns.map((turn): ChatCompletionMessage => ({ ...turn })),
    max_tokens: MAX_TOKENS,
    stream: true,
    ...(signal === undefined ? {} : { abortSignal: signal }),
    onData: (chunk) => {
      const [choice] = chunk.choices;
      const piece = choice?.delta.content ?? '';
      text += piece;
      truncated = choice?.finish_reason === 'length' || truncated;
      if (piece !== '') {
        onText(piece);
      }
    },
  });
  return { text, truncated };
}

/**
 * wllama, llama.cpp compiled to WebAssembly (ADR 0017, #457). Its `.wasm`
 * comes only from YapYap's own files: compatibility mode, which
 * would fetch another build from a CDN, is turned off, so nothing
 * executable is ever downloaded. It runs on the GPU when the page gets an
 * adapter, and otherwise on half the processor's threads, which leaves the
 * rest of the computer room.
 */
export function wllamaEngine(setup: EngineSetup): Engine {
  let wllama: Wllama | undefined;
  const loaded = (): Wllama => {
    if (wllama === undefined) {
      throw new EngineError('failed');
    }
    return wllama;
  };
  return {
    load: async (model) => {
      const engine = new Wllama(
        { default: setup.wasm },
        { logger: SILENT, suppressNativeLog: true },
      );
      engine.setCompat(null);
      const gpu = await setup.hasGpu();
      try {
        await engine.loadModel([model], {
          n_ctx: CONTEXT_TOKENS,
          ...(gpu ? {} : { n_gpu_layers: 0 }),
        });
      } catch (error) {
        // A model that did not fit leaves its worker and memory behind otherwise.
        await engine.exit().catch(() => undefined);
        throw error;
      }
      wllama = engine;
    },
    chat: async (turns, onText, signal) => generate(loaded(), turns, onText, signal),
    unload: async () => {
      await wllama?.exit();
      wllama = undefined;
    },
  };
}
