import { readFileSync } from 'node:fs';
import { writeTextAtomically } from '../atomic-write.ts';

/** Electron's `safeStorage`, as far as YapYap uses it. */
export interface EncryptionPort {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  /** Linux only. */
  getSelectedStorageBackend(): string;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(
    encrypted: Buffer,
  ): Promise<{ readonly result: string; readonly shouldReEncrypt: boolean }>;
}

/** The secrets file; only ever holds ciphertext. */
export interface SecretFile {
  readonly read: () => string | undefined;
  readonly write: (text: string) => void;
}

export interface SecretStore {
  /** False where the system offers no real encryption, so nothing may be kept. */
  readonly canKeep: () => Promise<boolean>;
  readonly get: (name: string) => Promise<string | undefined>;
  /** Keeps a secret, or forgets it when `value` is undefined; false if it cannot be kept. */
  readonly set: (name: string, value: string | undefined) => Promise<boolean>;
  /** Forgets every secret whose name starts with `prefix`, such as a removed account's chat names. */
  readonly forgetAll: (prefix: string) => void;
}

const FILE_VERSION = 1;

/** Read and write for the user alone. */
const OWNER_ONLY = 0o600;

/** The secrets file at `path`, readable and writable by the user alone. */
export function secretFileAt(path: string): SecretFile {
  return {
    read: () => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },
    write: (text) => {
      writeTextAtomically(path, text, OWNER_ONLY);
    },
  };
}

/**
 * Linux backends that only obfuscate: without a keyring, Chromium falls
 * back to a key anyone who can read the profile also has.
 */
const WEAK_BACKENDS = new Set(['basic_text', 'unknown']);

function parse(text: string | undefined): Map<string, string> {
  try {
    const parsed = JSON.parse(text ?? '{}') as { version?: unknown; secrets?: unknown };
    const secrets = parsed.version === FILE_VERSION ? parsed.secrets : undefined;
    if (typeof secrets !== 'object' || secrets === null) {
      return new Map();
    }
    return new Map(
      Object.entries(secrets).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return new Map();
  }
}

/** Decrypts a stored secret, storing it again under a rotated key; undefined if it cannot be. */
async function reveal(
  encryption: EncryptionPort,
  stored: string,
  keepAgain: (result: string) => Promise<void>,
): Promise<string | undefined> {
  try {
    const { result, shouldReEncrypt } = await encryption.decryptStringAsync(
      Buffer.from(stored, 'base64'),
    );
    if (shouldReEncrypt) {
      // The system rotated its key; storing again keeps the secret readable.
      await keepAgain(result);
    }
    return result;
  } catch {
    // Encrypted under a key the system no longer has; asking again is all that is left.
    return undefined;
  }
}

/** Only Linux has backends of different strength to tell apart. */
const backendOf = (encryption: EncryptionPort, platform: string): string =>
  platform === 'linux' ? encryption.getSelectedStorageBackend() : 'system';

/** Forgets the secrets under a prefix, writing the file only when one was there. */
function forgetter(secrets: Map<string, string>, save: () => void): SecretStore['forgetAll'] {
  return (prefix) => {
    const names = [...secrets.keys()].filter((name) => name.startsWith(prefix));
    for (const name of names) {
      secrets.delete(name);
    }
    if (names.length > 0) {
      save();
    }
  };
}

/**
 * Keeps secrets such as proxy passwords encrypted by the system's keychain
 * through `safeStorage`, never in the settings and never in plain text.
 */
export function openSecretStore(
  file: SecretFile,
  encryption: EncryptionPort,
  platform: string,
): SecretStore {
  const secrets = parse(file.read());
  const save = (): void => {
    file.write(JSON.stringify({ version: FILE_VERSION, secrets: Object.fromEntries(secrets) }));
  };
  const canKeep = async (): Promise<boolean> =>
    (await encryption.isAsyncEncryptionAvailable()) &&
    !WEAK_BACKENDS.has(backendOf(encryption, platform));
  const keep = async (name: string, value: string): Promise<void> => {
    secrets.set(name, Buffer.from(await encryption.encryptStringAsync(value)).toString('base64'));
    save();
  };
  return {
    canKeep,
    get: async (name) => {
      const stored = secrets.get(name);
      if (stored === undefined || !(await encryption.isAsyncEncryptionAvailable())) {
        return undefined;
      }
      return reveal(encryption, stored, (result) => keep(name, result));
    },
    set: async (name, value) => {
      if (value === undefined) {
        secrets.delete(name);
        save();
        return true;
      }
      if (!(await canKeep())) {
        return false;
      }
      await keep(name, value);
      return true;
    },
    forgetAll: forgetter(secrets, save),
  };
}
