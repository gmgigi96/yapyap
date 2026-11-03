import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ElectronApplication, Page } from '@playwright/test';
import { ADAPTER_WORLD_ID } from '../src/adapter/world.ts';
import { chromePage, clickMenu } from './chrome-helpers.ts';
import { expect, whatsAppContents } from './fixtures.ts';

/** A control of the assistant bar, and where on the page the user would click it. */
interface BarControl {
  readonly name: string;
  readonly disabled: boolean;
  readonly x: number;
  readonly y: number;
}

interface KeptBar {
  readonly host: HTMLElement;
  readonly parts: { readonly input: HTMLElement };
}

/**
 * Runs in the adapter's isolated world, where YapYap keeps the bar: its
 * shadow root is closed, so nothing else, Playwright included, can look in.
 */
function readBarControls(): BarControl[] | null {
  const kept = (globalThis as { yapyapAssistantBarView?: KeptBar }).yapyapAssistantBarView;
  if (kept?.host.isConnected !== true) {
    return null;
  }
  kept.host.scrollIntoView({ block: 'center' });
  const root = kept.parts.input.getRootNode() as ShadowRoot;
  return (
    [
      ...root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
        'button, input, select',
      ),
    ]
      // Controls inside a closed part of the bar take no room, and cannot be clicked.
      .filter((control) => !control.hidden && control.getClientRects().length > 0)
      .map((control) => {
        const box = control.getBoundingClientRect();
        return {
          name: control.getAttribute('aria-label') ?? control.textContent,
          disabled: control.disabled,
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        };
      })
  );
}

/** Runs in the adapter's isolated world, as {@link readBarControls} does: the bar's status line. */
function readBarStatus(): string | null {
  const kept = (globalThis as { yapyapAssistantBarView?: { parts: { status: HTMLElement } } })
    .yapyapAssistantBarView;
  return kept?.parts.status.textContent ?? null;
}

/** Runs in the adapter's isolated world: the longer text the bar shows, or null for none. */
function readBarResult(): string | null {
  const kept = (globalThis as { yapyapAssistantBarView?: { parts: { result: HTMLElement } } })
    .yapyapAssistantBarView;
  return kept === undefined || kept.parts.result.hidden ? null : kept.parts.result.textContent;
}

/** Runs `read` in the adapter's isolated world of WhatsApp's page, where the bar lives. */
const inBarWorld = async (app: ElectronApplication, read: () => unknown): Promise<unknown> =>
  (await whatsAppContents(app)).evaluate(
    (page, { code, world }): Promise<unknown> =>
      page.executeJavaScriptInIsolatedWorld(world, [{ code }]),
    { code: `(${read.toString()})()`, world: ADAPTER_WORLD_ID },
  );

/** The assistant bar's longer text, such as a summary or what is sent, or null while it shows none. */
export const assistantBarResult = async (app: ElectronApplication): Promise<string | null> => {
  const result = await inBarWorld(app, readBarResult);
  return typeof result === 'string' ? result : null;
};

/** The assistant bar's status line in the active account's WhatsApp, or null while it is not there. */
const assistantBarStatus = async (app: ElectronApplication): Promise<string | null> => {
  const status = await inBarWorld(app, readBarStatus);
  return typeof status === 'string' ? status : null;
};

/** The assistant bar's controls in the active account's WhatsApp, or null while it is not there. */
const assistantBarControls = async (app: ElectronApplication): Promise<BarControl[] | null> =>
  ((await inBarWorld(app, readBarControls)) ?? null) as BarControl[] | null;

/**
 * Clicks a control of the assistant bar as the user would, with the mouse:
 * the bar ignores clicks that page scripts make up.
 */
