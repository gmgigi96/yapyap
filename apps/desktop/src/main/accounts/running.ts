import { newAccount, type Account, type Accounts } from './accounts.ts';

/** An open account in the window: its views, shown only while it is active. */
export interface AccountPage {
  readonly show: () => void;
  readonly hide: () => void;
  /** Closes the account's views for good. */
  readonly close: () => void;
}

export interface RunningDependencies<Page extends AccountPage> {
  readonly accounts: Accounts;
  /** Opens an account's views and starts watching it; it starts hidden. */
  readonly open: (account: Account) => Page;
  readonly save: (accounts: Accounts) => void;
  /** Deletes the account's WhatsApp data once its views are closed. */
  readonly forget: (account: Account) => Promise<void>;
  readonly newId: () => string;
  /** After every change of the accounts or of the active one. */
  readonly onChange: () => void;
}

interface OpenAccount<Page extends AccountPage> {
  readonly account: Account;
  readonly page: Page;
}

export interface RunningAccounts<Page extends AccountPage> {
  readonly list: () => readonly Account[];
  /** The accounts with views, in the order they were opened. */
  readonly opened: () => readonly OpenAccount<Page>[];
  readonly active: () => OpenAccount<Page>;
  readonly switchTo: (id: string) => void;
  readonly add: () => void;
  /** Removes an account and its data; the last open account stays. */
  readonly remove: (id: string) => Promise<boolean>;
  readonly update: (id: string, change: AccountChange) => boolean;
}

/**
 * Every enabled account loads in the background, so each keeps receiving
 * messages, and only the active one is shown. With none enabled, the first
 * still runs, since the window needs something to show.
 */
function runnable(accounts: Accounts): readonly Account[] {
  const enabled = accounts.accounts.filter((account) => account.enabled);
  return enabled.length > 0 ? enabled : accounts.accounts.slice(0, 1);
}

/** What changes while YapYap runs: the accounts, their views and the active one. */
interface State<Page extends AccountPage> {
  accounts: Accounts;
  readonly open: Map<string, OpenAccount<Page>>;
  active: OpenAccount<Page>;
}

function openAll<Page extends AccountPage>(deps: RunningDependencies<Page>): State<Page> {
  const open = new Map<string, OpenAccount<Page>>();
  for (const account of runnable(deps.accounts)) {
    open.set(account.id, { account, page: deps.open(account) });
  }
  const [first] = open.values();
  if (first === undefined) {
    throw new Error('There is no account to open.');
  }
  return { open, accounts: deps.accounts, active: open.get(deps.accounts.active) ?? first };
}

function update<Page extends AccountPage>(
  deps: RunningDependencies<Page>,
  state: State<Page>,
  next: Accounts,
): void {
  state.accounts = next;
  deps.save(next);
  deps.onChange();
}

function switchAccount<Page extends AccountPage>(
  deps: RunningDependencies<Page>,
  state: State<Page>,
  id: string,
): void {
  const next = state.open.get(id);
  if (next === undefined || next === state.active) {
    return;
  }
  state.active.page.hide();
  next.page.show();
  state.active = next;
  update(deps, state, { ...state.accounts, active: id });
}

function addAccount<Page extends AccountPage>(
  deps: RunningDependencies<Page>,
  state: State<Page>,
): void {
  const account = newAccount(deps.newId(), state.accounts.accounts.length + 1);
  state.accounts = { ...state.accounts, accounts: [...state.accounts.accounts, account] };
  state.open.set(account.id, { account, page: deps.open(account) });
  switchAccount(deps, state, account.id);
}

/**
 * Takes an open account's views away, showing another first if it was the
 * one on screen. The last open account stays: false means it was refused.
 */
function closeAccount<Page extends AccountPage>(
  deps: RunningDependencies<Page>,
  state: State<Page>,
  closing: OpenAccount<Page>,
): boolean {
  const fallback = [...state.open.values()].find((candidate) => candidate !== closing);
  if (fallback === undefined) {
    return false;
  }
  if (closing === state.active) {
    switchAccount(deps, state, fallback.account.id);
  }
  closing.page.close();
  state.open.delete(closing.account.id);
  return true;
}

async function removeAccount<Page extends AccountPage>(
  deps: RunningDependencies<Page>,
  state: State<Page>,
  id: string,
): Promise<boolean> {
  const account = state.accounts.accounts.find((candidate) => candidate.id === id);
  const opened = state.open.get(id);
  if (account === undefined || (opened !== undefined && !closeAccount(deps, state, opened))) {
    return false;
  }
  update(deps, state, {
    ...state.accounts,
    accounts: state.accounts.accounts.filter((candidate) => candidate.id !== id),
  });
  await deps.forget(account);
  return true;
}

/** Opens an account that was off, or refreshes the details of an open one. */
function keepOpen<Page extends AccountPage>(
  deps: RunningDependencies<Page>,
  state: State<Page>,
  opened: OpenAccount<Page> | undefined,
  account: Account,
): void {
  const entry = { account, page: opened?.page ?? deps.open(account) };
  state.open.set(account.id, entry);
  if (opened === state.active) {
    state.active = entry;
  }
}

/** What the user can change about an account. */
export type AccountChange = Required<
  Pick<Account, 'name' | 'color' | 'enabled' | 'muted' | 'proxy'>
>;

/** The account after a change; an empty proxy means none of its own, so none is kept. */
function withChange(current: Account, change: AccountChange): Account {
  const { proxy, ...rest } = change;
  const account: Account = { ...current, ...rest, proxy };
  if (proxy === '') {
    delete account.proxy;
  }
  return account;
}

/**
 * Applies a change: turning an account off closes its views but keeps its
 * data, and turning it on opens it again. The last open account cannot be
 * turned off; false means the change was refused.
 */
function updateAccount<Page extends AccountPage>(
  deps: RunningDependencies<Page>,
  state: State<Page>,
  id: string,
  change: AccountChange,
): boolean {
  const current = state.accounts.accounts.find((candidate) => candidate.id === id);
  if (current === undefined) {
    return false;
  }
  const account = withChange(current, change);
  const opened = state.open.get(id);
  if (opened !== undefined && !account.enabled && !closeAccount(deps, state, opened)) {
    return false;
  }
  if (account.enabled) {
    keepOpen(deps, state, opened, account);
  }
  update(deps, state, {
    ...state.accounts,
    accounts: state.accounts.accounts.map((candidate) =>
      candidate.id === id ? account : candidate,
    ),
  });
  return true;
}

export function runAccounts<Page extends AccountPage>(
  deps: RunningDependencies<Page>,
): RunningAccounts<Page> {
  const state = openAll(deps);
  state.active.page.show();
  return {
    list: () => state.accounts.accounts,
    opened: () => [...state.open.values()],
    active: () => state.active,
    switchTo: (id) => {
      switchAccount(deps, state, id);
    },
    add: () => {
      addAccount(deps, state);
    },
    remove: (id) => removeAccount(deps, state, id),
    update: (id, change) => updateAccount(deps, state, id, change),
  };
}
