import type { ReadChat } from '../../adapter/active-chat.ts';
import type { UnreadSummaryChat } from '../../adapter/unread-summary.ts';
import { parseInternationalNumber } from '../../shared/phone-number.ts';
import { reaches, reachesPhone, type AgentToken } from './tokens.ts';

/** One account's WhatsApp, as the tools reach it through the adapter. */
export interface AgentPage {
  readonly readOpenChat: (messages: number) => Promise<ReadChat | null>;
  readonly readUnread: () => Promise<readonly UnreadSummaryChat[]>;
  readonly readDraft: () => Promise<string | null>;
  readonly replaceDraft: (text: string) => Promise<boolean>;
  readonly pressEnter: () => Promise<boolean>;
  /** Opens the chat named `name` from the chat list; false when it is not there. */
  readonly openChat: (name: string) => Promise<boolean>;
  /** Opens the chat of the number with these digits; its name, or null when none opens. */
  readonly openPhone: (digits: string) => Promise<string | null>;
}

/** The accounts as the tools reach them. */
export interface AgentAccounts {
  readonly list: () => readonly { readonly id: string; readonly name: string }[];
  /** The account's page while it runs, else undefined. */
  readonly page: (id: string) => AgentPage | undefined;
}

/**
 * Why a tool refused, as the agent reads it. Each names the rule, never
 * the data: a chat outside the token's list and one that does not exist
 * are both `chat_not_allowed`, so a token cannot probe which chats exist.
 */
export type ToolFailure =
  | 'account_not_allowed'
  | 'chat_not_allowed'
  | 'chat_not_found'
  | 'no_chat_open'
  | 'chat_missing'
  | 'ambiguous_chat'
  | 'invalid_phone'
  | 'scope_missing'
  | 'composer_busy'
  | 'rate_limited'
  | 'whatsapp_not_ready';

/** A tool's refusal, carried up to the server, which answers it as a tool error. */
export class ToolRefusal extends Error {
  readonly failure: ToolFailure;

  constructor(failure: ToolFailure) {
    super(failure);
    this.failure = failure;
  }
}

export const refuse = (failure: ToolFailure): never => {
  throw new ToolRefusal(failure);
};

/** Which chat the agent asks for: by its name, or by an international number. */
export interface ChatTarget {
  readonly chat?: string | undefined;
  readonly phone?: string | undefined;
}

/**
 * The open chat with its last `messages` messages, refused unless the token
 * may reach it: it is on the token's list, or it is `opened`, the chat this
 * call just opened through a number on the list.
 */
export async function allowedOpenChat(
  page: AgentPage,
  token: Pick<AgentToken, 'chats'>,
  messages: number,
  opened?: string,
): Promise<ReadChat> {
  const chat = (await page.readOpenChat(messages)) ?? refuse('no_chat_open');
  return chat.name === opened || reaches(token, chat.name) ? chat : refuse('chat_not_allowed');
}

/** Opens the chat named `chat` from the list, and checks the open chat is that one. */
async function openByName(page: AgentPage, token: Pick<AgentToken, 'chats'>, chat: string) {
  if (!reaches(token, chat)) {
    refuse('chat_not_allowed');
  }
  if (!(await page.openChat(chat))) {
    refuse('chat_not_found');
  }
  const open = await page.readOpenChat(1);
  if (open?.name !== chat) {
    refuse('chat_not_found');
  }
}

/**
 * Opens the chat of an international number on the token's list, with
 * WhatsApp's own link; returns the name WhatsApp shows for it, which the
 * rest of the call may reach.
 */
async function openByPhone(
  page: AgentPage,
  token: Pick<AgentToken, 'chats'>,
  phone: string,
): Promise<string> {
  const digits = parseInternationalNumber(phone) ?? refuse('invalid_phone');
  if (!reachesPhone(token, digits)) {
    refuse('chat_not_allowed');
  }
  return (await page.openPhone(digits)) ?? refuse('chat_not_found');
}

/**
 * Opens the chat the agent names, by name or by number, which needs
 * `chat:open` and a chat on the token's list. Returns the opened chat's
 * name as WhatsApp shows it, which the rest of the call may reach; nothing
 * when the agent named no chat.
 */
export async function openTarget(
  page: AgentPage,
  token: Pick<AgentToken, 'chats' | 'scopes'>,
  { chat, phone }: ChatTarget,
): Promise<string | undefined> {
  if (chat !== undefined && phone !== undefined) {
    refuse('ambiguous_chat');
  }
  const named = phone ?? chat;
  if (named === undefined) {
    return undefined;
  }
  if (!token.scopes.includes('chat:open')) {
    refuse('scope_missing');
  }
  if (phone !== undefined) {
    return openByPhone(page, token, phone);
  }
  await openByName(page, token, named);
  return named;
}

/**
 * Runs each account's calls one at a time, in order, so two agents never
 * type into the same message box at once.
 */
export function accountQueue(): <T>(account: string, run: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>();
  return (account, run) => {
    // Each tail has its failure caught below, so the next call always runs.
    const next = (tails.get(account) ?? Promise.resolve()).then(run);
    tails.set(
      account,
      next.catch(() => undefined),
    );
    return next;
  };
}
