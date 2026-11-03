import { CHAT_LIST_TO_TOP, chatOpenerStep, parseOpenStep } from '../../adapter/open-chat.ts';
import { runInAdapterWorld } from '../../adapter/world.ts';
import { readOpenChat, readUnreadChats } from '../assistant/chat-reading.ts';
import {
  pressEnter,
  readDraft,
  replaceDraft,
  type KeyContents,
  type ReplyContents,
} from '../notifications/reply.ts';
import type { AgentPage } from './tool-steps.ts';

/** How long WhatsApp takes to show a chat after its row is pressed. */
const OPEN_MS = 300;
/** How long WhatsApp takes to render the rows a scroll of its chat list brings in. */
const LOAD_MS = 150;
/** The most screens of the chat list YapYap looks through for one chat. */
const MAX_SCREENS = 60;

type Wait = (ms: number) => Promise<void>;

/**
 * Looks for the chat a screen at a time, loading the next rows of WhatsApp's
 * virtualized chat list until the chat is there or the list ends.
 */
async function lookFor(
  contents: ReplyContents,
  name: string,
  wait: Wait,
  screen = 1,
): Promise<boolean> {
  const step = parseOpenStep(await runInAdapterWorld(contents, chatOpenerStep(name)));
  if (step === 'opened') {
    return true;
  }
  if (step === 'end' || screen >= MAX_SCREENS) {
    return false;
  }
  await wait(LOAD_MS);
  return lookFor(contents, name, wait, screen + 1);
}

/**
 * Opens the chat from the top of the chat list, loading more of it as
 * needed, and leaves the list at its top again, where people expect it.
 */
async function openFromList(contents: ReplyContents, name: string, wait: Wait): Promise<boolean> {
  await runInAdapterWorld(contents, CHAT_LIST_TO_TOP);
  await wait(LOAD_MS);
  const opened = await lookFor(contents, name, wait);
  await runInAdapterWorld(contents, CHAT_LIST_TO_TOP);
  if (opened) {
    await wait(OPEN_MS);
  }
  return opened;
}

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * One account's WhatsApp as the agents' tools reach it: the adapter's
 * readers, and the message box as the assistant bar's Send uses it.
 */
export function agentPageOf(contents: ReplyContents & KeyContents, wait: Wait = pause): AgentPage {
  return {
    readOpenChat: (messages) => readOpenChat(contents, messages),
    readUnread: () => readUnreadChats(contents),
    readDraft: () => readDraft(contents),
    replaceDraft: (text) => replaceDraft(contents, text),
    pressEnter: () => pressEnter(contents),
    openChat: (name) => openFromList(contents, name, wait),
  };
}
