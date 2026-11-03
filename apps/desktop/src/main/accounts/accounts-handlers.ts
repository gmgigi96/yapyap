import { CHROME_CHANNELS, type AccountList, type AccountSummary } from '../../shared/chrome-api.ts';
import { ACCOUNT_COLORS, isAccountColor, MAX_ACCOUNT_NAME } from './accounts.ts';
import type { AccountChange } from './running.ts';
import { isProxyAddress } from '../../shared/proxy-address.ts';
import { argumentsOf, isString, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

/** The accounts as the Accounts window manages them. */
export interface AccountManager {
  readonly entries: readonly AccountSummary[];
  /** False when YapYap refused the change, such as turning off the last running account. */
  readonly update: (id: string, change: AccountChange) => boolean;
  readonly remove: (id: string) => Promise<boolean>;
  /** Devices the account was allowed until YapYap quits; undefined while it is off. */
  readonly permissions: (id: string) => readonly string[] | undefined;
  /** Makes the account ask again before using the camera or microphone. */
  readonly forgetPermissions: (id: string) => void;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= MAX_ACCOUNT_NAME;
}

/** Exactly a name, a known color, two switches and a proxy address: nothing else gets through. */
function parseChange(value: unknown): AccountChange | undefined {
  const { name, color, enabled, muted, proxy, ...rest } = Object(value) as Record<string, unknown>;
  const switches = typeof enabled === 'boolean' && typeof muted === 'boolean';
  const complete = isName(name) && isAccountColor(color) && switches && isProxyAddress(proxy);
  return complete && Object.keys(rest).length === 0
    ? { name: name.trim(), color, enabled, muted, proxy }
    : undefined;
}

/** WhatsApp always runs in one account at least, so the last running one stays. */
function isLastRunning(entries: readonly AccountSummary[], entry: AccountSummary): boolean {
  return entry.enabled && entries.every((other) => other === entry || !other.enabled);
}

/** What an account may use, and forgetting the camera and microphone answers (#77). */
function permissionHandlers(current: () => AccountManager | undefined): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.accountsPermissions,
      accepts: argumentsOf(isString),
      handle: (_call, id) => current()?.permissions(id as string) ?? null,
    },
    {
      channel: CHROME_CHANNELS.accountsForgetPermissions,
      accepts: argumentsOf(isString),
      handle: (_call, id) => {
        const manager = current();
        manager?.forgetPermissions(id as string);
        return manager?.permissions(id as string) ?? null;
      },
    },
  ];
}

/**
 * Removes the account once the user agrees; false when YapYap refused,
 * true when it is gone or stays because the user declined.
 */
async function removeAccount(
  manager: AccountManager,
  id: string,
  confirmRemove: (name: string) => Promise<boolean>,
): Promise<boolean> {
  const entry = manager.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    return true;
  }
  // Refused before asking, so the user never confirms a removal that cannot happen.
  if (isLastRunning(manager.entries, entry)) {
    return false;
  }
  return !(await confirmRemove(entry.name)) || manager.remove(entry.id);
}

/**
 * The Accounts window's operations. Every change is checked again here, and
 * removing an account asks the user first, in a dialog the page cannot fake.
 */
export function accountsHandlers(
  /** The accounts once they are open, and their state at each call. */
  current: () => AccountManager | undefined,
  confirmRemove: (name: string) => Promise<boolean>,
): ChromeHandler[] {
  const list = (): AccountList => ({ accounts: current()?.entries ?? [], colors: ACCOUNT_COLORS });
  return [
    { channel: CHROME_CHANNELS.accountsList, accepts: noArguments, handle: list },
    {
      channel: CHROME_CHANNELS.accountsSave,
      accepts: argumentsOf(isString, (change) => parseChange(change) !== undefined),
      handle: (_call, id, change) => {
        const manager = current();
        const parsed = parseChange(change);
        const saved = manager !== undefined && parsed !== undefined;
        return saved && manager.update(id as string, parsed) ? list() : null;
      },
    },
    {
      channel: CHROME_CHANNELS.accountsRemove,
      accepts: argumentsOf(isString),
      handle: async (_call, id) => {
        const manager = current();
        if (manager === undefined) {
          return list();
        }
        return (await removeAccount(manager, id as string, confirmRemove)) ? list() : null;
      },
    },
    ...permissionHandlers(current),
  ];
}
