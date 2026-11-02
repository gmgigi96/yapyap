import type { ReadChat } from '../../adapter/active-chat.ts';
import type { UnreadSummaryChat } from '../../adapter/unread-summary.ts';
import { reaches, type AgentToken } from './tokens.ts';

/** One account's WhatsApp, as the tools reach it through the adapter. */
export interface AgentPage {
  readonly readOpenChat: (messages: number) => Promise<ReadChat | null>;
  readonly readUnread: () => Promise<readonly UnreadSummaryChat[]>;
  readonly readDraft: () => Promise<string | null>;
  readonly replaceDraft: (text: string) => Promise<boolean>;
  readonly pressEnter: () => Promise<boolean>;
  /** Opens the chat named `name` from the chat list; false when it is not there. */
  readonly openChat: (name: string) => Promise<boolean>;
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

/** The open chat with its last `messages` messages, refused unless the token may reach it. */
export async function allowedOpenChat(
  page: AgentPage,
  token: Pick<AgentToken, 'chats'>,
  messages: number,
): Promise<ReadChat> {
  const chat = (await page.readOpenChat(messages)) ?? refuse('no_chat_open');
  return reaches(token, chat.name) ? chat : refuse('chat_not_allowed');
}

/**
 * Opens `chat` when the agent names one, which needs `chat:open` and a
 * chat on the token's list, then checks the open chat is the one named.
 */
export async function openNamed(
  page: AgentPage,
  token: Pick<AgentToken, 'chats' | 'scopes'>,
  chat: string | undefined,
): Promise<void> {
  if (chat === undefined) {
    return;
  }
  if (!token.scopes.includes('chat:open')) {
    refuse('scope_missing');
  }
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
