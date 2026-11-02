import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  AGENT_SCOPES,
  AGENT_TOKEN_EXPIRIES,
  DEFAULT_AGENT_LIMITS,
  LISTED_CHAT_SCOPES,
  MAX_AGENT_LIMIT,
  MAX_TOKEN_NAME,
  SENDING_TOKEN_DAYS,
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

interface FormProps {
  readonly api: ChromeApi;
  readonly accounts: AgentsView['accounts'];
  readonly onCreated: (created: Created) => void;
  readonly onCancel: () => void;
}

type Setter<T> = (value: T) => void;

/** A set toggled one item at a time, as a list of checkboxes keeps it. */
function toggled<T>(list: readonly T[], item: T, on: boolean): T[] {
  return on
    ? [...list.filter((entry) => entry !== item), item]
    : list.filter((entry) => entry !== item);
}

function Accounts(props: {
  readonly accounts: AgentsView['accounts'];
  readonly chosen: readonly string[];
  readonly onChange: Setter<string[]>;
}): JSX.Element {
  return (
    <fieldset>
      <legend>{text.form.accounts}</legend>
      {props.accounts.map((account) => (
        <label key={account.id}>
          <input
            type="checkbox"
            checked={props.chosen.includes(account.id)}
            onChange={(event) => {
              props.onChange(toggled(props.chosen, account.id, event.currentTarget.checked));
            }}
          />{' '}
          {account.name}
        </label>
      ))}
    </fieldset>
  );
}

function ScopeBox(props: {
  readonly scope: AgentScope;
  readonly chosen: readonly AgentScope[];
  readonly onChange: Setter<AgentScope[]>;
}): JSX.Element {
  const { scope, chosen, onChange } = props;
  return (
    <label>
      <input
        type="checkbox"
        checked={chosen.includes(scope)}
        onChange={(event) => {
          onChange(toggled(chosen, scope, event.currentTarget.checked));
        }}
      />{' '}
      {text.scopes[scope]}
    </label>
  );
}

function Presets({ onChange }: { readonly onChange: Setter<AgentScope[]> }): JSX.Element {
  return (
    <div class="actions">
      <button
        type="button"
        onClick={() => {
          onChange([...PRESETS.read]);
        }}
      >
        {text.form.presets.read}
      </button>
      <button
        type="button"
        onClick={() => {
          onChange([...PRESETS.draft]);
        }}
      >
        {text.form.presets.draft}
      </button>
    </div>
  );
}

function Scopes(props: {
  readonly chosen: readonly AgentScope[];
  readonly onChange: Setter<AgentScope[]>;
}): JSX.Element {
  return (
    <fieldset>
      <legend>{text.form.scopes}</legend>
      <Presets onChange={props.onChange} />
      {AGENT_SCOPES.filter((scope) => scope !== 'messages:send').map((scope) => (
        <ScopeBox key={scope} scope={scope} {...props} />
      ))}
      <div class="danger-box">
        <ScopeBox scope="messages:send" {...props} />
        {props.chosen.includes('messages:send') ? <p role="note">{text.form.sendWarning}</p> : null}
      </div>
    </fieldset>
  );
}

interface ListedProps {
  readonly listed: readonly string[];
  readonly onChange: Setter<readonly string[]>;
}

