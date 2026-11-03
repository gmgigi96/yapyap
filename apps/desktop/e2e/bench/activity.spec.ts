import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { chromePage, clickMenu } from '../chrome-helpers.ts';
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
/** Rounds of use per launch: enough for a leak per round to add up past the noise. */
const ROUNDS = 15;

interface Budget {
  readonly activityGrowthMb: number;
  readonly activityMainCpuPercent: number;
}

interface ActivitySample {
  /** What all of YapYap's processes hold more after the rounds of use, once settled. */
  readonly activityGrowthMb: number;
  /** The main process, as a share of one core, while the rounds run. */
  readonly activityMainCpuPercent: number;
}

/** CPU seconds the main process has used, cumulative for the reason `accounts.spec.ts` gives. */
const mainCpuSeconds = (app: ElectronApplication): Promise<number> =>
  app.evaluate(
    ({ app: electronApp }) =>
      electronApp.getAppMetrics().find((entry) => entry.type === 'Browser')?.cpu
        .cumulativeCPUUsage ?? 0,
  );

/**
 * One round of everyday use: show each account in turn, let each one
 * notify, then open Settings and close it again.
 */
async function round(app: ElectronApplication, sidebar: Page): Promise<void> {
  for (const name of ['WhatsApp', 'WhatsApp 2']) {
    await sidebar.getByRole('button', { name, exact: true }).click();
  }
  // A hidden account notifies too; Playwright's click would wait for it to show.
  for (const page of app.windows().filter((candidate) => candidate.url().startsWith('http'))) {
    await page.getByTestId('notify').dispatchEvent('click');
  }
  // By URL: a page the second account opens late could otherwise pass for the new window.
  await clickMenu(app, 'Settings…');
  const settings = await chromePage(app, '/settings.html');
  await settings.getByRole('heading', { name: 'Settings' }).waitFor();
  await settings.close();
  await expect
    .poll(() => app.windows().some((page) => page.url().endsWith('/settings.html')))
    .toBe(false);
}

/** One launch with two accounts: memory before and after the rounds, and the main process's CPU. */
function measureActivity(): Promise<ActivitySample> {
  return onFreshProfile(async (app) => {
    await (await whatsAppPage(app)).getByTestId('fake-whatsapp').waitFor({ state: 'visible' });
    await clickMenu(app, 'Add Account');
    const sidebar = await chromePage(app, '/sidebar.html');
    // The fake page wires its buttons once loaded; a first round does that for both accounts.
    await round(app, sidebar);
    await settle();
    const before = await memoryMb(app);
    const cpuBefore = await mainCpuSeconds(app);
    const started = performance.now();
    for (let done = 0; done < ROUNDS; done += 1) {
      await round(app, sidebar);
    }
    const activityMainCpuPercent = cpuPercentSince(
      (await mainCpuSeconds(app)) - cpuBefore,
      started,
    );
    await settle();
    return { activityGrowthMb: (await memoryMb(app)) - before, activityMainCpuPercent };
  });
}

test('stays within the memory growth and main-process CPU budgets in use', async ({}, testInfo) => {
  test.setTimeout((RUNS + 1) * 120_000);
  const budget = await budgetHere<Budget>();
  const samples: ActivitySample[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    samples.push(await measureActivity());
  }
  const result = {
    platform: process.platform,
    activityGrowthMb: median(samples.map((sample) => sample.activityGrowthMb)),
    activityMainCpuPercent: median(samples.map((sample) => sample.activityMainCpuPercent)),
    budget,
    samples,
  };
  await writeFile(testInfo.outputPath('activity.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  expect
    .soft(result.activityGrowthMb, 'median memory growth after use (MB)')
    .toBeLessThanOrEqual(budget.activityGrowthMb);
  expect
    .soft(result.activityMainCpuPercent, 'median main-process CPU in use (% of a core)')
    .toBeLessThanOrEqual(budget.activityMainCpuPercent);
});
