import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { AgentsView, AgentTokenView } from '../../shared/agents-api.ts';
import type { ChromeApi, SettingsSnapshot } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { AgentTokenForm, chatLabel, CreatedToken, type Created } from './AgentTokenForm.tsx';
import { fieldsOf, type Change } from './Field.tsx';

const text = en.agents;

/** How often the view is read again while the section is open, for new activity. */
const FOLLOW_MS = 2000;

/** The agents' view, read again on request and every few seconds while the server is on. */
function useAgentsView(api: ChromeApi, on: boolean): readonly [AgentsView | null, () => void] {
  const [view, setView] = useState<AgentsView | null>(null);
  const load = useCallback((): void => {
    api.agents.view().then(setView, () => undefined);
  }, [api]);
  useEffect(load, [load, on]);
  useEffect(() => {
    if (!on) {
      return undefined;
    }
    const timer = setInterval(load, FOLLOW_MS);
    return () => {
      clearInterval(timer);
    };
  }, [on, load]);
  return [view, load];
}

const when = (time: number): string => new Date(time).toLocaleString();

function Address(props: {
  readonly api: ChromeApi;
  readonly view: AgentsView;
  readonly on: boolean;
}) {
  const { api, view, on } = props;
  if (view.address !== null) {
    const address = view.address;
    return (
      <p class="address">
        {text.address} <code>{address}</code>{' '}
        <button type="button" onClick={() => void api.agents.copy(address)}>
          {text.copy}
        </button>
      </p>
    );
  }
  if (view.problem !== '') {
    return (
      <p class="notice">
        <output>{view.problem}</output>{' '}
        <button type="button" onClick={() => void api.agents.newPort()}>
          {text.newPort}
        </button>
      </p>
    );
  }
  return on ? <p aria-busy="true">{en.common.loading}</p> : <p class="hint">{text.off}</p>;
}

/** What a token's limits allow, in words. */
function limitsOf(token: AgentTokenView): string {
  const limit = (value: number | null): string =>
    value === null ? text.tokens.unlimited : String(value);
  const calls = text.tokens.limits({ calls: limit(token.limits.callsPerMinute) });
  if (!token.scopes.includes('messages:send')) {
    return calls;
  }
  const sends = text.tokens.sendLimits({
    minute: limit(token.limits.sendsPerMinute),
    day: limit(token.limits.sendsPerDay),
  });
  return `${calls}; ${sends}`;
}

function expiryOf(token: AgentTokenView, now: number): string {
  if (token.expires === null) {
    return text.tokens.neverExpires;
  }
  return token.expires <= now
    ? text.tokens.expired
    : text.tokens.expires({ date: when(token.expires) });
}

interface TokenProps {
  readonly api: ChromeApi;
  readonly token: AgentTokenView;
  readonly accounts: AgentsView['accounts'];
  readonly reload: () => void;
}

/** A removable item of a token: taking one away narrows it, and can never widen it. */
function Removable(props: {
  readonly label: string;
  readonly danger?: boolean;
  readonly onRemove: () => void;
}): JSX.Element {
  return (
    <li class={props.danger === true ? 'chip danger' : 'chip'}>
      {props.label}{' '}
      <button
        type="button"
        aria-label={text.tokens.remove({ item: props.label })}
        onClick={props.onRemove}
      >
        {text.tokens.removeMark}
      </button>
    </li>
  );
}

function TokenScopes({ api, token, accounts, reload }: TokenProps): JSX.Element {
  const narrow = (step: Parameters<ChromeApi['agents']['narrow']>[1]) => () => {
    void api.agents.narrow(token.id, step).then(reload);
  };
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  return (
    <ul class="chips">
      {token.scopes.map((scope) => (
        <Removable
          key={scope}
          label={text.scopes[scope]}
          danger={scope === 'messages:send'}
          onRemove={narrow({ scope })}
        />
      ))}
      {token.accounts.map((account) => (
        <Removable
          key={account}
          label={names.get(account) ?? account}
          onRemove={narrow({ account })}
        />
      ))}
      {token.chats === 'all' ? (
        <li class="chip">{text.tokens.allChats}</li>
      ) : (
        token.chats.map((chat) => (
          <Removable
            key={chat.id}
            label={chatLabel(chat) || text.tokens.unnamedChat}
            onRemove={narrow({ chat: chat.id })}
          />
        ))
      )}
    </ul>
  );
}

