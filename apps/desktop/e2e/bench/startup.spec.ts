import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { measureOnce, median, type Sample } from './measure.ts';

const RUNS = 7;

interface Budget {
  readonly coldStartMs: number;
  readonly idleMemoryMb: number;
  readonly idleRenderers: number;
}

/** Each process's median memory across the samples, largest first. */
function medianByProcess(samples: readonly Sample[]): Record<string, number> {
  const labels = new Set(samples.flatMap((sample) => Object.keys(sample.processesMb)));
  const medians = [...labels].map(
    (label) => [label, median(samples.map((sample) => sample.processesMb[label] ?? 0))] as const,
  );
  return Object.fromEntries(medians.sort(([, a], [, b]) => b - a));
}

async function budgetHere(): Promise<Budget> {
  const budgets = JSON.parse(
    await readFile(join(import.meta.dirname, 'budgets.json'), 'utf8'),
  ) as Record<string, Budget | undefined>;
  const budget = budgets[process.platform];
  if (budget === undefined) {
    throw new Error(`No budget for ${process.platform}`);
  }
  return budget;
}

test('stays within the cold-start and idle-memory budgets', async ({}, testInfo) => {
  test.setTimeout((RUNS + 1) * 60_000);
  const budget = await budgetHere();
  // The first launch on a runner waits for the disk cache, which says nothing
  // about YapYap, so it warms up and is left out.
  await measureOnce();
  const samples: Sample[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    samples.push(await measureOnce());
  }
  const result = {
    platform: process.platform,
    coldStartMs: median(samples.map((sample) => sample.coldStartMs)),
    idleMemoryMb: median(samples.map((sample) => sample.idleMemoryMb)),
    idleRenderers: Math.max(...samples.map((sample) => sample.renderers)),
    processesMb: medianByProcess(samples),
    budget,
    samples,
  };
  await writeFile(testInfo.outputPath('benchmark.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  expect.soft(result.coldStartMs, 'median cold start (ms)').toBeLessThanOrEqual(budget.coldStartMs);
  expect
    .soft(result.idleMemoryMb, 'median idle memory (MB)')
    .toBeLessThanOrEqual(budget.idleMemoryMb);
  // A count, not a measure: any launch over it means a renderer with nothing to do.
  expect
    .soft(result.idleRenderers, 'most renderer processes at idle')
    .toBeLessThanOrEqual(budget.idleRenderers);
});
