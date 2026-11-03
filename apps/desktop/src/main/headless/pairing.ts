import { LOGIN_CODE, parseLoginCode } from '../../adapter/login-code.ts';
import { PAGE_STATE_PROBE, parsePageState } from '../../adapter/page-state.ts';
import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import { en } from '../../shared/messages/en.ts';
import type { Terminal } from './headless.ts';

/** How often a logged-out account is looked at; WhatsApp changes its code about every 20 seconds. */
export const PAIRING_CHECK_MS = 2000;

/** Light modules around the code, which scanners need to find it. */
const QUIET_ZONE = 4;

/** Black on bright white whatever the terminal's own colors, as scanners expect dark on light. */
const BLACK_ON_WHITE = '\u001b[30;107m';
const RESET = '\u001b[0m';

/** Two modules a character: the top one and the bottom one. */
const HALF_BLOCKS: Readonly<Record<string, string>> = {
  '00': ' ',
  '10': '▀',
  '01': '▄',
  '11': '█',
};

interface PairingAccount {
  readonly id: string;
  readonly name: string;
  readonly page: AdapterPage;
}

export interface PairingDependencies {
  /** The accounts that run now. */
  readonly accounts: () => readonly PairingAccount[];
  readonly terminal: Terminal;
  readonly every: (run: () => void, ms: number) => unknown;
}

/** The code as terminal lines, with its quiet zone, ending in a newline. */
export function renderCode(rows: readonly string[]): string {
  const blank = '0'.repeat(rows.length + 2 * QUIET_ZONE);
  const side = '0'.repeat(QUIET_ZONE);
  const zone = Array.from({ length: QUIET_ZONE }, () => blank);
  const padded = [...zone, ...rows.map((row) => `${side}${row}${side}`), ...zone];
  const lines: string[] = [];
  for (const [y, top] of padded.entries()) {
    if (y % 2 === 1) {
      continue;
    }
    // A code has an odd number of rows, so the last one pairs with a blank.
    const bottom = padded[y + 1] ?? blank;
    const cells = Array.from(
      { length: top.length },
      (_cell, x) => HALF_BLOCKS[`${top.charAt(x)}${bottom.charAt(x)}`],
    );
    lines.push(`${BLACK_ON_WHITE}${cells.join('')}${RESET}`);
  }
  return `${lines.join('\n')}\n`;
}

/** What has been said for each account, so nothing is said twice. */
interface Said {
  /** The code last shown, by account. */
  readonly codes: Map<string, string>;
  /** Accounts already told to start YapYap in a terminal. */
  readonly told: Set<string>;
}

/** Shows the account's code when it is new; without a terminal, says once how to see it. */
async function showCode(account: PairingAccount, terminal: Terminal, said: Said): Promise<void> {
  if (!terminal.isTTY) {
    if (!said.told.has(account.id)) {
      said.told.add(account.id);
      terminal.write(`${en.headless.notTerminal({ account: account.name })}\n`);
    }
    return;
  }
  const code = parseLoginCode(await runInAdapterWorld(account.page, LOGIN_CODE));
  if (code === undefined) {
    return;
  }
  const key = code.join('\n');
  if (said.codes.get(account.id) === key) {
    return;
  }
  said.codes.set(account.id, key);
  terminal.write(`${en.headless.scan({ account: account.name })}\n${renderCode(code)}`);
}

async function check(account: PairingAccount, terminal: Terminal, said: Said): Promise<void> {
  const state = parsePageState(await runInAdapterWorld(account.page, PAGE_STATE_PROBE));
  if (state?.view === 'logged-out') {
    await showCode(account, terminal, said);
  } else if (state?.view === 'chats' && said.codes.delete(account.id)) {
    terminal.write(`${en.headless.linked({ account: account.name })}\n`);
  }
}

/**
 * Shows each logged-out account's QR code in the terminal, so a phone can
 * link it with no screen (ADR 0021). The code goes to the terminal alone,
 * never to the log, and only when the output is a terminal.
 */
export function showPairingCodes(deps: PairingDependencies): void {
  const said: Said = { codes: new Map(), told: new Set() };
  deps.every(() => {
    for (const account of deps.accounts()) {
      // A page that is loading or gone answers nothing; the next check asks again.
      check(account, deps.terminal, said).catch(() => undefined);
    }
  }, PAIRING_CHECK_MS);
}
