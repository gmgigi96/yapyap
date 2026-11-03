import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type JSHandle,
  type Page,
} from '@playwright/test';
import { spawn, spawnSync, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SETTINGS_VERSION } from '../src/main/settings/schema.ts';
import { appEnvironment } from './app-environment.ts';
import { startFakeWhatsApp, type FakeWhatsApp } from './fake-whatsapp-server.ts';

const MAIN = join(import.meta.dirname, '..', 'out', 'main', 'index.js');

interface Options {
  /** The fake WhatsApp page served at `/`. */
  fakePage: string;
}

/** How long a quit may take before the test reports what kept YapYap open (#223). */
const QUIT_TIMEOUT_MS = 30_000;
const LOG_LINES = 40;
const LOGS = new WeakMap<ElectronApplication, string[]>();
/**
 * Every app a test started and that still runs. A test that fails or times
 * out before quitting its app would otherwise leave it running, and on a
 * developer's desktop its tray icon and dialogs outlive the test.
 */
const LAUNCHED = new Set<ElectronApplication>();

/** The app's last log lines; the logger mirrors every line to stderr, already redacted. */
function recentLog(app: ElectronApplication): string[] {
  const lines: string[] = [];
  app.process().stderr?.on('data', (chunk: Buffer) => {
    lines.push(
      ...chunk
        .toString()
        .split('\n')
        .filter((line) => line !== ''),
    );
    lines.splice(0, Math.max(0, lines.length - LOG_LINES));
  });
  return lines;
}

/**
 * Where each thread of a hung YapYap was, and its helper processes, attached
 * to the report. Only macOS has hung so far, and `sample` ships with it (#223).
 */
async function attachHungState(app: ElectronApplication): Promise<void> {
  const pid = app.process().pid;
  if (process.platform !== 'darwin' || pid === undefined) {
    return;
  }
  const run = (command: string, args: string[]): string => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30_000 });
    return `$ ${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`;
  };
  const helpers = run('/bin/ps', ['-A', '-o', 'pid,ppid,stat,etime,comm'])
    .split('\n')
    .filter((line) => line.trim().split(/\s+/)[1] === String(pid))
    .join('\n');
  await base.info().attach('hung-at-quit.txt', {
    body: [
      `Helper processes of ${String(pid)}:`,
      helpers,
      run('/usr/bin/sample', [String(pid), '3']),
    ].join('\n'),
    contentType: 'text/plain',
  });
}

/** Where the main process keeps the timeline that `recordLoads` writes. */
const TIMELINE = '__yapyapE2eLoads';

/**
 * Records when each web contents starts, finishes or fails a load, from the
 * main process, so a test that waits in vain for a page can tell a view that
 * was never created from one that never finished loading (#247). A normal
 * start logs nothing, so the app's log cannot tell them apart.
 */
async function recordLoads(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, webContents }, key) => {
    const started = Date.now();
    const timeline: string[] = [];
    (globalThis as Record<string, unknown>)[key] = timeline;
    const watch = (contents: Electron.WebContents): void => {
      const note = (event: string, detail = ''): void => {
        const at = String(Date.now() - started).padStart(6);
        timeline.push(`${at} ms #${String(contents.id)} ${event} ${contents.getURL()} ${detail}`);
      };
      note('watched');
      contents.on('did-start-loading', () => {
        note('did-start-loading');
      });
      contents.on('dom-ready', () => {
        note('dom-ready');
      });
      contents.on('did-finish-load', () => {
        note('did-finish-load');
      });
      contents.on('did-fail-load', (_event, code, description) => {
        note('did-fail-load', `${String(code)} ${description}`);
      });
      contents.on('render-process-gone', (_event, details) => {
        note('render-process-gone', details.reason);
      });
      contents.on('unresponsive', () => {
        note('unresponsive');
      });
    };
    webContents.getAllWebContents().forEach(watch);
    electronApp.on('web-contents-created', (_event, contents) => {
      watch(contents);
    });
  }, TIMELINE);
}

/** The load timeline and every web contents' state, for a failed test's report (#247). */
async function attachLoads(app: ElectronApplication): Promise<void> {
  const body = await app
    .evaluate(({ webContents }, key) => {
      const timeline = ((globalThis as Record<string, unknown>)[key] ?? []) as string[];
      const now = webContents
        .getAllWebContents()
        .map(
          (contents) =>
            `#${String(contents.id)} ${contents.getURL()} loading=${String(contents.isLoading())} ` +
            `waiting=${String(contents.isWaitingForResponse())} crashed=${String(contents.isCrashed())}`,
        );
      return ['Load events:', ...timeline, '', 'Web contents at the end:', ...now].join('\n');
    }, TIMELINE)
    .catch((error: unknown) => `Could not read the load timeline: ${String(error)}`);
  await base.info().attach('loads.txt', { body, contentType: 'text/plain' });
}

const PAGE_TIMEOUT_MS = 30_000;

/** When each app was launched, so a slow start can be told from a slow page (#247). */
const LAUNCHED_AT = new WeakMap<ElectronApplication, number>();

