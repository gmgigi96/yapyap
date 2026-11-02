import { chatOpener } from '../../adapter/open-chat.ts';
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

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * One account's WhatsApp as the agents' tools reach it: the adapter's
 * readers, and the message box as the assistant bar's Send uses it.
 */
export function agentPageOf(
  contents: ReplyContents & KeyContents,
  wait: (ms: number) => Promise<void> = pause,
): AgentPage {
  return {
    readOpenChat: (messages) => readOpenChat(contents, messages),
    readUnread: () => readUnreadChats(contents),
    readDraft: () => readDraft(contents),
    replaceDraft: (text) => replaceDraft(contents, text),
    pressEnter: () => pressEnter(contents),
    openChat: async (name) => {
      if ((await runInAdapterWorld(contents, chatOpener(name))) !== true) {
        return false;
      }
      await wait(OPEN_MS);
      return true;
    },
  };
}
