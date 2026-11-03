import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { AgentScope } from '../../shared/agents-api.ts';
import { searchChats } from './chat-search.ts';
import { DAY_MS, MINUTE_MS, type Counter } from './limits.ts';
import { ACCOUNT_ID_LENGTH, MAX_CHAT_NAME, MAX_PHONE } from './token-spec.ts';
import { reaches, type AgentToken, type ListedChats } from './tokens.ts';
import {
  allowedOpenChat,
  openTarget,
  refuse,
  ToolRefusal,
  type AgentAccounts,
  type AgentPage,
  type ChatTarget,
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
  /** The chats the token lists, as the user entered them. */
  readonly listed: () => Promise<ListedChats>;
}

const account = z
  .string()
  .min(1)
  .max(ACCOUNT_ID_LENGTH)
  .describe('The account’s ID, from list_accounts.');
const chat = z
  .string()
  .min(1)
  .max(MAX_CHAT_NAME)
  .describe('A chat’s name, exactly as WhatsApp shows it and as list_chats gives it.');
const phone = z
  .string()
  .min(1)
  .max(MAX_PHONE)
  .describe(
    'Instead of chat: an international number from list_chats, such as +447700900123. ' +
      'It opens the chat wherever it is, but reloads WhatsApp, so it takes a few seconds.',
  );
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

/** What every token may see: where it may act. */
function listingTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_accounts',
    { description: 'The WhatsApp accounts this token may use.' },
    () => answer(ctx.accounts.list().filter((entry) => ctx.token.accounts.includes(entry.id))),
  );
  server.registerTool(
    'list_chats',
    {
      description:
        'The chats this token may open, write to or send to, each with its name, its ' +
        'international number, or both: pass the name as chat or the number as phone. ' +
        'With query, only the chats whose name or number has every word of it, such as ' +
        '"vasco" for "Vasco Guita"; several may match, so ask the user which one when it ' +
        'is not clear. "all" means any chat, for reading only.',
      inputSchema: z.object({ query: z.string().max(100).optional() }),
    },
    async (args) => answer(searchChats(await ctx.listed(), args.query)),
  );
}

function readingTools(server: McpServer, ctx: ToolContext): void {
  if (has(ctx, 'chat:read-unread-summary')) {
    server.registerTool(
      'list_unread',
      {
        description: 'Chats with unread messages: name, unread count and last-message preview.',
        inputSchema: z.object({ account }),
      },
      (args) =>
        forAccount(ctx, 'list_unread', args.account, async (page) => {
          const unread = await page.readUnread();
          return unread.filter((entry) => reaches(ctx.token, entry.name));
        }),
    );
  }
  if (has(ctx, 'chat:read-active')) {
    server.registerTool(
      'read_chat',
      {
        description: `The open chat's last messages; with chat or phone, it opens that chat first (needs chat:open).`,
        inputSchema: z.object({
          account,
          chat: chat.optional(),
          phone: phone.optional(),
          messages: z.number().int().min(1).max(MAX_MESSAGES).optional(),
        }),
      },
      (args) =>
        forAccount(ctx, 'read_chat', args.account, async (page) => {
          const opened = await openTarget(page, ctx.token, args);
          return allowedOpenChat(page, ctx.token, args.messages ?? DEFAULT_MESSAGES, opened);
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
          'Puts text in the message box without sending it; with chat or phone, it opens that chat first.',
        inputSchema: z.object({ account, text, chat: chat.optional(), phone: phone.optional() }),
      },
      (args) =>
        forAccount(ctx, 'write_draft', args.account, async (page) => {
          const opened = await openTarget(page, ctx.token, args);
          await allowedOpenChat(page, ctx.token, 1, opened);
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
 * Opens the chat a send goes to, which the agent must name, and returns its
 * name as WhatsApp shows it. Sending to a listed chat opens it, whether or
 * not the token may open chats otherwise.
 */
async function openToSend(ctx: ToolContext, page: AgentPage, target: ChatTarget) {
  const opened = await openTarget(page, { ...ctx.token, scopes: ['chat:open'] }, target);
  return opened ?? refuse('chat_missing');
}

/**
 * Sends `message` in the chat the agent names, by name or by number, which
 * must be on the token's list. It never touches what the user is typing: a
 * message box with anything in it is refused, not overwritten or sent (ADR
 * 0019).
 */
async function send(ctx: ToolContext, page: AgentPage, target: ChatTarget, message: string) {
  const name = await openToSend(ctx, page, target);
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
      description:
        'Sends a plain-text message to a chat this token lists, named by chat or by phone.',
      inputSchema: z.object({ account, text, chat: chat.optional(), phone: phone.optional() }),
    },
    (args) =>
      forAccount(ctx, 'send_message', args.account, (page) => send(ctx, page, args, args.text)),
  );
}

/** Registers the tools the calling token's scopes allow; the agent sees no other (ADR 0019). */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  listingTools(server, ctx);
  readingTools(server, ctx);
  draftTools(server, ctx);
  sendingTool(server, ctx);
}
