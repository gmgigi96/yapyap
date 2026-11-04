import { createHash, type Hash } from 'node:crypto';
import type { PrivateModel } from './catalog.ts';
import type { ModelFiles, ModelWriter } from './files.ts';

/**
 * How a download ended: the model is saved and verified, or why not. A
 * file that does not match its SHA-256 is deleted, never kept; a paused or
 * broken one keeps what came, so resuming asks only for the rest.
 */
export type DownloadOutcome = 'done' | 'paused' | 'failed' | 'disk-full' | 'damaged';

export interface DownloadDependencies {
  readonly files: ModelFiles;
  /** The assistant's confined `fetch` (ADR 0017). */
  readonly fetch: typeof fetch;
  /** Pauses the download, keeping what came. */
  readonly signal: AbortSignal;
}

const PARTIAL = 206;
const OK = 200;

/** A download under way: the hash of what came so far, and how much did. */
interface Progress {
  readonly hash: Hash;
  done: number;
}

/**
 * The hash of the bytes a paused download kept, read back from disk: a
 * hash cannot be kept across a restart, and reading a gigabyte again takes
 * seconds.
 */
async function resumed(model: PrivateModel, files: ModelFiles): Promise<Progress> {
  const hash = createHash('sha256');
  let done = 0;
  for await (const chunk of files.read(model)) {
    hash.update(chunk);
    done += chunk.byteLength;
  }
  return { hash, done };
}

const fresh = (): Progress => ({ hash: createHash('sha256'), done: 0 });

const isDiskFull = (error: unknown): boolean => {
  const { code } = Object(error) as { code?: unknown };
  return code === 'ENOSPC' || code === 'EDQUOT';
};

/** Why the download stopped, from what was thrown while it ran. */
const stopped = (error: unknown, signal: AbortSignal): DownloadOutcome => {
  if (signal.aborted) {
    return 'paused';
  }
  return isDiskFull(error) ? 'disk-full' : 'failed';
};

/** Asks for the file from byte `start` on, with an HTTP `Range` when resuming. */
const fetchFrom = (model: PrivateModel, start: number, deps: DownloadDependencies) =>
  deps.fetch(model.url, {
    headers: start > 0 ? { Range: `bytes=${String(start)}-` } : {},
    signal: deps.signal,
  });

/**
 * Writes the body to the partial file, hashing as it goes; false when it
 * ran past the model's size, which only a wrong file does.
 */
async function pour(
  body: AsyncIterable<Uint8Array>,
  model: PrivateModel,
  progress: Progress,
  writer: ModelWriter,
  onProgress: (done: number) => void,
): Promise<boolean> {
  for await (const chunk of body) {
    progress.hash.update(chunk);
    progress.done += chunk.byteLength;
    if (progress.done > model.size) {
      return false;
    }
    await writer.write(chunk);
    onProgress(progress.done);
  }
  return true;
}

/** Whether the whole file came and is the pinned one; a file that is not is deleted. */
async function verified(
  model: PrivateModel,
  progress: Progress,
  files: ModelFiles,
): Promise<DownloadOutcome> {
  if (progress.done < model.size) {
    // A stream that ends early is a broken connection, which resuming mends.
    return 'failed';
  }
  if (progress.hash.digest('hex') !== model.sha256) {
    await files.discard(model);
    return 'damaged';
  }
  await files.finish(model);
  return 'done';
}

/** The rest of the file, or all of it when the server ignored the range, which starts over. */
async function receive(
  model: PrivateModel,
  saved: Progress,
  deps: DownloadDependencies,
  onProgress: (done: number) => void,
): Promise<DownloadOutcome> {
  const response = await fetchFrom(model, saved.done, deps);
  const resuming = saved.done > 0 && response.status === PARTIAL;
  if ((response.status !== OK && !resuming) || response.body === null) {
    return 'failed';
  }
  const progress = resuming ? saved : fresh();
  const writer = await deps.files.append(model, !resuming);
  let fits: boolean;
  try {
    fits = await pour(response.body, model, progress, writer, onProgress);
  } finally {
    await writer.close();
  }
  if (!fits) {
    await deps.files.discard(model);
    return 'damaged';
  }
  return verified(model, progress, deps.files);
}

/**
 * Downloads `model` into its files, or resumes what an earlier download
 * kept, and checks it against its SHA-256 as it streams in. It runs only on
 * the user's click, and first checks there is room on the disk for the rest.
 */
export async function download(
  model: PrivateModel,
  deps: DownloadDependencies,
  onProgress: (done: number) => void,
): Promise<DownloadOutcome> {
  try {
    if ((await deps.files.saved(model)) > model.size) {
      await deps.files.discard(model);
    }
    const saved = await resumed(model, deps.files);
    onProgress(saved.done);
    if (saved.done === model.size) {
      return await verified(model, saved, deps.files);
    }
    const free = await deps.files.free();
    if (free !== undefined && free < model.size - saved.done) {
      return 'disk-full';
    }
    return await receive(model, saved, deps, onProgress);
  } catch (error) {
    return stopped(error, deps.signal);
  }
}
