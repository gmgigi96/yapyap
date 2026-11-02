import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
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
      Type.Array(Type.String({ minLength: 1, maxLength: MAX_CHAT_NAME }), {
        minItems: 1,
        maxItems: MAX_TOKEN_CHATS,
        uniqueItems: true,
      }),
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
export type SpecProblem = 'invalid' | 'unknownAccount' | 'chatsNeeded' | 'sendingExpiry';

const sends = (spec: CheckedSpec): boolean => spec.scopes.includes('messages:send');

/**
 * A token that opens chats or sends must name its chats, so a hijacked
 * agent can reach only those (ADR 0019).
 */
const unlisted = (spec: CheckedSpec): boolean =>
  spec.chats === 'all' && spec.scopes.some((scope) => LISTED_CHAT_SCOPES.includes(scope));

/** The spec, checked whole; or why it cannot be a token. */
export function checkSpec(
  value: unknown,
  accounts: ReadonlySet<string>,
): AgentTokenSpec | SpecProblem {
  if (!Value.Check(SpecSchema, value) || value.name.trim() === '') {
    return 'invalid';
  }
  if (value.accounts.some((account) => !accounts.has(account))) {
    return 'unknownAccount';
  }
  if (unlisted(value)) {
    return 'chatsNeeded';
  }
  if (sends(value) && (value.expiresInDays ?? Infinity) > SENDING_TOKEN_DAYS) {
    return 'sendingExpiry';
  }
  return value;
}