function ChatChips({ listed, onChange }: ListedProps): JSX.Element {
  return (
    <ul class="chips">
      {listed.map((chat) => (
        <li key={chat} class="chip">
          {chat}{' '}
          <button
            type="button"
            aria-label={text.tokens.remove({ item: chat })}
            onClick={() => {
              onChange(toggled(listed, chat, false));
            }}
          >
            {text.tokens.removeMark}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Adds the chat open in the token's first account. */
function AddOpenChat(props: {
  readonly api: ChromeApi;
  readonly account: string;
  readonly add: (chat: string) => void;
}): JSX.Element {
  const { api, account, add } = props;
  const [status, setStatus] = useState('');
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void api.agents.openChat(account).then((open) => {
            setStatus(open === null ? text.form.noOpenChat : '');
            if (open !== null) {
              add(open);
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

/** Adds a chat by its name, or the chat open in the token's first account. */
function AddChat(
  props: ListedProps & { readonly api: ChromeApi; readonly account: string | undefined },
): JSX.Element {
  const { api, account, listed, onChange } = props;
  const [name, setName] = useState('');
  const add = (chat: string): void => {
    onChange(toggled(listed, chat.trim(), true));
    setName('');
  };
  return (
    <div class="add-chat">
      <input
        type="text"
        aria-label={text.form.chatName}
        placeholder={text.form.chatName}
        value={name}
        maxLength={256}
        onInput={(event) => {
          setName(event.currentTarget.value);
        }}
      />{' '}
      <button
        type="button"
        disabled={name.trim() === ''}
        onClick={() => {
          add(name);
        }}
      >
        {text.form.addChat}
      </button>{' '}
      {account === undefined ? null : <AddOpenChat api={api} account={account} add={add} />}
    </div>
  );
}

function ChatsChoice(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChoose: () => void;
}): JSX.Element {
  return (
    <label>
      <input
        type="radio"
        name="chats"
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChoose}
      />{' '}
      {props.label}
    </label>
  );
}

function Chats(props: {
  readonly api: ChromeApi;
  readonly account: string | undefined;
  readonly chats: readonly string[] | 'all';
  readonly listOnly: boolean;
  readonly onChange: Setter<readonly string[] | 'all'>;
}): JSX.Element {
  const { chats, listOnly, onChange } = props;
  const listed = chats === 'all' ? [] : chats;
  return (
    <fieldset>
      <legend>{text.form.chats}</legend>
      <ChatsChoice
        label={text.form.allChats}
        checked={chats === 'all'}
        disabled={listOnly}
        onChoose={() => {
          onChange('all');
        }}
      />
      <ChatsChoice
        label={text.form.listedChats}
        checked={chats !== 'all'}
        onChoose={() => {
          onChange(listed);
        }}
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
  readonly value: number | null;
  readonly fallback: number;
  readonly onChange: Setter<number | null>;
}): JSX.Element {
  const { label, value, fallback, onChange } = props;
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
            onChange(Number.isFinite(next) && next >= 1 ? Math.min(next, MAX_AGENT_LIMIT) : 1);
          }}
        />
      </label>{' '}
      <label>
        <input
          type="checkbox"
          checked={value === null}
          onChange={(event) => {
            onChange(event.currentTarget.checked ? null : fallback);
          }}
        />{' '}
        {text.form.unlimited}
      </label>
    </div>
  );
}

function Limits(props: {
  readonly limits: AgentLimits;
  readonly sends: boolean;
  readonly notify: boolean;
  readonly onChange: Setter<AgentLimits>;
  readonly onNotify: Setter<boolean>;
}): JSX.Element {
  const { limits, sends, onChange } = props;
  const field = (key: keyof AgentLimits, label: string): JSX.Element => (
    <LimitField
      label={label}
      value={limits[key]}
      fallback={DEFAULT_AGENT_LIMITS[key]}
      onChange={(value) => {
        onChange({ ...limits, [key]: value });
      }}
    />
  );
  const unlimitedSending = sends && (limits.sendsPerMinute === null || limits.sendsPerDay === null);
  return (
    <fieldset>
      <legend>{text.form.limits}</legend>
      {field('callsPerMinute', text.form.callsPerMinute)}
      {sends ? field('sendsPerMinute', text.form.sendsPerMinute) : null}
      {sends ? field('sendsPerDay', text.form.sendsPerDay) : null}
      {unlimitedSending ? <p role="note">{text.form.unlimitedSending}</p> : null}
      {sends ? <Notify notify={props.notify} onNotify={props.onNotify} /> : null}
    </fieldset>
  );
}

function Notify(props: { readonly notify: boolean; readonly onNotify: Setter<boolean> }) {
  return (
    <label>
      <input
        type="checkbox"
        checked={props.notify}
        onChange={(event) => {
          props.onNotify(event.currentTarget.checked);
        }}
      />{' '}
      {text.form.notify}
    </label>
  );
}

const expiryKey = (days: AgentTokenExpiry): keyof typeof text.form.expiryOptions =>
  days === null ? 'never' : (String(days) as '1' | '7' | '30' | '90');

function Expiry(props: {
  readonly value: AgentTokenExpiry;
  readonly sends: boolean;
  readonly onChange: Setter<AgentTokenExpiry>;
}): JSX.Element {
  const allowed = AGENT_TOKEN_EXPIRIES.filter((days) => !props.sends || soon(days));
  return (
    <label>
      {text.form.expiry}{' '}
      <select
        value={expiryKey(props.value)}
        onChange={(event) => {
          const chosen = allowed.find((days) => expiryKey(days) === event.currentTarget.value);
          // `find` gives null for Never, and undefined only for a value the list does not offer.
          props.onChange(chosen === undefined ? props.value : chosen);
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

/** Whether a token expires within the time a sending token may last. */
const soon = (days: AgentTokenExpiry): boolean => days !== null && days <= SENDING_TOKEN_DAYS;

/** The form's choices, kept consistent: a token that opens or sends lists chats; one that sends expires soon. */
function useSpec(accounts: AgentsView['accounts']) {
  const [spec, setSpec] = useState<AgentTokenSpec>({
    name: '',
    scopes: [...PRESETS.read],
    accounts: accounts.slice(0, 1).map((account) => account.id),
    chats: 'all',
    limits: DEFAULT_AGENT_LIMITS,
    expiresInDays: SENDING_TOKEN_DAYS,
    notify: true,
  });
  const update = (change: Partial<AgentTokenSpec>): void => {
    const next = { ...spec, ...change };
    const listOnly = next.scopes.some((scope) => LISTED_CHAT_SCOPES.includes(scope));
    const sends = next.scopes.includes('messages:send');
    setSpec({
      ...next,
      chats: listOnly && next.chats === 'all' ? [] : next.chats,
      expiresInDays: sends && !soon(next.expiresInDays) ? SENDING_TOKEN_DAYS : next.expiresInDays,
    });
  };
  return [spec, update] as const;
}

type Spec = ReturnType<typeof useSpec>;

function NameField({ spec: [spec, update] }: { readonly spec: Spec }): JSX.Element {
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
          update({ name: event.currentTarget.value });
        }}
      />
    </label>
  );
}

/** Where the token may act and what it may do there. */
function Reach(props: {
  readonly api: ChromeApi;
  readonly accounts: AgentsView['accounts'];
  readonly spec: Spec;
}): JSX.Element {
  const [spec, update] = props.spec;
  return (
    <>
      <Accounts
        accounts={props.accounts}
        chosen={[...spec.accounts]}
        onChange={(chosen) => {
          update({ accounts: chosen });
        }}
      />
      <Scopes
        chosen={[...spec.scopes]}
        onChange={(scopes) => {
          update({ scopes });
        }}
      />
      <Chats
        api={props.api}
        account={spec.accounts[0]}
        chats={spec.chats}
        listOnly={spec.scopes.some((scope) => LISTED_CHAT_SCOPES.includes(scope))}
        onChange={(chats) => {
          update({ chats });
        }}
      />
    </>
  );
}

/** How fast and for how long the token may act. */
function Bounds({ spec: [spec, update] }: { readonly spec: Spec }): JSX.Element {
  const sends = spec.scopes.includes('messages:send');
  return (
    <>
      <Limits
        limits={spec.limits}
        sends={sends}
        notify={spec.notify}
        onChange={(limits) => {
          update({ limits });
        }}
        onNotify={(notify) => {
          update({ notify });
        }}
      />
      <Expiry
        value={spec.expiresInDays}
        sends={sends}
        onChange={(expiresInDays) => {
          update({ expiresInDays });
        }}
      />
    </>
  );
}

/** Creating a token: what it may do, where, for how long, and how fast (ADR 0019). */
export function AgentTokenForm({ api, accounts, onCreated, onCancel }: FormProps): JSX.Element {
  const spec = useSpec(accounts);
  const [problem, setProblem] = useState('');
  const create = (): void => {
    void api.agents.create(spec[0]).then((result) => {
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
      <NameField spec={spec} />
      <Reach api={api} accounts={accounts} spec={spec} />
      <Bounds spec={spec} />
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
