import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { cappedFetcher, type Fetcher, type StreamedResponse } from './capped-fetch.ts';
import { MAX_MODELS } from './models.ts';
import type { Environment } from '../environment.ts';

const OLLAMA_PORT = 11_434;
/** Alpaca runs an Ollama of its own, one port up, so both can run. */
const ALPACA_PORT = 11_435;
const LM_STUDIO_PORT = 1234;
const LLAMA_CPP_PORT = 8080;

/** Where people's model servers usually listen (#456). */
export const MODEL_SERVER_PORTS: readonly number[] = [
  OLLAMA_PORT,
  ALPACA_PORT,
  LM_STUDIO_PORT,
  LLAMA_CPP_PORT,
];

/** How long each server has to answer; all are asked at once, so the user waits this long at most. */
export const PROBE_TIMEOUT_MS = 1500;

/** Far more than a list of models takes, short of what could fill memory. */
export const LIST_MAX_BYTES = 256 * 1024;

const MAX_SERVERS = 4;

/** A model's ID as Settings shows it: short text, without control characters. */
const ModelId = Type.String({ minLength: 1, maxLength: 200, pattern: String.raw`^\P{Cc}+$` });

/** A model server found on this computer, and the models it serves. */
export interface LocalServer {
  /** Its host and port, as `localhost:11434`. */
  readonly server: string;
  /** Its OpenAI-style address, as the assistant's settings keep it. */
  readonly endpoint: string;
  readonly models: readonly string[];
}

/** How YapYap looks for model servers on this computer. */
export interface ModelServerProbe {
  /** The ports to ask, always on 127.0.0.1. */
  readonly ports: readonly number[];
  /** One plain GET, which follows no redirect and sends no cookie. */
  readonly request: (url: string) => Promise<StreamedResponse>;
}

/**
 * A GET to a server on this computer with Node's own `fetch`, which keeps no
 * cookies, unlike a session's: it follows no redirect, so a server cannot
 * send YapYap anywhere else, sends no credentials, and gives up after
 * `timeoutMs`, reading the body included.
 */
export const loopbackRequest =
  (fetcher: typeof fetch, timeoutMs = PROBE_TIMEOUT_MS) =>
  (url: string): Promise<StreamedResponse> =>
    fetcher(url, {
      redirect: 'error',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

/**
 * The IDs an OpenAI-style list of models names, the first {@link MAX_MODELS}
 * that fit; undefined when it is no such list.
 */
export function modelIds(body: unknown): string[] | undefined {
  const { data } = Object(body) as { data?: unknown };
  if (!Array.isArray(data)) {
    return undefined;
  }
  return (data as unknown[])
    .map((entry) => (Object(entry) as { id?: unknown }).id)
    .filter((id): id is string => Value.Check(ModelId, id))
    .slice(0, MAX_MODELS);
}

const isPort = (port: number): boolean => Number.isInteger(port) && port > 0 && port < 65_536;

/**
 * The server at `port`, if it lists its models. Nothing downloaded decodes
 * as empty text, which is no JSON, so a server that is down, refuses or
 * answers anything but JSON rejects here, and `findLocalModels` leaves it out.
 */
async function probeOne(port: number, list: Fetcher): Promise<LocalServer[]> {
  const bytes = await list(`http://127.0.0.1:${String(port)}/v1/models`);
  const models = modelIds(JSON.parse(new TextDecoder().decode(bytes)));
  // The assistant names the server `localhost`, as people and the docs do.
  return models === undefined
    ? []
    : [
        {
          server: `localhost:${String(port)}`,
          endpoint: `http://localhost:${String(port)}/v1`,
          models,
        },
      ];
}

/**
 * The model servers on this computer that answer at `probe.ports` (#456),
 * in that order, four at most: each is asked once, at the same time, for
 * its list of models (`GET /v1/models`, which Ollama, LM Studio and
 * llama.cpp all serve), and nothing else. Only real ports on loopback are
 * asked, so every address found is a plain `localhost` one, built here
 * rather than taken from the server. Nothing is logged: which models
 * someone runs is theirs.
 */
export async function findLocalModels(probe: ModelServerProbe): Promise<LocalServer[]> {
  const list = cappedFetcher(probe.request, LIST_MAX_BYTES);
  const probes = probe.ports.filter(isPort).map((port) => probeOne(port, list));
  const answered = await Promise.allSettled(probes);
  return answered
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .slice(0, MAX_SERVERS);
}

const TEST_PORTS = 'YAPYAP_TEST_MODEL_PORTS';

/**
 * The ports to look at. E2E tests run an unpackaged build against fake
 * servers on ports of their own, listed in `YAPYAP_TEST_MODEL_PORTS`;
 * a packaged build ignores it, so no installed YapYap looks anywhere else.
 */
export function modelServerPorts(env: Environment, packaged: boolean): readonly number[] {
  const given = env[TEST_PORTS];
  if (packaged || given === undefined) {
    return MODEL_SERVER_PORTS;
  }
  const ports = given.split(',').map(Number);
  return ports.length <= MAX_SERVERS && ports.every(isPort) ? ports : MODEL_SERVER_PORTS;
}
