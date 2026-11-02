import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { AgentScope } from '../../shared/agents-api.ts';
import { DAY_MS, MINUTE_MS, type Counter } from './limits.ts';
import { reaches, type AgentToken } from './tokens.ts';
import {
  allowedOpenChat,
  openNamed,
  refuse,
  ToolRefusal,
  type AgentAccounts,
  type AgentPage,
} from './tool-steps.ts';

/** The most messages `read_chat` returns, as the adapter reads them. */
const MAX_MESSAGES = 50;
const DEFAULT_MESSAGES = 20;
/** The longest message `write_draft` and `send_message` take. */
const MAX_TEXT = 4096;

/** What every tool works with: the calling token and the accounts. */
export interface ToolContext {
  readonly token: AgentToken;
  readonly accounts: AgentAccounts;
  readonly queue: <T>(account: string, run: () => Promise<T>) => Promise<T>;
  readonly counter: Counter;
  /** Records a call: the tool, the account and how it ended, never what it read or wrote. */
  readonly record: (tool: string, account: string, result: string) => void;
  /** Tells the user the token sent a message to `chat`. */
  readonly notifySent: (chat: string) => void;
}

const account = z.string().min(1).max(36).describe('The account’s ID, from list_accounts.');
const chat = z.string().min(1).max(256).describe('The chat’s name, exactly as WhatsApp shows it.');
const text = z.string().min(1).max(MAX_TEXT);

const answer = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
});

const failed = (failure: string): CallToolResult => ({
  content: [{ type: 'text', text: failure }],
  isError: true,
});

type Outcome = { readonly value: unknown } | { readonly failure: string };

/**
 * Runs a tool for one account: refused unless the token names the account
 * and it runs, one call at a time per account. A page that throws is
 * WhatsApp not ready, never a crash.
 */
async function outcomeOf(
  ctx: ToolContext,
  id: string,
  run: (page: AgentPage) => Promise<unknown>,
): Promise<Outcome> {
  const page = ctx.token.accounts.includes(id) ? ctx.accounts.page(id) : undefined;
  if (page === undefined) {
    return { failure: 'account_not_allowed' };
  }
  try {
    return { value: await ctx.queue(id, () => run(page)) };
  } catch (error) {
    return { failure: error instanceof ToolRefusal ? error.failure : 'whatsapp_not_ready' };
  }
}

async function forAccount(
  ctx: ToolContext,
  tool: string,
  id: string,
  run: (page: AgentPage) => Promise<unknown>,
): Promise<CallToolResult> {
  const outcome = await outcomeOf(ctx, id, run);
  const failure = 'failure' in outcome ? outcome.failure : undefined;
  ctx.record(tool, id, failure ?? 'ok');
  return 'value' in outcome ? answer(outcome.value) : failed(outcome.failure);
}

const has = (ctx: ToolContext, scope: AgentScope): boolean => ctx.token.scopes.includes(scope);

function readingTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_accounts',
    { description: 'The WhatsApp accounts this token may use.' },
    () => answer(ctx.accounts.list().filter((entry) => ctx.token.accounts.includes(entry.id))),
  );
  if (has(ctx, 'chat:read-unread-summary')) {
    server.registerTool(
      'list_unread',
      {
        description: 'Chats with unread messages: name, unread count and last-message preview.',
        inputSchema: z.object({ account }),
      },
      (args) =>
        forAccount(ctx, 'list_unread', args.account, async (page) =>
          (await page.readUnread()).filter((entry) => reaches(ctx.token, entry.name)),
        ),
    );
  }
  if (has(ctx, 'chat:read-active')) {
    server.registerTool(
      'read_chat',
      {
        description: `The open chat's last messages; names a chat to open it first (needs chat:open).`,
        inputSchema: z.object({
          account,
          chat: chat.optional(),
          messages: z.number().int().min(1).max(MAX_MESSAGES).optional(),
        }),
      },
      (args) =>
        forAccount(ctx, 'read_chat', args.account, async (page) => {
          await openNamed(page, ctx.token, args.chat);
          return allowedOpenChat(page, ctx.token, args.messages ?? DEFAULT_MESSAGES);
        }),
    );
  }
}

function draftTools(server: McpServer, ctx: ToolContext): void {
  if (has(ctx, 'composer:read-draft')) {
    server.registerTool(
      'read_draft',
      {
        description: 'What is typed in the open chat’s message box.',
        inputSchema: z.object({ account }),
      },
      (args) =>
        forAccount(ctx, 'read_draft', args.account, async (page) => {
          await allowedOpenChat(page, ctx.token, 1);
          return { draft: await page.readDraft() };
        }),
    );
  }
  if (has(ctx, 'composer:insert-draft')) {
    server.registerTool(
      'write_draft',
      {
        description:
          'Puts text in the message box without sending it; names a chat to open it first.',
        inputSchema: z.object({ account, chat: chat.optional(), text }),
      },
      (args) =>
        forAccount(ctx, 'write_draft', args.account, async (page) => {
          await openNamed(page, ctx.token, args.chat);
          await allowedOpenChat(page, ctx.token, 1);
          return { written: (await page.replaceDraft(args.text)) || refuse('no_chat_open') };
        }),
    );
  }
}

/** Refuses a send that would pass the token's limits; counts it otherwise. */
function countSend(ctx: ToolContext): void {
  const { id, limits } = ctx.token;
  const minute = `${id}:send:minute`;
  const day = `${id}:send:day`;
  if (
    ctx.counter.full(minute, limits.sendsPerMinute, MINUTE_MS) ||
    ctx.counter.full(day, limits.sendsPerDay, DAY_MS)
  ) {
    refuse('rate_limited');
  }
  ctx.counter.take(minute, limits.sendsPerMinute, MINUTE_MS);
  ctx.counter.take(day, limits.sendsPerDay, DAY_MS);
}

/**
 * Sends `message` in `name`, which must be on the token's list. It never
 * touches what the user is typing: a message box with anything in it is
 * refused, not overwritten or sent (ADR 0019).
 */
async function send(ctx: ToolContext, page: AgentPage, name: string, message: string) {
  if (!reaches(ctx.token, name)) {
    refuse('chat_not_allowed');
  }
  await openNamed(page, { ...ctx.token, scopes: ['chat:open'] }, name);
  if (((await page.readDraft()) ?? '').trim() !== '') {
    refuse('composer_busy');
  }
  countSend(ctx);
  if (!(await page.replaceDraft(message)) || !(await page.pressEnter())) {
    refuse('no_chat_open');
  }
  if (ctx.token.notify) {
    ctx.notifySent(name);
  }
  return { sent: true };
}

function sendingTool(server: McpServer, ctx: ToolContext): void {
  if (!has(ctx, 'messages:send')) {
    return;
  }
  server.registerTool(
    'send_message',
    {
      description: 'Sends a plain-text message to a chat this token lists.',
      inputSchema: z.object({ account, chat, text }),
    },
    (args) =>
      forAccount(ctx, 'send_message', args.account, (page) =>
        send(ctx, page, args.chat, args.text),
      ),
  );
}

/** Registers the tools the calling token's scopes allow; the agent sees no other (ADR 0019). */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  readingTools(server, ctx);
  draftTools(server, ctx);
  sendingTool(server, ctx);
}
