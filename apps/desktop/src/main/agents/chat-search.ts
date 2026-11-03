import type { ListedChat, ListedChats } from './tokens.ts';

/** Text as people search it: no accents, no case. */
const folded = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Whether a listed chat matches every word of `query`: in its name,
 * whatever the case and accents, or, for a word with digits, in its number.
 * So "vasco" finds "Vasco Guita", and "7700 900" finds "+447700900123".
 */
function matches(chat: ListedChat, words: readonly string[]): boolean {
  const name = folded(chat.name ?? '');
  const digits = chat.phone?.slice(1) ?? '';
  return words.every((word) => {
    const wordDigits = word.replaceAll(/\D/g, '');
    return name.includes(word) || (wordDigits !== '' && digits.includes(wordDigits));
  });
}

/**
 * The token's listed chats that match `query`, which may be several; all of
 * them without a query. A token that reaches every chat lists none.
 */
export function searchChats(listed: ListedChats, query: string | undefined): ListedChats {
  const words = folded(query ?? '')
    .split(/\s+/)
    .filter((word) => word !== '');
  if (listed === 'all' || words.length === 0) {
    return listed;
  }
  return { ...listed, chats: listed.chats.filter((chat) => matches(chat, words)) };
}
