import type { JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import {
  AGENT_SCOPES,
  AGENT_TOKEN_EXPIRIES,
  DEFAULT_AGENT_LIMITS,
  LISTED_CHAT_SCOPES,
  MAX_AGENT_LIMIT,
  MAX_TOKEN_NAME,
  SENDING_TOKEN_DAYS,
  type AgentChatEntry,
  type AgentLimits,
  type AgentScope,
  type AgentsView,
  type AgentTokenExpiry,
  type AgentTokenSpec,
} from '../../shared/agents-api.ts';
import type { ChromeApi } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.agents;

/** A token just created, shown once. */
export interface Created {
  readonly token: string;
  readonly address: string | null;
}

const PRESETS: Readonly<Record<'read' | 'draft', readonly AgentScope[]>> = {
  read: ['chat:read-unread-summary', 'chat:read-active'],
  draft: [
    'chat:read-unread-summary',
    'chat:read-active',
    'composer:read-draft',
    'composer:insert-draft',
  ],
};

const SEND: AgentScope = 'messages:send';

const sends = (scopes: readonly AgentScope[]): boolean => scopes.includes(SEND);

const listsChats = (scopes: readonly AgentScope[]): boolean =>
  scopes.some((scope) => LISTED_CHAT_SCOPES.includes(scope));

interface FormProps {
  readonly api: ChromeApi;
  readonly accounts: AgentsView['accounts'];
  readonly onCreated: (created: Created) => void;
  readonly onCancel: () => void;
}

/** Changes some of the form's choices; the rest stay as they are. */
type Update = (change: Partial<AgentTokenSpec>) => void;

interface SpecProps {
  readonly spec: AgentTokenSpec;
  readonly onChange: Update;
}

function without<T>(list: readonly T[], item: T): T[] {
  return list.filter((entry) => entry !== item);
}

/** The list with `item` once, last, as a list of checkboxes keeps it. */
function withItem<T>(list: readonly T[], item: T): T[] {
  return [...without(list, item), item];
}

function Accounts(props: {
  readonly accounts: AgentsView['accounts'];
  readonly chosen: readonly string[];
  readonly onChange: Update;
}): JSX.Element {
  const { chosen, onChange } = props;
  return (
    <fieldset>
      <legend>{text.form.accounts}</legend>
      {props.accounts.map(({ id, name }) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={chosen.includes(id)}
            onChange={(event) => {
              const on = event.currentTarget.checked;
              onChange({ accounts: on ? withItem(chosen, id) : without(chosen, id) });
            }}
          />{' '}
          {name}
        </label>
      ))}
    </fieldset>
  );
}

function ScopeBox(props: {
  readonly scope: AgentScope;
  readonly chosen: readonly AgentScope[];
  readonly onChange: Update;
}): JSX.Element {
  const { scope, chosen, onChange } = props;
  return (
    <label>
      <input
        type="checkbox"
        checked={chosen.includes(scope)}
        onChange={(event) => {
          const on = event.currentTarget.checked;
          onChange({ scopes: on ? withItem(chosen, scope) : without(chosen, scope) });
        }}
      />{' '}
      {text.scopes[scope]}
    </label>
  );
}

function Scopes(props: {
  readonly chosen: readonly AgentScope[];
  readonly onChange: Update;
}): JSX.Element {
  return (
    <fieldset>
      <legend>{text.form.scopes}</legend>
      <div class="actions">
        {(['read', 'draft'] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              props.onChange({ scopes: [...PRESETS[preset]] });
            }}
          >
            {text.form.presets[preset]}
          </button>
        ))}
      </div>
      {AGENT_SCOPES.filter((scope) => scope !== SEND).map((scope) => (
        <ScopeBox key={scope} scope={scope} {...props} />
      ))}
      <div class="danger-box">
        <ScopeBox scope={SEND} {...props} />
        {sends(props.chosen) ? <p role="note">{text.form.sendWarning}</p> : null}
      </div>
    </fieldset>
  );
}

interface ListedProps {
  readonly listed: readonly AgentChatEntry[];
  readonly onChange: Update;
}

