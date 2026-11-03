import { describe, expect, it } from 'vitest';
import { searchChats } from './chat-search.ts';
import type { ListedChats } from './tokens.ts';

const LISTED: ListedChats = {
  chats: [
    { name: 'Vasco Guita', phone: '+447700900123' },
    { name: 'Vasco Silva', phone: null },
    { name: 'Ana Gonçalves', phone: '+447700900456' },
    { name: null, phone: '+447700900789' },
  ],
  unnamed: 2,
};

const names = (found: ListedChats) =>
  found === 'all' ? 'all' : found.chats.map((chat) => chat.name ?? chat.phone);

describe('searchChats', () => {
  it('finds every chat whose name has each word, whatever the case or accents', () => {
    expect(names(searchChats(LISTED, 'vasco'))).toEqual(['Vasco Guita', 'Vasco Silva']);
    expect(names(searchChats(LISTED, '  VASCO   guita '))).toEqual(['Vasco Guita']);
    expect(names(searchChats(LISTED, 'goncalves'))).toEqual(['Ana Gonçalves']);
    expect(names(searchChats(LISTED, 'Gonçalves'))).toEqual(['Ana Gonçalves']);
    expect(names(searchChats(LISTED, 'rui'))).toEqual([]);
  });

  it('finds a number by its digits, however they are written', () => {
    expect(names(searchChats(LISTED, '+44 7700 900789'))).toEqual(['+447700900789']);
    expect(names(searchChats(LISTED, '900456'))).toEqual(['Ana Gonçalves']);
    expect(names(searchChats(LISTED, 'ana 456'))).toEqual(['Ana Gonçalves']);
    expect(names(searchChats(LISTED, 'vasco 456'))).toEqual([]);
  });

  it('keeps how many chats it could not name', () => {
    expect(searchChats(LISTED, 'vasco')).toMatchObject({ unnamed: 2 });
  });

  it('gives every listed chat without a query, and none for a token that reaches all', () => {
    expect(searchChats(LISTED, undefined)).toBe(LISTED);
    expect(searchChats(LISTED, '   ')).toBe(LISTED);
    expect(searchChats('all', 'vasco')).toBe('all');
  });
});
