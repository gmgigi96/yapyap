import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { parseInternationalNumber } from '../../shared/phone-number.ts';
import {
  AGENT_SCOPES,
  AGENT_TOKEN_EXPIRIES,
  LISTED_CHAT_SCOPES,
  MAX_AGENT_LIMIT,
  MAX_TOKEN_CHATS,
  MAX_TOKEN_NAME,
  SENDING_TOKEN_DAYS,
  type AgentTokenSpec,
} from '../../shared/agents-api.ts';

/** As many accounts as `accounts.json` holds. */
const MAX_ACCOUNTS = 32;
/** The longest chat name WhatsApp shows in the chat list, as the adapter reads it. */
const MAX_CHAT_NAME = 256;
/** Longer than any number written with separators. */
const MAX_PHONE = 64;

const Limit = Type.Union([Type.Integer({ minimum: 1, maximum: MAX_AGENT_LIMIT }), Type.Null()]);

export const LimitsSchema = Type.Object(
  { callsPerMinute: Limit, sendsPerMinute: Limit, sendsPerDay: Limit },
  { additionalProperties: false },
);

export const ScopeSchema = Type.Enum(AGENT_SCOPES);

/** A spec as the settings page sends it; its rules between fields are {@link checkSpec}'s. */
const SpecSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: MAX_TOKEN_NAME }),
    scopes: Type.Array(ScopeSchema, { minItems: 1, uniqueItems: true }),
    accounts: Type.Array(Type.String({ maxLength: 36 }), {
      minItems: 1,
      maxItems: MAX_ACCOUNTS,
      uniqueItems: true,
    }),
    chats: Type.Union([
      Type.Literal('all'),
      Type.Array(
        Type.Object(
          {
            name: Type.Union([
              Type.String({ minLength: 1, maxLength: MAX_CHAT_NAME }),
              Type.Null(),
            ]),
            phone: Type.Union([Type.String({ minLength: 1, maxLength: MAX_PHONE }), Type.Null()]),
          },
          { additionalProperties: false },
        ),
        { maxItems: MAX_TOKEN_CHATS, uniqueItems: true },
      ),
    ]),
    limits: LimitsSchema,
    expiresInDays: Type.Union([
      Type.Enum(AGENT_TOKEN_EXPIRIES.filter((days) => days !== null)),
      Type.Null(),
    ]),
    notify: Type.Boolean(),
  },
  { additionalProperties: false },
);

type CheckedSpec = Static<typeof SpecSchema>;

/** Why YapYap refuses a token, as a key of the catalog's `agents.problems`. */
export type SpecProblem =
  'invalid' | 'noChats' | 'unknownAccount' | 'invalidPhone' | 'chatsNeeded' | 'sendingExpiry';

const sends = (spec: CheckedSpec): boolean => spec.scopes.includes('messages:send');

/** Whether a listed chat has nothing to find it by, or a number that is not one. */
const emptyEntry = (spec: CheckedSpec): boolean =>
  spec.chats !== 'all' &&
  spec.chats.some((entry) => (entry.name?.trim() ?? '') === '' && entry.phone === null);

const badPhone = (spec: CheckedSpec): boolean =>
  spec.chats !== 'all' &&
  spec.chats.some(
    (entry) => entry.phone !== null && parseInternationalNumber(entry.phone) === undefined,
  );

/**
 * A token that opens chats or sends must name its chats, so a hijacked
 * agent can reach only those (ADR 0019).
 */
const unlisted = (spec: CheckedSpec): boolean =>
  spec.chats === 'all' && spec.scopes.some((scope) => LISTED_CHAT_SCOPES.includes(scope));

/** A token that sends must not outlast the time a sending token may last. */
const lastsTooLong = (spec: CheckedSpec): boolean =>
  sends(spec) && (spec.expiresInDays ?? Infinity) > SENDING_TOKEN_DAYS;

/** What is wrong with a well-formed spec, checked in this order. */
const RULES: readonly (readonly [
  SpecProblem,
  (spec: CheckedSpec, accounts: ReadonlySet<string>) => boolean,
])[] = [
  ['invalid', (spec) => spec.name.trim() === '' || emptyEntry(spec)],
  ['noChats', (spec) => spec.chats !== 'all' && spec.chats.length === 0],
  ['unknownAccount', (spec, accounts) => spec.accounts.some((account) => !accounts.has(account))],
  ['invalidPhone', badPhone],
  ['chatsNeeded', unlisted],
  ['sendingExpiry', lastsTooLong],
];

/** The spec, checked whole; or why it cannot be a token. */
export function checkSpec(
  value: unknown,
  accounts: ReadonlySet<string>,
): AgentTokenSpec | SpecProblem {
  if (!Value.Check(SpecSchema, value)) {
    return 'invalid';
  }
  return RULES.find(([, broken]) => broken(value, accounts))?.[0] ?? value;
}
