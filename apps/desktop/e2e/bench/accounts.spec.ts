import type { ElectronApplication } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clickMenu } from '../chrome-helpers.ts';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';
import { launchApp, whatsAppPage } from '../fixtures.ts';
import { median } from './measure.ts';

const RUNS = 3;
/** Long enough for start-up work to finish and memory to settle. */
const SETTLE_MS = 10_000;

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

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

const memoryMb = async (app: ElectronApplication): Promise<number> =>
  Math.round(
    (await app.evaluate(({ app: electronApp }) =>
      electronApp.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0),
    )) / 1024,
  );

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
async function measureAccounts(): Promise<AccountSample> {
  const fake = await startFakeWhatsApp();
  const profile = await mkdtemp(join(tmpdir(), 'yapyap-bench-'));
  const app = await launchApp(fake.origin, profile);
  try {
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
    const percent = (used / ((performance.now() - started) / 1000)) * 100;
    return { accountMemoryMb: two - one, hiddenCpuPercent: Math.round(percent * 10) / 10 };
  } finally {
    await app.close();
    await fake.close();
    await rm(profile, { recursive: true, force: true });
  }
}

test('stays within the per-account memory and hidden-account CPU budgets', async ({}, testInfo) => {
  test.setTimeout((RUNS + 1) * 90_000);
  const budgets = JSON.parse(
    await readFile(join(import.meta.dirname, 'budgets.json'), 'utf8'),
  ) as Record<string, Budget | undefined>;
  const budget = budgets[process.platform];
  if (budget === undefined) {
    throw new Error(`No budget for ${process.platform}`);
  }
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
