import {
  FOCUS_COMPOSER,
  parseDraft,
  READ_COMPOSER,
  SELECT_COMPOSER,
} from '../../adapter/composer.ts';
import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';

export interface ReplyContents extends AdapterPage {
  /** Typed into the focused element as the user's own input. */
  insertText(text: string): Promise<void>;
  /** Gives the page keyboard focus within its window. */
  focus(): void;
}

export interface ReplyDependencies {
  readonly wait: (ms: number) => Promise<void>;
  readonly warn: (message: string) => void;
}

/** WhatsApp opens the chat after the click; this gives it time, then a little more. */
const STEP_MS = 400;
const ATTEMPTS = 8;

/** The platforms whose notifications take an inline reply. */
export function supportsInlineReply(platform: string): boolean {
  return platform === 'darwin' || platform === 'win32';
}

async function focused(contents: ReplyContents, code = FOCUS_COMPOSER): Promise<boolean> {
  // Typing goes to the page that has the keyboard, so WhatsApp's view takes
  // it first: a YapYap window, such as Settings, may still hold it (#376).
  contents.focus();
  const result = await runInAdapterWorld(contents, code).catch(() => false);
  return result === true;
}

/** Types `text` into the message box once `code` has focused it; false when no chat is open. */
async function typeInComposer(
  contents: ReplyContents,
  text: string,
  code = FOCUS_COMPOSER,
): Promise<boolean> {
  if (!(await focused(contents, code))) {
    return false;
  }
  await contents.insertText(text);
  return true;
}

/** What pressing a key in WhatsApp's page needs: Electron's input events. */
export interface KeyContents {
  sendInputEvent(event: { type: 'keyDown' | 'char' | 'keyUp'; keyCode: string }): void;
}

/**
 * Presses Enter in the open chat's message box, which sends what is in it,
 * as the user's own key press would. Only the assistant bar's Send button
 * calls it, once per click (ADR 0013); false when no chat is open.
 */
export async function pressEnter(contents: ReplyContents & KeyContents): Promise<boolean> {
  if (!(await focused(contents))) {
    return false;
  }
  for (const type of ['keyDown', 'char', 'keyUp'] as const) {
    contents.sendInputEvent({ type, keyCode: type === 'char' ? '\r' : 'Enter' });
  }
  return true;
}

/**
 * Puts the assistant's draft into the open chat's message box, as if typed,
 * for the user to edit and send. False when no chat is open to take it. The
 * text is message content, so it is never logged.
 */
export function insertDraft(contents: ReplyContents, text: string): Promise<boolean> {
  return typeInComposer(contents, text);
}

/**
 * Replaces what the user typed in the open chat's message box with `text`,
 * as if they typed it over a selection of all of it, for them to edit and
 * send. False when no chat is open. The text is never logged.
 */
export function replaceDraft(contents: ReplyContents, text: string): Promise<boolean> {
  return typeInComposer(contents, text, SELECT_COMPOSER);
}

/**
 * What the user typed in the open chat's message box, for the assistant to
 * rewrite; null when no chat is open. It is message content, so it is never
 * logged.
 */
export async function readDraft(contents: ReplyContents): Promise<string | null> {
  const found = await runInAdapterWorld(contents, READ_COMPOSER);
  const draft = parseDraft(found);
  if (draft === undefined) {
    throw new Error('The draft could not be read.');
  }
  return draft;
}

/**
 * Puts a reply typed in a notification into WhatsApp's own message box, as
 * a draft, once WhatsApp has opened the chat. YapYap never sends it: the
 * user sees which chat it is in and sends it themselves (ADR 0008, C22).
 * The text is message content, so it is never logged.
 */
export async function draftReply(
  contents: ReplyContents,
  text: string,
  deps: ReplyDependencies,
  attempt = 1,
): Promise<void> {
  await deps.wait(STEP_MS);
  if (await typeInComposer(contents, text)) {
    return;
  }
  if (attempt >= ATTEMPTS) {
    deps.warn('Could not put a notification reply in WhatsApp’s message box.');
    return;
  }
  await draftReply(contents, text, deps, attempt + 1);
}