/**
 * What the main process had done when no WhatsApp page appeared: whether
 * Electron was ready, its windows, and every web contents' address and
 * state, so a slow start shows apart from a page that never loaded (#247).
 */
async function startupState(app: ElectronApplication): Promise<string> {
  const launched = LAUNCHED_AT.get(app);
  const elapsed = launched === undefined ? 'unknown' : `${String(Date.now() - launched)} ms`;
  const state = await app
    .evaluate(({ app: electronApp, BaseWindow, webContents }) =>
      [
        `ready=${String(electronApp.isReady())}`,
        `windows=${String(BaseWindow.getAllWindows().length)}`,
        ...webContents
          .getAllWebContents()
          .map(
            (contents) =>
              `#${String(contents.id)} ${contents.getURL() || '(no URL)'} loading=${String(contents.isLoading())}`,
          ),
      ].join('; '),
    )
    .catch((error: unknown) => `the main process did not answer: ${String(error)}`);
  return `Launched ${elapsed} ago; ${state}`;
}

/**
 * The page of the active account's WhatsApp. It runs in a view inside the
 * main window, whose own page stays blank (#56), so it is found by its URL.
 * Given `besides`, it waits for another account's page: a new account can
 * take more than a few seconds to appear on a slow runner, and a failed wait
 * then says what the main process had done (#247).
 */
