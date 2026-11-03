import { Type } from 'typebox';
import { Value } from 'typebox/value';
import {
  ENGINE_ORIGIN,
  type EngineCommand,
  type EngineEvent,
  type EngineFailure,
  type EngineTurn,
} from '../../../shared/engine-api.ts';
import { isSameOrigin } from '../../navigation/link-policy.ts';
import type { Completion } from '../providers/provider.ts';

/** The hidden engine window, as the host drives it. */
export interface EngineWindow {
  readonly contents: object;
  readonly send: (command: EngineCommand) => void;
  /** Resolves once its page has loaded. */
  readonly loaded: Promise<void>;
  readonly close: () => void;
  readonly onClosed: (listener: () => void) => void;
}

export interface EngineHostDependencies {
  /** Opens the engine window, made with `createSecureWindow` (ADR 0017). */
  readonly open: () => EngineWindow;
  /** Runs `run` after `ms`; returns how to call it off. */
  readonly after: (ms: number, run: () => void) => () => void;
  readonly warn: (message: string) => void;
}

/** A failure of the engine, by kind alone: never the engine's own words, which could quote a chat. */
export class EngineFailed extends Error {
  readonly kind: EngineFailure;

  constructor(kind: EngineFailure) {
    super(`The model on this computer failed: ${kind}.`);
    this.name = 'EngineFailed';
    this.kind = kind;
  }
}

export interface EngineHost {
  /** Runs the conversation on the private model, loading it first if need be. */
  readonly complete: (
    turns: readonly EngineTurn[],
    onText: (text: string) => void,
    signal?: AbortSignal,
  ) => Promise<Completion>;
  /** Closes the engine window, freeing its memory, as when the model changes or goes. */
  readonly close: () => void;
  /** An event from a page, believed only from the engine window on its own origin. */
  readonly hear: (sender: object, frameUrl: string, payload: unknown) => void;
}

/**
 * A few minutes without a request closes the engine window: a loaded model
 * holds a gigabyte or more of memory, and loading it again takes seconds.
 */
const MINUTE_MS = 60_000;
const IDLE_MINUTES = 5;
export const IDLE_MS = IDLE_MINUTES * MINUTE_MS;

const Id = Type.Integer({ minimum: 1 });
const strict = { additionalProperties: false } as const;
const Event = Type.Union([
  Type.Object(
    { type: Type.Literal('text'), id: Id, text: Type.String({ maxLength: 65_536 }) },
    strict,
  ),
  Type.Object({ type: Type.Literal('done'), id: Id, truncated: Type.Boolean() }, strict),
  Type.Object(
    {
      type: Type.Literal('failed'),
      id: Id,
      kind: Type.Union([
        Type.Literal('out-of-memory'),
        Type.Literal('cancelled'),
        Type.Literal('failed'),
      ]),
    },
    strict,
  ),
]);

/** A command waiting for its answer. */
interface Waiting {
  readonly onText: (text: string) => void;
  readonly settle: (outcome: Completion | EngineFailed) => void;
  text: string;
}

/** The window and the model in it, while they last. */
interface Session {
  readonly window: EngineWindow;
  ready: Promise<void> | undefined;
}

interface HostState {
  session: Session | undefined;
  readonly waiting: Map<number, Waiting>;
  next: number;
  cancelIdle: (() => void) | undefined;
}

function settleAll(state: HostState, kind: EngineFailure): void {
  for (const waiting of state.waiting.values()) {
    waiting.settle(new EngineFailed(kind));
  }
  state.waiting.clear();
}

