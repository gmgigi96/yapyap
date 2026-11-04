import type { ReadChat } from '../../adapter/active-chat.ts';
import type { CompletionRequest } from './providers/provider.ts';
import { cleanRewrite } from './rewrites.ts';

/** How many replies the assistant offers to choose from. */
const SUGGESTIONS = 3;

export const INSTRUCTIONS = [
  'You help someone reply in a WhatsApp chat.',
  `Suggest ${String(SUGGESTIONS)} short, different replies they could send next,`,
  'in the language and tone of the chat.',
  'Write one reply per line, with no numbering, quotes or other text.',
].join(' ');

/** What the model is asked when the user says, in the assistant bar, what to write (ADR 0013). */
export const COMPOSE_INSTRUCTIONS = [
  'You help someone write a message in a WhatsApp chat.',
  'After the chat comes what they want to say.',
  'Write that one message, in the language and tone of the chat, ready to send as it is.',
  'Answer with the message only, with no quotes or other text.',
].join(' ');

/** What the model is asked for a summary of the chat (#106), shown before it is sent. */
export const SUMMARY_INSTRUCTIONS = [
  'Summarize this WhatsApp chat for the person reading it, in a few short bullet points:',
  'what was said, and anything they are asked to answer or do.',
  'Write in the language of the chat, and add nothing that is not in it.',
].join(' ');

/**
 * The chat as the model reads it: the last `context` messages, each marked
 * as the user's or the other side's. This text, with the instructions, is
 * exactly what the bar shows when asked what is sent (#107).
 */
export function transcriptOf(chat: ReadChat, context: number): string {
  const lines = chat.messages
    .slice(-context)
    .map(({ outgoing, text }) => `${outgoing ? 'Me' : 'Them'}: ${text}`);
  return [`Chat: ${chat.name}`, ...lines].join('\n');
}

/** The request for exactly what the bar shows: the instructions, and the text as the user's turn. */
export function requestFor(
  instructions: string,
  text: string,
  signal?: AbortSignal,
): CompletionRequest {
  return {
    instructions,
    turns: [{ role: 'user', text }],
    ...(signal === undefined ? {} : { signal }),
  };
}

/** Numbering or a bullet a model may put before a reply despite being asked not to. */
const MARKER = /^(?:\d{1,2}[.)]|[-*•])\s*/;
/**
 * The transcript's own label, which small models such as the private one
 * (#457) repeat before a reply as if it were part of it.
 */
const SPEAKER = /^Me:\s*/i;

const clean = (line: string): string =>
  cleanRewrite(line.trim().replace(MARKER, '').replace(SPEAKER, ''));

/** The replies in the model's answer, at most {@link SUGGESTIONS}. */
export function suggestionsIn(answer: string): string[] {
  return answer
    .split('\n')
    .map(clean)
    .filter((line) => line !== '')
    .slice(0, SUGGESTIONS);
}
