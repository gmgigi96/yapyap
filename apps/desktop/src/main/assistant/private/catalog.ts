import type { Environment } from '../../support/environment.ts';

/**
 * A model the assistant can run on this computer (#457): a GGUF file pinned
 * by its exact address, size and SHA-256, so a changed or tampered file is
 * refused. The address names a commit, never a branch, so it cannot move.
 */
export interface PrivateModel {
  readonly id: string;
  /** How the model list names it, inside "Private model (…)". */
  readonly name: string;
  readonly url: string;
  readonly size: number;
  readonly sha256: string;
}

/**
 * Qwen2.5 1.5B Instruct, Apache-2.0, in Q4_K_M: good enough at short
 * replies and rewording, and small enough for a typical laptop's processor.
 */
const STANDARD: PrivateModel = {
  id: 'qwen2.5-1.5b-instruct-q4_k_m',
  name: 'Qwen2.5 1.5B',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  size: 1_117_320_736,
  sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
};

/** Qwen2.5 0.5B Instruct, Apache-2.0, in Q4_K_M: for computers short of memory or cores. */
const SMALL: PrivateModel = {
  id: 'qwen2.5-0.5b-instruct-q4_k_m',
  name: 'Qwen2.5 0.5B',
  url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  size: 491_400_032,
  sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
};

/** The models to choose from: the usual one, and the one for weaker computers. */
export interface Catalog {
  readonly standard: PrivateModel;
  readonly small: PrivateModel;
}

export const CATALOG: Catalog = { standard: STANDARD, small: SMALL };

/** What YapYap can tell of the computer: its memory in bytes, and its cores. */
export interface Hardware {
  readonly memory: number;
  readonly cores: number;
}

const KIBIBYTE = 1024;
const GIBIBYTE = KIBIBYTE * KIBIBYTE * KIBIBYTE;

/**
 * Below this, the usual model would not fit beside everything else. An
 * "8 GB" computer reports a little less than 8 GiB, since the system keeps
 * some for itself, so the line sits under it.
 */
const ENOUGH_GIBIBYTES = 7;
const ENOUGH_MEMORY = ENOUGH_GIBIBYTES * GIBIBYTE;
const ENOUGH_CORES = 4;

/**
 * The model that suits the computer: the smaller one with too little
 * memory or under 4 cores, where the usual one would be slow or not fit.
 */
export function modelFor(hardware: Hardware, catalog: Catalog = CATALOG): PrivateModel {
  const weak = hardware.memory < ENOUGH_MEMORY || hardware.cores < ENOUGH_CORES;
  return weak ? catalog.small : catalog.standard;
}

/** The catalog's model with `id`, if it still lists one. */
export const modelById = (id: unknown, catalog: Catalog = CATALOG): PrivateModel | undefined =>
  [catalog.standard, catalog.small].find((model) => model.id === id);

const SHA256 = /^[0-9a-f]{64}$/;

const isAddress = (url: unknown): url is string =>
  typeof url === 'string' && URL.canParse(url) && /^https?:/.test(url);
const isSize = (size: unknown): size is number => Number.isSafeInteger(size) && Number(size) > 0;
const isHash = (sha256: unknown): sha256 is string =>
  typeof sha256 === 'string' && SHA256.test(sha256);

/** A test model, as JSON, in place of both of the catalog's, or undefined for anything else. */
function testCatalog(body: unknown): Catalog | undefined {
  const { url, size, sha256 } = Object(body) as Record<string, unknown>;
  if (!isAddress(url) || !isSize(size) || !isHash(sha256)) {
    return undefined;
  }
  const model = { id: 'test', name: 'Test', size, url, sha256 };
  return { standard: model, small: model };
}

const TEST_MODEL = 'YAPYAP_TEST_BUILT_IN_MODEL';

/**
 * The catalog, or, for E2E tests of an unpackaged build, the model named
 * as JSON in `YAPYAP_TEST_BUILT_IN_MODEL`. A packaged build ignores it, so
 * no installed YapYap can be pointed at another file.
 */
export function catalogOf(env: Environment, packaged: boolean): Catalog {
  const given = env[TEST_MODEL];
  if (packaged || given === undefined) {
    return CATALOG;
  }
  try {
    return testCatalog(JSON.parse(given)) ?? CATALOG;
  } catch {
    return CATALOG;
  }
}

const MEGABYTE = 1_000_000;
const GIGABYTE = 1_000_000_000;
/** Sizes under a gigabyte are rounded to tens of megabytes, as people say them. */
const MEGABYTE_STEP = 10;

const gigabytes = new Intl.NumberFormat('en', {
  style: 'unit',
  unit: 'gigabyte',
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
const megabytes = new Intl.NumberFormat('en', { style: 'unit', unit: 'megabyte' });

/** A size as people read it: "1.1 GB", "490 MB". */
export function sizeText(bytes: number): string {
  if (bytes >= GIGABYTE) {
    return gigabytes.format(bytes / GIGABYTE);
  }
  const tens = Math.round(bytes / (MEGABYTE_STEP * MEGABYTE)) * MEGABYTE_STEP;
  return megabytes.format(Math.max(1, tens));
}
