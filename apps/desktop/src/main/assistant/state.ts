import { Type, type Static } from 'typebox';
import { readChecked, type TextFile } from '../atomic-write.ts';

const FORMAT_VERSION = 1;

const PrivateModelRecord = Type.Object(
  {
    /** The catalog's ID of the model the user chose. */
    id: Type.String({ minLength: 1, maxLength: 100 }),
    /** The whole file is downloaded and matched its SHA-256. */
    ready: Type.Boolean(),
  },
  { additionalProperties: false },
);

/** The private model the user chose, and whether it is all there. */
export type PrivateModelRecord = Static<typeof PrivateModelRecord>;

const StateSchema = Type.Object(
  {
    version: Type.Literal(FORMAT_VERSION),
    privateModel: Type.Union([PrivateModelRecord, Type.Null()]),
  },
  { additionalProperties: false },
);

type Saved = Static<typeof StateSchema>;

/** What the assistant keeps that is no preference, in `assistant.json`. */
export interface AssistantState {
  readonly privateModel: () => PrivateModelRecord | undefined;
  readonly setPrivateModel: (record: PrivateModelRecord | undefined) => void;
}

const EMPTY: Saved = { version: FORMAT_VERSION, privateModel: null };

/**
 * The assistant's state, read once and written whenever it changes. Like
 * the window's size, it is state, not a preference, so it stays out of
 * settings and their export. A write that fails keeps it for this run.
 */
export function assistantState(file: TextFile, warn: (message: string) => void): AssistantState {
  let state = readChecked(file, StateSchema) ?? EMPTY;
  const change = (next: Partial<Saved>): void => {
    state = { ...state, ...next };
    try {
      file.write(`${JSON.stringify(state)}\n`);
    } catch {
      warn('Could not save the assistant’s state.');
    }
  };
  return {
    privateModel: () => state.privateModel ?? undefined,
    setPrivateModel: (record) => {
      change({ privateModel: record ?? null });
    },
  };
}