export async function whatsAppPage(app: ElectronApplication, besides?: Page): Promise<Page> {
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  for (;;) {
    const page = app
      .windows()
      .find((candidate) => candidate !== besides && candidate.url().startsWith('http'));
    if (page !== undefined) {
      return page;
    }
    if (Date.now() > deadline) {
      const pages = app.windows().map((candidate) => candidate.url());
      throw new Error(
        `WhatsApp never opened. Pages: ${pages.join(', ') || 'none'}. ${await startupState(app)}.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The web contents of the first account's WhatsApp, in the main process,
 * once its page has appeared. Every other web contents is YapYap's own, on
 * `app:`, so WhatsApp's is the one on HTTP.
 */
export async function whatsAppContents(
  app: ElectronApplication,
): Promise<JSHandle<Electron.WebContents>> {
  await whatsAppPage(app);
  return app.evaluateHandle(({ webContents }) => {
    const page = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('http'));
    if (page === undefined) {
      throw new Error('WhatsApp has no web contents.');
    }
    return page;
  });
}

/**
 * The main window, which holds the active account's WhatsApp view. Windows
 * have no stable order once a chrome window is open, so it is found through
 * WhatsApp's web contents rather than by index.
 */
export async function mainWindow(
  app: ElectronApplication,
): Promise<JSHandle<Electron.BrowserWindow>> {
  const contents = await whatsAppContents(app);
  return app.evaluateHandle(({ BrowserWindow }, page) => {
    const window = BrowserWindow.fromWebContents(page);
    if (window === null) {
      throw new Error('WhatsApp has no window.');
    }
    return window;
  }, contents);
}

/**
 * Quits the app, and if it hangs, kills it and fails with the windows it had
 * and its last log lines rather than an unexplained teardown timeout (#223).
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  const log = LOGS.get(app) ?? [];
  const windows = await app
    .evaluate(({ BrowserWindow, webContents }) =>
      webContents.getAllWebContents().map((contents) => {
        const window = BrowserWindow.fromWebContents(contents);
        const shown = window === null ? 'no window' : `visible=${String(window.isVisible())}`;
        return `${contents.getURL()} ${shown}`;
      }),
    )
    .catch(() => ['(could not list windows)']);
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      resolve('timeout');
    }, QUIT_TIMEOUT_MS);
  });
  const result = await Promise.race([app.close().then(() => 'closed' as const), timedOut]);
  clearTimeout(timer);
  if (result === 'timeout') {
    await attachHungState(app);
    app.process().kill('SIGKILL');
    throw new Error(
      [
        `YapYap did not quit within ${String(QUIT_TIMEOUT_MS / 1000)} s (#223).`,
        'Pages before closing:',
        ...windows,
        'Last log lines:',
        ...log,
      ].join('\n'),
    );
  }
}

/**
 * Writes `settings` as the profile's settings file, at the current schema
 * version, before YapYap starts there. What it leaves out takes its default.
 */
export async function seedSettings(
  profile: string,
  settings: Readonly<Record<string, unknown>>,
): Promise<void> {
  await writeFile(
    join(profile, 'settings.json'),
    JSON.stringify({ schemaVersion: SETTINGS_VERSION, ...settings }),
  );
}

/**
 * Starts the development build on a throwaway profile, so tests never touch
 * the developer's own settings or each other's.
 */
export async function launchApp(
  origin: string,
  profile: string,
  args: readonly string[] = [],
  {
    firstRun = false,
    env = {},
  }: { readonly firstRun?: boolean; readonly env?: Readonly<Record<string, string>> } = {},
): Promise<ElectronApplication> {
  // Every test profile is new, which YapYap would greet with its welcome
  // window (#84); a settings file marks it as used, unless the test wants that.
  if (!firstRun) {
    await writeFile(
      join(profile, 'settings.json'),
      JSON.stringify({ schemaVersion: SETTINGS_VERSION }),
      {
        flag: 'wx',
      },
    ).catch(() => undefined);
  }
  const started = Date.now();
  const app = await electron.launch({
    args: [MAIN, `--user-data-dir=${profile}`, ...args],
    // Playwright forces a light color scheme by default, which would hide YapYap's own theming.
    colorScheme: null,
    // Playwright adds --no-sandbox unless told otherwise, and YapYap refuses
    // to run without its sandbox; tests run with the real one.
    chromiumSandbox: true,
    env: { ...appEnvironment(origin, profile), ...env },
  });
  LOGS.set(app, recentLog(app));
  LAUNCHED_AT.set(app, started);
  LAUNCHED.add(app);
  await recordLoads(app);
  app.process().once('exit', () => LAUNCHED.delete(app));
  return app;
}

/** Starts the development build as its own process, outside Playwright's control. */
export async function spawnApp(
  origin: string,
  profile: string,
  args: readonly string[],
): Promise<ChildProcessByStdio<null, null, Readable>> {
  const { default: executable } = (await import('electron')) as unknown as { default: string };
  return spawn(executable, [MAIN, `--user-data-dir=${profile}`, ...args], {
    env: appEnvironment(origin, profile),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

/**
 * Starts the development build headless (ADR 0020), as from a script: with
 * no display to reach and its output piped, which is no terminal.
 */
export async function spawnHeadless(
  origin: string,
  profile: string,
  { backend = true }: { readonly backend?: boolean } = {},
): Promise<ChildProcessByStdio<null, Readable, Readable>> {
  const { default: executable } = (await import('electron')) as unknown as { default: string };
  const env = appEnvironment(origin, profile);
  delete env['DISPLAY'];
  delete env['WAYLAND_DISPLAY'];
  // Chromium's own errors reach standard error, for a test that fails to say why.
  env['ELECTRON_ENABLE_LOGGING'] = '1';
  // Chromium reads its headless backend only from its own command line (ADR 0020).
  const display = backend ? ['--ozone-platform=headless'] : [];
  return spawn(executable, [...display, MAIN, `--user-data-dir=${profile}`, '--headless'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** How long a second launch may take to hand over to the running app and exit. */
const HANDOVER_TIMEOUT_MS = 30_000;

/**
 * Starts YapYap again on `profile` while the app under test runs there, as a
 * user or the OS would, and resolves with how it ended once it hands over.
 * One that never exits is killed, so it cannot outlive the test holding the
 * profile, and the test fails with what it logged rather than a bare timeout.
 */
export async function launchAgain(
  origin: string,
  profile: string,
  args: readonly string[],
): Promise<{ code: number | null; signal: string | null; stderr: string }> {
  const second = await spawnApp(origin, profile, args);
  let stderr = '';
  second.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    second.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      resolve('timeout');
    }, HANDOVER_TIMEOUT_MS);
  });
  const result = await Promise.race([exited, timedOut]);
  clearTimeout(timer);
  if (result === 'timeout') {
    second.kill('SIGKILL');
    await exited;
    throw new Error(
      `The second launch did not exit within ${String(HANDOVER_TIMEOUT_MS / 1000)} s.\n${stderr}`,
    );
  }
  return { ...result, stderr };
}

interface Fixtures {
  /** The app's user data folder, where settings are saved. */
  profile: string;
  fakeWhatsApp: FakeWhatsApp;
  app: ElectronApplication;
  window: Page;
}

export const test = base.extend<Fixtures & Options & { leftovers: undefined }>({
  // Set up first, so it is torn down last, after the fixtures that quit apps properly.
  leftovers: [
    async ({}, use) => {
      await use(undefined);
      for (const app of LAUNCHED) {
        app.process().kill('SIGKILL');
      }
      LAUNCHED.clear();
    },
    { auto: true },
  ],
  fakePage: ['index.html', { option: true }],
  fakeWhatsApp: async ({ fakePage }, use) => {
    const server = await startFakeWhatsApp(fakePage);
    await use(server);
    await server.close();
  },
  profile: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'yapyap-e2e-'));
    await use(profile);
    // Windows keeps a profile's files locked for a moment after Chromium's
    // helper processes outlive the app, which fails a plain delete with EBUSY.
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  },
  app: async ({ fakeWhatsApp, profile }, use, testInfo) => {
    const app = await launchApp(fakeWhatsApp.origin, profile);
    await use(app);
    // What YapYap logged, so a slow or failed start shows what it was doing (#247).
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('app-log.txt', {
        body: (LOGS.get(app) ?? []).join('\n'),
        contentType: 'text/plain',
      });
      await attachLoads(app);
    }
    await closeApp(app);
  },
  window: async ({ app }, use) => {
    await use(await whatsAppPage(app));
  },
});

export { expect } from '@playwright/test';
