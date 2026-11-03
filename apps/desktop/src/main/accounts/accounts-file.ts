import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextAtomically } from '../support/atomic-write.ts';
import {
  accountIdsInPartitions,
  parseAccounts,
  serializeAccounts,
  type Accounts,
} from './accounts.ts';

export const ACCOUNTS_FILE = 'accounts.json';
/** Where Electron keeps each persistent partition's data. */
const PARTITIONS_FOLDER = 'Partitions';

function readOptional<T>(path: string, read: (path: string) => T, fallback: T): T {
  return existsSync(path) ? read(path) : fallback;
}

/**
 * Loads the accounts from `userData`, and saves them back when they had to
 * be created or rebuilt, so the file always describes the sessions in use.
 */
export function loadAccounts(userData: string, newId: () => string = randomUUID): Accounts {
  const path = join(userData, ACCOUNTS_FILE);
  const text = readOptional(path, (file) => readFileSync(file, 'utf8'), undefined);
  const folders = readOptional<string[]>(
    join(userData, PARTITIONS_FOLDER),
    (dir) => readdirSync(dir),
    [],
  );
  const partitionIds = accountIdsInPartitions(folders);
  const accounts = parseAccounts(text, partitionIds, newId);
  saveAccounts(userData, accounts, text);
  removeOrphans(userData, partitionIds, accounts);
  return accounts;
}

/** Saves the accounts unless the file already says the same. */
export function saveAccounts(userData: string, accounts: Accounts, current?: string): void {
  const serialized = serializeAccounts(accounts);
  if (serialized !== current) {
    writeTextAtomically(join(userData, ACCOUNTS_FILE), serialized);
  }
}

/**
 * A removed account's data is cleared at once, but Chromium keeps its
 * folder open until YapYap quits, so the folder goes at the next start.
 */
function removeOrphans(
  userData: string,
  partitionIds: readonly string[],
  accounts: Accounts,
): void {
  const kept = new Set(accounts.accounts.map((account) => account.id));
  for (const id of partitionIds.filter((candidate) => !kept.has(candidate))) {
    rmSync(join(userData, PARTITIONS_FOLDER, `account-${id}`), { recursive: true, force: true });
  }
}