/** How a listed chat reads in a chip: its name and its number, as far as it has them. */
export const chatLabel = ({ name, phone }: AgentChatEntry): string =>
  [name, phone].filter((part) => part !== null).join(' · ');

function ChatChips({ listed, onChange }: ListedProps): JSX.Element {
  return (
    <ul class="chips">
      {listed.map((chat) => (
        <li key={chatLabel(chat)} class="chip">
          {chatLabel(chat)}{' '}
          <button
            type="button"
            aria-label={text.tokens.remove({ item: chatLabel(chat) })}
            onClick={() => {
              onChange({ chats: without(listed, chat) });
            }}
          >
            {text.tokens.removeMark}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Puts the name of the chat open in the token's first account in the name field. */
function UseOpenChat(props: {
  readonly api: ChromeApi;
  readonly account: string;
  readonly onName: (name: string) => void;
}): JSX.Element {
  const { api, account, onName } = props;
  const [status, setStatus] = useState('');
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void api.agents.openChat(account).then((open) => {
            setStatus(open === null ? text.form.noOpenChat : '');
            if (open !== null) {
              onName(open);
            }
          });
        }}
      >
        {text.form.addOpenChat}
      </button>
      <output>{status}</output>
    </>
  );
}

function ChatField(props: {
  readonly label: string;
  readonly value: string;
  readonly max: number;
  readonly onInput: (value: string) => void;
  readonly onEnter: () => void;
}): JSX.Element {
  return (
    <input
      type="text"
      aria-label={props.label}
      placeholder={props.label}
      value={props.value}
      maxLength={props.max}
      onInput={(event) => {
        props.onInput(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        // Enter would submit the whole form before the chat is in the list.
        if (event.key === 'Enter') {
          event.preventDefault();
          props.onEnter();
        }
      }}
    />
  );
}

/** Adds a chat by its name, its number, or both; the open chat can give the name. */
function AddChat(
  props: ListedProps & { readonly api: ChromeApi; readonly account: string | undefined },
): JSX.Element {
  const { api, account, listed, onChange } = props;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const empty = name.trim() === '' && phone.trim() === '';
  const add = useCallback((): void => {
    if (empty) {
      return;
    }
    const entry = { name: name.trim() || null, phone: phone.trim() || null };
    onChange({ chats: [...listed.filter((chat) => chatLabel(chat) !== chatLabel(entry)), entry] });
    setName('');
    setPhone('');
  }, [empty, name, phone, listed, onChange]);
  return (
    <div class="add-chat">
      <p class="hint">{text.form.chatHint}</p>
      <ChatField
        label={text.form.chatName}
        value={name}
        max={256}
        onInput={setName}
        onEnter={add}
      />{' '}
      <ChatField
        label={text.form.chatPhone}
        value={phone}
        max={64}
        onInput={setPhone}
        onEnter={add}
      />{' '}
      <button type="button" disabled={empty} onClick={add}>
        {text.form.addChat}
      </button>{' '}
      {account === undefined ? null : <UseOpenChat api={api} account={account} onName={setName} />}
    </div>
  );
}

function ChatsChoice(props: {
  readonly label: string;
  readonly value: AgentTokenSpec['chats'];
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: Update;
}): JSX.Element {
  return (
    <label>
      <input
        type="radio"
        name="chats"
        checked={props.checked}
        disabled={props.disabled}
        onChange={() => {
          props.onChange({ chats: props.value });
        }}
      />{' '}
      {props.label}
    </label>
  );
}

function Chats(props: {
  readonly api: ChromeApi;
  readonly account: string | undefined;
  readonly chats: AgentTokenSpec['chats'];
  readonly listOnly: boolean;
  readonly onChange: Update;
}): JSX.Element {
  const { chats, listOnly, onChange } = props;
  const listed = chats === 'all' ? [] : chats;
  return (
    <fieldset>
      <legend>{text.form.chats}</legend>
      <ChatsChoice
        label={text.form.allChats}
        value="all"
        checked={chats === 'all'}
        disabled={listOnly}
        onChange={onChange}
      />
      <ChatsChoice
        label={text.form.listedChats}
        value={listed}
        checked={chats !== 'all'}
        onChange={onChange}
      />
      {chats === 'all' ? null : (
        <>
          <ChatChips listed={listed} onChange={onChange} />
          <AddChat {...props} listed={listed} />
        </>
      )}
    </fieldset>
  );
}

function LimitField(props: {
  readonly label: string;
  readonly limit: keyof AgentLimits;
  readonly limits: AgentLimits;
  readonly onChange: Update;
}): JSX.Element {
  const { label, limit, limits, onChange } = props;
  const value = limits[limit];
  const set = (next: number | null): void => {
    onChange({ limits: { ...limits, [limit]: next } });
  };
  return (
    <div class="limit">
      <label>
        {label}{' '}
        <input
          type="number"
          min={1}
          max={MAX_AGENT_LIMIT}
          value={value ?? ''}
          disabled={value === null}
          onInput={(event) => {
            const next = Math.round(Number(event.currentTarget.value));
            set(Number.isFinite(next) && next >= 1 ? Math.min(next, MAX_AGENT_LIMIT) : 1);
          }}
        />
      </label>{' '}
      <label>
        <input
          type="checkbox"
          checked={value === null}
          onChange={(event) => {
            set(event.currentTarget.checked ? null : DEFAULT_AGENT_LIMITS[limit]);
          }}
        />{' '}
        {text.form.unlimited}
      </label>
    </div>
  );
}

function Notify({ spec, onChange }: SpecProps): JSX.Element {
  return (
    <label>
      <input
        type="checkbox"
        checked={spec.notify}
        onChange={(event) => {
          onChange({ notify: event.currentTarget.checked });
        }}
      />{' '}
      {text.form.notify}
    </label>
  );
}

function Limits(props: SpecProps): JSX.Element {
  const { spec, onChange } = props;
  const { limits } = spec;
  const sending = sends(spec.scopes);
  const field = (limit: keyof AgentLimits, label: string): JSX.Element => (
    <LimitField label={label} limit={limit} limits={limits} onChange={onChange} />
  );
  const unlimitedSending =
    sending && (limits.sendsPerMinute === null || limits.sendsPerDay === null);
  return (
    <fieldset>
      <legend>{text.form.limits}</legend>
      {field('callsPerMinute', text.form.callsPerMinute)}
      {sending ? field('sendsPerMinute', text.form.sendsPerMinute) : null}
      {sending ? field('sendsPerDay', text.form.sendsPerDay) : null}
      {unlimitedSending ? <p role="note">{text.form.unlimitedSending}</p> : null}
      {sending ? <Notify {...props} /> : null}
    </fieldset>
  );
}

const expiryKey = (days: AgentTokenExpiry): keyof typeof text.form.expiryOptions =>
  days === null ? 'never' : (String(days) as `${typeof days}`);

/** Whether a token expires within the time a sending token may last. */
const soon = (days: AgentTokenExpiry): boolean => days !== null && days <= SENDING_TOKEN_DAYS;

function Expiry({ spec, onChange }: SpecProps): JSX.Element {
  const value = spec.expiresInDays;
  const allowed = AGENT_TOKEN_EXPIRIES.filter((days) => !sends(spec.scopes) || soon(days));
  return (
    <label>
      {text.form.expiry}{' '}
      <select
        value={expiryKey(value)}
        onChange={(event) => {
          const chosen = allowed.find((days) => expiryKey(days) === event.currentTarget.value);
          // `find` gives null for Never, and undefined only for a value the list does not offer.
          onChange({ expiresInDays: chosen === undefined ? value : chosen });
        }}
      >
        {allowed.map((days) => (
          <option key={expiryKey(days)} value={expiryKey(days)}>
            {text.form.expiryOptions[expiryKey(days)]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The form's choices, kept consistent: a token that opens or sends lists chats; one that sends expires soon. */
function useSpec(accounts: AgentsView['accounts']): readonly [AgentTokenSpec, Update] {
  const [spec, setSpec] = useState<AgentTokenSpec>({
    name: '',
    scopes: [...PRESETS.read],
    accounts: accounts.slice(0, 1).map((account) => account.id),
    chats: 'all',
    limits: DEFAULT_AGENT_LIMITS,
    expiresInDays: SENDING_TOKEN_DAYS,
    notify: true,
  });
  const update = useCallback<Update>((change) => {
    setSpec((current) => {
      const next = { ...current, ...change };
      return {
        ...next,
        chats: listsChats(next.scopes) && next.chats === 'all' ? [] : next.chats,
        expiresInDays:
          sends(next.scopes) && !soon(next.expiresInDays) ? SENDING_TOKEN_DAYS : next.expiresInDays,
      };
    });
  }, []);
  return [spec, update];
}

function NameField({ spec, onChange }: SpecProps): JSX.Element {
  return (
    <label>
      {text.form.name}{' '}
      <input
        type="text"
        required
        maxLength={MAX_TOKEN_NAME}
        placeholder={text.form.namePlaceholder}
        value={spec.name}
        onInput={(event) => {
          onChange({ name: event.currentTarget.value });
        }}
      />
    </label>
  );
}

/** Where the token may act and what it may do there. */
function Reach(
  props: SpecProps & { readonly api: ChromeApi; readonly accounts: AgentsView['accounts'] },
): JSX.Element {
  const { spec, onChange } = props;
  return (
    <>
      <Accounts accounts={props.accounts} chosen={spec.accounts} onChange={onChange} />
      <Scopes chosen={spec.scopes} onChange={onChange} />
      <Chats
        api={props.api}
        account={spec.accounts[0]}
        chats={spec.chats}
        listOnly={listsChats(spec.scopes)}
        onChange={onChange}
      />
    </>
  );
}

/** Creating a token: what it may do, where, for how long, and how fast (ADR 0019). */
export function AgentTokenForm({ api, accounts, onCreated, onCancel }: FormProps): JSX.Element {
  const [spec, update] = useSpec(accounts);
  const [problem, setProblem] = useState('');
  const create = (): void => {
    void api.agents.create(spec).then((result) => {
      if ('problem' in result) {
        setProblem(result.problem);
        return;
      }
      onCreated(result);
    });
  };
  return (
    <form
      class="token-form"
      aria-labelledby="token-form-title"
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <h4 id="token-form-title">{text.form.title}</h4>
      <NameField spec={spec} onChange={update} />
      <Reach api={api} accounts={accounts} spec={spec} onChange={update} />
      <Limits spec={spec} onChange={update} />
      <Expiry spec={spec} onChange={update} />
      <p role="alert">{problem}</p>
      <div class="actions">
        <button type="submit">{text.form.create}</button>
        <button type="button" onClick={onCancel}>
          {text.form.cancel}
        </button>
      </div>
    </form>
  );
}

/** A new token, shown once, with what to paste into an agent. */
export function CreatedToken(props: {
  readonly api: ChromeApi;
  readonly created: Created;
  readonly onDone: () => void;
}): JSX.Element {
  const { api, created, onDone } = props;
  const address = created.address ?? 'http://127.0.0.1:<port>/mcp';
  const header = `Authorization: Bearer ${created.token}`;
  const command = `claude mcp add --transport http yapyap ${address} --header "${header}"`;
  const copyable = (value: string): JSX.Element => (
    <p class="copyable">
      <code>{value}</code>{' '}
      <button type="button" onClick={() => void api.agents.copy(value)}>
        {text.copy}
      </button>
    </p>
  );
  return (
    <section class="notice" aria-labelledby="created-title">
      <h4 id="created-title">{text.created.title}</h4>
      <p>{text.created.once}</p>
      {copyable(created.token)}
      <p>{text.created.claudeCode}</p>
      {copyable(command)}
      <p>{text.created.other}</p>
      {copyable(header)}
      <button type="button" onClick={onDone}>
        {text.created.done}
      </button>
    </section>
  );
}