/** Sends `command` once the page loaded, and waits for its answer. */
function ask(
  state: HostState,
  session: Session,
  command: (id: number) => EngineCommand,
  onText: (text: string) => void = () => undefined,
): { readonly id: number; readonly answer: Promise<Completion> } {
  state.next += 1;
  const id = state.next;
  const answer = new Promise<Completion>((resolve, reject) => {
    state.waiting.set(id, {
      onText,
      text: '',
      settle: (outcome) => {
        state.waiting.delete(id);
        if (outcome instanceof EngineFailed) {
          reject(outcome);
        } else {
          resolve(outcome);
        }
      },
    });
  });
  session.window.loaded.then(
    () => {
      session.window.send(command(id));
    },
    () => {
      state.waiting.get(id)?.settle(new EngineFailed('failed'));
    },
  );
  return { id, answer };
}

/** The open window with the model loaded, opening and loading it on first use. */
function sessionOf(state: HostState, deps: EngineHostDependencies): Session {
  if (state.session === undefined) {
    const opened: Session = { window: deps.open(), ready: undefined };
    opened.window.onClosed(() => {
      if (state.session === opened) {
        state.session = undefined;
        settleAll(state, 'failed');
      }
    });
    state.session = opened;
  }
  const session = state.session;
  session.ready ??= ask(state, session, (id) => ({ type: 'load', id })).answer.then(
    () => undefined,
    (error: unknown) => {
      // A model that did not load is tried again on the next request.
      session.ready = undefined;
      throw error;
    },
  );
  return session;
}

function hear(state: HostState, event: EngineEvent): void {
  const waiting = state.waiting.get(event.id);
  if (waiting === undefined) {
    return;
  }
  if (event.type === 'text') {
    waiting.text += event.text;
    waiting.onText(event.text);
    return;
  }
  waiting.settle(
    event.type === 'done'
      ? { text: waiting.text, truncated: event.truncated }
      : new EngineFailed(event.kind),
  );
}

function close(state: HostState): void {
  const session = state.session;
  state.cancelIdle?.();
  state.cancelIdle = undefined;
  state.session = undefined;
  settleAll(state, 'cancelled');
  session?.window.close();
}

async function complete(
  state: HostState,
  deps: EngineHostDependencies,
  [turns, onText, signal]: Parameters<EngineHost['complete']>,
): Promise<Completion> {
  state.cancelIdle?.();
  const session = sessionOf(state, deps);
  try {
    await session.ready;
    const { id, answer } = ask(
      state,
      session,
      (next) => ({ type: 'complete', id: next, turns }),
      onText,
    );
    signal?.addEventListener('abort', () => {
      session.window.send({ type: 'cancel', id });
    });
    return await answer;
  } finally {
    if (state.waiting.size === 0) {
      state.cancelIdle = deps.after(IDLE_MS, () => {
        close(state);
      });
    }
  }
}

/** An IPC event, as far as believing it needs. */
interface EngineIpcEvent {
  readonly sender: object;
  readonly senderFrame: { readonly url: string } | null;
}

/** Passes an IPC event on the engine's channel to the host, which checks where it came from. */
export const engineListener =
  (listen: EngineHost['hear']) =>
  (event: EngineIpcEvent, payload: unknown): void => {
    listen(event.sender, event.senderFrame?.url ?? '', payload);
  };

/**
 * Runs the private model in a hidden engine window (ADR 0017), made on
 * first use and closed after {@link IDLE_MS} without a request. The page
 * answers over one channel, and only the engine window's events, on its
 * own origin and of the expected shape, are believed.
 */
export function createEngineHost(deps: EngineHostDependencies): EngineHost {
  const state: HostState = {
    session: undefined,
    waiting: new Map(),
    next: 0,
    cancelIdle: undefined,
  };
  return {
    complete: (...args) => complete(state, deps, args),
    close: () => {
      close(state);
    },
    hear: (sender, frameUrl, payload) => {
      const fromEngine =
        sender === state.session?.window.contents && isSameOrigin(frameUrl, ENGINE_ORIGIN);
      if (!fromEngine || !Value.Check(Event, payload)) {
        deps.warn('Ignored an engine message from outside the engine page.');
        return;
      }
      hear(state, payload);
    },
  };
}