export async function clickInBar(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<void> {
  const find = async (): Promise<BarControl | undefined> =>
    (await assistantBarControls(app))?.find(
      (control) => control.name === name && !control.disabled,
    );
  await expect.poll(find, { message: `the bar’s ${name}` }).toBeDefined();
  const control = await find();
  if (control === undefined) {
    throw new Error(`The bar has no ${name}.`);
  }
  await page.mouse.click(control.x, control.y);
}

/** Claude's streamed answer saying `text`, as the Messages API sends it. */
export const claudeAnswer = (text: string): string =>
  [
    {
      type: 'message_start',
      message: {
        id: 'msg_e2e',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-opus-5-5',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 3 },
    },
    { type: 'message_stop' },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');

/** Claude's models, newest first, as Anthropic lists them. */
const CLAUDE_MODELS = JSON.stringify({
  data: [
    {
      type: 'model',
      id: 'claude-opus-5-5',
      display_name: 'Claude Opus 5.5',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      type: 'model',
      id: 'claude-haiku-5-5',
      display_name: 'Claude Haiku 5.5',
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  has_more: false,
  first_id: null,
  last_id: null,
});

/**
 * Plays Claude on the assistant's own session, so nothing reaches the real
 * API: it lists two models, and answers every message with the next of
 * `answers`, the last one again once they run out, keeping what was asked
 * in `claudeRequests`.
 */
async function playClaude(app: ElectronApplication, ...answers: readonly string[]): Promise<void> {
  await app.evaluate(
    ({ session }, { bodies, models }) => {
      const asked: string[] = [];
      Object.assign(globalThis, { claudeRequests: asked });
      session.fromPartition('yapyap-assistant').protocol.handle('https', async (request) => {
        if (new URL(request.url).pathname === '/v1/models') {
          return new Response(models, { headers: { 'content-type': 'application/json' } });
        }
        asked.push(await request.text());
        const body = bodies[Math.min(asked.length, bodies.length) - 1] ?? '';
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      });
    },
    { bodies: [...answers], models: CLAUDE_MODELS },
  );
}

/** What Claude was asked since {@link playClaude}, as the request bodies. */
export const claudeRequests = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => (globalThis as { claudeRequests?: string[] }).claudeRequests ?? []);

/** Three suggested replies. */
export const CLAUDE_ANSWER = claudeAnswer('Yes, 8 works!\nCan we do 9?\nSee you there');

/** The test system has no keyring, so encryption is stood in for, reversibly. */
export async function standInKeyring(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isAsyncEncryptionAvailable = () => Promise.resolve(true);
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptStringAsync = (text: string) =>
      Promise.resolve(Buffer.from(`sealed:${text}`));
    safeStorage.decryptStringAsync = (sealed: Buffer) =>
      Promise.resolve({
        result: sealed.toString().slice('sealed:'.length),
        shouldReEncrypt: false,
      });
  });
}

/** Opens Settings from the Assistant menu; the assistant is its first section. */
export async function openAssistantSettings(app: ElectronApplication): Promise<Page> {
  await clickMenu(app, 'Assistant Settings…');
  const settings = await chromePage(app, '/settings.html');
  await expect(settings.getByRole('region', { name: 'Assistant' })).toBeVisible();
  return settings;
}

/** Saves an API key for Claude in Settings › Assistant, with Claude played by {@link playClaude}. */
export async function readyClaude(
  app: ElectronApplication,
  ...answers: readonly string[]
): Promise<Page> {
  await standInKeyring(app);
  await playClaude(app, ...answers);
  const settings = await openAssistantSettings(app);
  await settings.getByLabel('API key for Claude (Anthropic)').fill('sk-ant-e2e-key');
  await settings.getByRole('button', { name: 'Save Key' }).first().click();
  await expect(
    settings.getByText('A key is saved, encrypted by your system.').first(),
  ).toBeVisible();
  return settings;
}

/** The bar's status line, once it says something matching `pattern`. */
export async function barSays(
  app: ElectronApplication,
  pattern: RegExp | string,
  timeout = 20_000,
): Promise<void> {
  await expect.poll(() => assistantBarStatus(app), { timeout }).toMatch(pattern);
}

/** The names of the bar's controls that show. */
export const barNames = async (app: ElectronApplication): Promise<string[] | undefined> =>
  (await assistantBarControls(app))?.map(({ name }) => name);

/** A model server on this computer, as the E2E tests run it. */
export interface FakeModelServer {
  readonly port: number;
  /** The chat requests it answered, as their bodies. */
  readonly chats: string[];
  readonly close: () => void;
}

/** `text` as an OpenAI-compatible server streams a chat answer. */
const openAIAnswer = (text: string): string =>
  [
    { choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ]
    .map(
      (chunk) =>
        `data: ${JSON.stringify({ id: 'e2e', object: 'chat.completion.chunk', created: 1, model: 'tiny-e2e', ...chunk })}\n\n`,
    )
    .join('')
    .concat('data: [DONE]\n\n');

/**
 * An OpenAI-compatible server on a free loopback port, as Ollama or LM Studio
 * would run one: it lists one model and streams `answer` to every chat.
 */
export async function fakeModelServer(answer: string): Promise<FakeModelServer> {
  const chats: string[] = [];
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'tiny-e2e', object: 'model', created: 1, owned_by: 'e2e' }],
        }),
      );
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        chats.push(body);
        response.setHeader('content-type', 'text/event-stream');
        response.end(openAIAnswer(answer));
      });
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { port, chats, close: () => server.close() };
}

/** A free loopback port where nothing listens, for a search that finds nothing. */
export async function quietPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return port;
}
