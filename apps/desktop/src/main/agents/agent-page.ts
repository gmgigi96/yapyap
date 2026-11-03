import { CHAT_LIST_TO_TOP, chatOpenerStep, parseOpenStep } from '../../adapter/open-chat.ts';
import { runInAdapterWorld } from '../../adapter/world.ts';
import { pause } from '../pause.ts';
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
/** How often, and how many times, YapYap looks for the chat a number's link opens. */
const LINK_STEP_MS = 500;
const LINK_STEPS = 40;

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

/** The page as opening a number needs it: WhatsApp's own `/send?phone=` link. */
interface LinkContents extends ReplyContents {
  loadURL(url: string): Promise<unknown>;
}

/** The chat open once the page has loaded, looked for a while; null if none opens. */
async function openedChat(contents: ReplyContents, wait: Wait, step = 1): Promise<string | null> {
  const chat = await readOpenChat(contents, 1).catch(() => null);
  if (chat !== null || step >= LINK_STEPS) {
    return chat?.name ?? null;
  }
  await wait(LINK_STEP_MS);
  return openedChat(contents, wait, step + 1);
}

/**
 * Opens the chat of a number with WhatsApp's own link, as New Chat does:
 * it reloads WhatsApp, which then opens the chat, wherever it is in the
 * list, or says the number is not on WhatsApp, and no chat opens.
 */
async function openByLink(
  contents: LinkContents,
  origin: string,
  digits: string,
  wait: Wait,
): Promise<string | null> {
  const link = new URL('/send', origin);
  link.searchParams.set('phone', digits);
  // A failed load is reported by the recovery monitor; no chat then opens.
  await contents.loadURL(link.href).catch(() => undefined);
  return openedChat(contents, wait);
}

/**
 * One account's WhatsApp as the agents' tools reach it: the adapter's
 * readers, the message box as the assistant bar's Send uses it, and
 * WhatsApp's own link to a number, as New Chat uses it.
 */
export function agentPageOf(
  contents: LinkContents & KeyContents,
  origin: string,
  wait: Wait = pause,
): AgentPage {
  return {
    readOpenChat: (messages) => readOpenChat(contents, messages),
    readUnread: () => readUnreadChats(contents),
    readDraft: () => readDraft(contents),
    replaceDraft: (text) => replaceDraft(contents, text),
    pressEnter: () => pressEnter(contents),
    openChat: (name) => openFromList(contents, name, wait),
    openPhone: (digits) => openByLink(contents, origin, digits, wait),
  };
}
