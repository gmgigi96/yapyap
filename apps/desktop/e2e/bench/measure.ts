import type { ElectronApplication } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';
import { launchApp, whatsAppPage } from '../fixtures.ts';

export interface Sample {
  /** From starting the process to WhatsApp's page being visible. */
  readonly coldStartMs: number;
  /** All of YapYap's processes together, after it has settled. */
  readonly idleMemoryMb: number;
  /** The same memory by process, so a budget overrun shows where it went (#428). */
  readonly processesMb: Readonly<Record<string, number>>;
  /**
   * Renderer processes: with one account, only WhatsApp's should run. A
   * window created early or kept after closing, or a window's empty page,
   * would each add one, and as much memory as a small page.
   */
  readonly renderers: number;
}

/** Long enough for start-up work to finish and memory to settle. */
const SETTLE_MS = 10_000;

/**
 * Working-set kilobytes by process: a page's process by what it shows, the
 * fake WhatsApp page as `whatsapp`, and others by their service or kind.
 */
async function memoryByProcess(
  app: ElectronApplication,
): Promise<{ readonly kilobytes: Record<string, number>; readonly renderers: number }> {
  return app.evaluate(({ app: electronApp, webContents }) => {
    const labels = new Map(
      webContents.getAllWebContents().map((page) => {
        const url = page.getURL();
        const shown = url.startsWith('http') ? 'whatsapp' : (url.split('?')[0] ?? url);
        return [page.getOSProcessId(), shown === '' ? 'empty page' : shown] as const;
      }),
    );
    const kilobytes: Record<string, number> = {};
    const metrics = electronApp.getAppMetrics();
    for (const metric of metrics) {
      const label = labels.get(metric.pid) ?? metric.serviceName ?? metric.type;
      kilobytes[label] = (kilobytes[label] ?? 0) + metric.memory.workingSetSize;
    }
    return { kilobytes, renderers: metrics.filter((metric) => metric.type === 'Tab').length };
  });
}

const megabytes = (kilobytes: number): number => Math.round(kilobytes / 1024);

/** One cold start on a fresh profile, as a first launch after install. */
export async function measureOnce(): Promise<Sample> {
  const fake = await startFakeWhatsApp();
  const profile = await mkdtemp(join(tmpdir(), 'yapyap-bench-'));
  const started = performance.now();
  const app = await launchApp(fake.origin, profile);
  try {
    const window = await whatsAppPage(app);
    await window.getByTestId('fake-whatsapp').waitFor({ state: 'visible' });
    const coldStartMs = Math.round(performance.now() - started);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const { kilobytes: processes, renderers } = await memoryByProcess(app);
    return {
      coldStartMs,
      renderers,
      idleMemoryMb: megabytes(Object.values(processes).reduce((sum, value) => sum + value, 0)),
      processesMb: Object.fromEntries(
        Object.entries(processes).map(([label, kilobytes]) => [label, megabytes(kilobytes)]),
      ),
    };
  } finally {
    await app.close();
    await fake.close();
    await rm(profile, { recursive: true, force: true });
  }
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