function Token(props: TokenProps): JSX.Element {
  const { api, token, reload } = props;
  const now = Date.now();
  return (
    <li class="token">
      <h4>{token.name}</h4>
      <TokenScopes {...props} />
      <p class="hint">
        {limitsOf(token)} · {expiryOf(token, now)} ·{' '}
        {token.lastUsed === null
          ? text.tokens.neverUsed
          : text.tokens.lastUsed({ date: when(token.lastUsed) })}
      </p>
      <button type="button" onClick={() => void api.agents.revoke(token.id).then(reload)}>
        {text.tokens.revoke}
      </button>
    </li>
  );
}

function Activity({ view }: { readonly view: AgentsView }): JSX.Element {
  return (
    <>
      <h3>{text.activity.title}</h3>
      <p class="hint">{text.activity.note}</p>
      {view.activity.length === 0 ? (
        <p>{text.activity.none}</p>
      ) : (
        <ul class="activity">
          {view.activity.map((entry, index) => (
            <li key={`${String(entry.time)}-${String(index)}`}>
              {text.activity.entry({ ...entry, time: when(entry.time) })}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Creating a token, then showing it once. */
function NewToken(props: {
  readonly api: ChromeApi;
  readonly view: AgentsView;
  readonly reload: () => void;
}): JSX.Element {
  const { api, view, reload } = props;
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const show = useCallback(
    (next: Created): void => {
      setCreating(false);
      setCreated(next);
      reload();
    },
    [reload],
  );
  const cancel = useCallback((): void => {
    setCreating(false);
  }, []);
  const done = useCallback((): void => {
    setCreated(null);
  }, []);
  return (
    <>
      {created === null ? null : <CreatedToken api={api} created={created} onDone={done} />}
      {creating ? (
        <AgentTokenForm api={api} accounts={view.accounts} onCreated={show} onCancel={cancel} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
          }}
        >
          {text.tokens.create}
        </button>
      )}
    </>
  );
}

function Tokens(props: {
  readonly api: ChromeApi;
  readonly view: AgentsView;
  readonly reload: () => void;
}) {
  const { api, view, reload } = props;
  return (
    <>
      <h3>{text.tokens.title}</h3>
      {view.tokens.length === 0 ? <p>{text.tokens.none}</p> : null}
      <ul class="tokens">
        {view.tokens.map((token) => (
          <Token key={token.id} api={api} token={token} accounts={view.accounts} reload={reload} />
        ))}
      </ul>
      <NewToken {...props} />
    </>
  );
}

/**
 * Settings › Agents (ADR 0019): the switch for the MCP server, where agents
 * connect, the tokens that let them in, and what they did since YapYap
 * started.
 */
export function AgentsSection(props: {
  readonly api: ChromeApi;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
}): JSX.Element {
  const { api, snapshot, onChange } = props;
  const on = snapshot.values['agents.enabled'] === true;
  const [view, reload] = useAgentsView(api, on);
  return (
    <section aria-labelledby="agents-title" class="agents" aria-busy={view === null}>
      <h2 id="agents-title">{en.settings.sections.agents}</h2>
      <p class="hint">{text.intro}</p>
      {fieldsOf(['agents.enabled'], snapshot, onChange)}
      {view === null ? (
        <p>{en.common.loading}</p>
      ) : (
        <>
          <Address api={api} view={view} on={on} />
          <Tokens api={api} view={view} reload={reload} />
          <Activity view={view} />
        </>
      )}
    </section>
  );
}
