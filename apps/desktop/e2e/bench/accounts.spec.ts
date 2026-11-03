import type { ElectronApplication } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { clickMenu } from '../chrome-helpers.ts';
import { whatsAppPage } from '../fixtures.ts';
import {
  budgetHere,
  cpuPercentSince,
  median,
  memoryMb,
  onFreshProfile,
  settle,
} from './measure.ts';

const RUNS = 3;

interface Budget {
  readonly accountMemoryMb: number;
  readonly hiddenCpuPercent: number;
}

interface AccountSample {
  /** What a second account adds to all of YapYap's processes together. */
  readonly accountMemoryMb: number;
  /** A hidden account's renderer, as a share of one core, while it idles. */
  readonly hiddenCpuPercent: number;
}

/** The WhatsApp pages, oldest account first. */
const accountPids = (app: ElectronApplication): Promise<number[]> =>
  app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((contents) => contents.getURL().startsWith('http'))
      .sort((a, b) => a.id - b.id)
      .map((contents) => contents.getOSProcessId()),
  );

/**
 * CPU seconds `pid` has used since it started. The cumulative figure is used
 * because the per-call percentage restarts whenever anything asks for
 * metrics, and YapYap's own memory watchdog does.
 */
const cpuSeconds = (app: ElectronApplication, pid: number): Promise<number> =>
  app.evaluate(
    ({ app: electronApp }, wanted) =>
      electronApp.getAppMetrics().find((entry) => entry.pid === wanted)?.cpu.cumulativeCPUUsage ??
      0,
    pid,
  );

async function addAccount(app: ElectronApplication): Promise<void> {
  await clickMenu(app, 'Add Account');
  await expect.poll(async () => (await accountPids(app)).length).toBe(2);
}

/** One launch: memory with one account, then with two, and the hidden one's CPU. */
function measureAccounts(): Promise<AccountSample> {
  return onFreshProfile(async (app) => {
    await (await whatsAppPage(app)).getByTestId('fake-whatsapp').waitFor({ state: 'visible' });
    await settle();
    const one = await memoryMb(app);
    // The new account comes to the front, so the first one is hidden from here on.
    await addAccount(app);
    await settle();
    const two = await memoryMb(app);
    const [hidden = 0] = await accountPids(app);
    const before = await cpuSeconds(app, hidden);
    const started = performance.now();
    await settle();
    const used = (await cpuSeconds(app, hidden)) - before;
    return { accountMemoryMb: two - one, hiddenCpuPercent: cpuPercentSince(used, started) };
  });
}

test('stays within the per-account memory and hidden-account CPU budgets', async ({}, testInfo) => {
  test.setTimeout((RUNS + 1) * 90_000);
  const budget = await budgetHere<Budget>();
  const samples: AccountSample[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    samples.push(await measureAccounts());
  }
  const result = {
    platform: process.platform,
    accountMemoryMb: median(samples.map((sample) => sample.accountMemoryMb)),
    hiddenCpuPercent: median(samples.map((sample) => sample.hiddenCpuPercent)),
    budget,
    samples,
  };
  await writeFile(testInfo.outputPath('accounts.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  expect
    .soft(result.accountMemoryMb, 'median memory per account (MB)')
    .toBeLessThanOrEqual(budget.accountMemoryMb);
  expect
    .soft(result.hiddenCpuPercent, 'median hidden-account CPU (% of a core)')
    .toBeLessThanOrEqual(budget.hiddenCpuPercent);
});
