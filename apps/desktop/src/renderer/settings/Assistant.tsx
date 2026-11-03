import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  AssistantView,
  ChromeApi,
  FoundServer,
  KeyedProvider,
  PrivateModelAction,
  SettingsSnapshot,
} from '../../shared/api/chrome-api.ts';
import { localServerOf } from '../../shared/local-server.ts';
import { en } from '../../shared/messages/en.ts';
import { fieldsOf, type Change } from './Field.tsx';

const text = en.assistant.settings;

const PROVIDER = 'assistant.provider';

/** Where to get a key, which opens in the user's browser. */
const KEY_PAGES: Readonly<Record<KeyedProvider, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

/** How often the view is read again while the private model downloads. */
const FOLLOW_MS = 1000;

/** The assistant's view, read again on request and while the private model downloads. */
export function useAssistantView(api: ChromeApi): readonly [AssistantView | null, () => void] {
  const [view, setView] = useState<AssistantView | null>(null);
  const load = (): void => {
    api.assistant.view().then(setView, () => undefined);
  };
  useEffect(load, [api]);
  const downloading = view?.privateModel.actions.includes('pause') === true;
  useEffect(() => {
    if (!downloading) {
      return undefined;
    }
    const timer = setInterval(load, FOLLOW_MS);
    return () => {
      clearInterval(timer);
    };
  }, [downloading]);
  return [view, load];
}

interface KeyProps {
  readonly api: ChromeApi;
  readonly provider: KeyedProvider;
  readonly saved: boolean;
  readonly onSaved: () => void;
}

/** What the key's buttons do, and what they say came of it. */
function useKey({ api, provider, onSaved }: KeyProps) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState('');
  const save = (): void => {
    if (key.trim() === '') {
      setStatus(text.key.empty);
      return;
    }
    void api.assistant.saveKey(provider, key).then((kept) => {
      setKey('');
      setStatus(kept ? '' : text.key.cannotKeep);
      onSaved();
    });
  };
  const test = (): void => {
    setStatus(text.key.testing);
    void api.assistant.testKey(provider).then((problem) => {
      setStatus(problem === '' ? text.key.works : problem);
    });
  };
  const forget = (): void => {
    void api.assistant.forgetKey(provider).then(onSaved);
  };
  return { key, setKey, status, save, test, forget };
}

/** A key field for one provider: paste, save, test and forget; the key never comes back. */
export function KeyField(props: KeyProps): JSX.Element {
  const { provider, saved } = props;
  const { key, setKey, status, save, test, forget } = useKey(props);
  const id = `assistant-key-${provider}`;
  return (
    <div class="key">
      <label for={id}>{text.key.label({ provider: text[provider].title })}</label>
      <input
        id={id}
        type="password"
        autocomplete="off"
        spellcheck={false}
        placeholder={text.key.placeholder}
        value={key}
        onInput={(event) => {
          setKey(event.currentTarget.value);
        }}
      />
      <KeyActions saved={saved} onSave={save} onTest={test} onForget={forget} />
      <p class="hint">
        {saved ? text.key.saved : text.key.none}{' '}
        <a href={KEY_PAGES[provider]} target="_blank" rel="noreferrer">
          {text[provider].getKey}
        </a>
      </p>
      <output aria-live="polite">{status}</output>
    </div>
  );
}

function KeyActions(props: {
  readonly saved: boolean;
  readonly onSave: () => void;
  readonly onTest: () => void;
  readonly onForget: () => void;
}): JSX.Element {
  return (
    <div class="actions">
      <button type="button" onClick={props.onSave}>
        {text.key.save}
      </button>
      {props.saved ? (
        <>
          <button type="button" onClick={props.onTest}>
            {text.key.test}
          </button>
          <button type="button" onClick={props.onForget}>
            {text.key.forget}
          </button>
        </>
      ) : null}
    </div>
  );
}

const ACTION_LABELS: Readonly<Record<PrivateModelAction, string>> = {
  download: text.private.download,
  pause: text.private.pause,
  resume: text.private.resume,
  remove: text.private.remove,
  smaller: text.private.smaller,
};

/** One place the assistant can think, chosen with its radio button. */
function Place(props: {
  readonly value: string;
  readonly title: string;
  readonly description: string;
  readonly snapshot: SettingsSnapshot;
  readonly view: AssistantView;
  readonly onChange: Change;
  readonly children?: JSX.Element | (JSX.Element | null)[] | null;
}): JSX.Element {
  const { value, snapshot, view } = props;
  const chosen = snapshot.values[PROVIDER] === value;
  return (
    <div class={chosen ? 'place chosen' : 'place'}>
      <label>
        <input
          type="radio"
          name="assistant.provider"
          value={value}
          checked={chosen}
          onChange={() => {
            props.onChange(PROVIDER, value);
          }}
        />
        <strong>{props.title}</strong>
        {view.inUse === value ? <span class="badge">{text.inUse}</span> : null}
      </label>
      <p class="hint">{props.description}</p>
      {props.children}
    </div>
  );
}

function PrivatePlace(props: PlaceProps): JSX.Element {
  const { api, view, reload } = props;
  const model = view.privateModel;
  return (
    <Place
      {...props}
      value="built-in"
      title={text.private.title}
      description={text.private.description({ size: model.size })}
    >
      <output aria-live="polite">{model.status}</output>
      <div class="actions">
        {model.actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => {
              void api.assistant.privateModel(action).then(reload);
            }}
          >
            {ACTION_LABELS[action]}
          </button>
        ))}
      </div>
    </Place>
  );
}

interface PlaceProps {
  readonly api: ChromeApi;
  readonly snapshot: SettingsSnapshot;
  readonly view: AssistantView;
  readonly onChange: Change;
  readonly reload: () => void;
}

function KeyedPlace(props: PlaceProps & { readonly provider: KeyedProvider }): JSX.Element {
  const { api, view, provider, reload } = props;
  return (
    <Place
      {...props}
      value={provider}
      title={text[provider].title}
      description={text[provider].description}
    >
      <KeyField api={api} provider={provider} saved={view.keys[provider]} onSaved={reload} />
    </Place>
  );
}

/** Switches to a server on this computer: its address, then the provider. */
const chooseServer = (onChange: Change, endpoint: string): void => {
  onChange('assistant.localServer', endpoint);
  onChange(PROVIDER, 'local');
};

function ServerList(props: {
  readonly servers: readonly FoundServer[] | null;
  readonly onChange: Change;
}): JSX.Element | null {
  const { servers, onChange } = props;
  if (servers === null) {
    return null;
  }
  if (servers.length === 0) {
    return <p class="hint">{text.local.none}</p>;
  }
  return (
    <ul class="servers">
      {servers.map(({ server, endpoint, models }) => (
        <li key={endpoint}>
          <span>
            {text.local.found({
              server,
              models: models.length === 0 ? text.local.noModels : models.join(', '),
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              chooseServer(onChange, endpoint);
            }}
          >
            {text.local.use}
          </button>
        </li>
      ))}
    </ul>
  );
}

function LocalAddress(props: { readonly onChange: Change }): JSX.Element {
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState('');
  return (
    <div class="key">
      <label for="assistant-address">{text.local.address}</label>
      <input
        id="assistant-address"
        type="text"
        spellcheck={false}
        placeholder={text.local.addressPlaceholder}
        value={typed}
        onInput={(event) => {
          setTyped(event.currentTarget.value);
        }}
      />
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            const endpoint = localServerOf(typed);
            setProblem(endpoint === undefined ? text.local.badAddress : '');
            if (endpoint !== undefined) {
              chooseServer(props.onChange, endpoint);
            }
          }}
        >
          {text.local.saveAddress}
        </button>
      </div>
      <output aria-live="polite">{problem}</output>
    </div>
  );
}

function LocalPlace(props: PlaceProps): JSX.Element {
  const { api, snapshot, onChange } = props;
  const [servers, setServers] = useState<readonly FoundServer[] | null>(null);
  const [finding, setFinding] = useState(false);
  const current = String(snapshot.values['assistant.localServer']);
  return (
    <Place {...props} value="local" title={text.local.title} description={text.local.description}>
      {current === '' ? null : <p>{text.local.current({ server: current })}</p>}
      <div class="actions">
        <button
          type="button"
          disabled={finding}
          onClick={() => {
            setFinding(true);
            void api.assistant.findServers().then((found) => {
              setServers(found);
              setFinding(false);
            });
          }}
        >
          {finding ? text.local.finding : text.local.find}
        </button>
      </div>
      <ServerList servers={servers} onChange={onChange} />
      <LocalAddress onChange={onChange} />
    </Place>
  );
}

function Places(props: PlaceProps): JSX.Element {
  const { snapshot, onChange, view } = props;
  const auto = snapshot.values[PROVIDER] === 'auto';
  return (
    <fieldset class="places">
      <legend>{text.where}</legend>
      <p class="hint">{text.whereHint}</p>
      <label class={auto ? 'place chosen' : 'place'}>
        <input
          type="radio"
          name="assistant.provider"
          value="auto"
          checked={auto}
          onChange={() => {
            onChange(PROVIDER, 'auto');
          }}
        />
        <strong>{text.automatic}</strong>
        {auto && view.inUse !== null ? (
          <span class="badge">{en.settings.fields.assistant.provider.options[view.inUse]}</span>
        ) : null}
      </label>
      <PrivatePlace {...props} />
      <KeyedPlace {...props} provider="anthropic" />
      <KeyedPlace {...props} provider="openai" />
      <LocalPlace {...props} />
    </fieldset>
  );
}

/** Auto, which names the model it picks, or one of the provider's models. */
function ModelChoice(props: {
  readonly snapshot: SettingsSnapshot;
  readonly view: AssistantView;
  readonly onChange: Change;
}): JSX.Element {
  const { snapshot, view, onChange } = props;
  const picked = String(snapshot.values['assistant.model']);
  const listed = view.models.some(({ id }) => id === picked);
  const auto = view.auto === null ? text.model.auto : text.model.autoNamed({ model: view.auto });
  return (
    <div class="key">
      <label for="assistant-model">{en.settings.fields.assistant.model.label}</label>
      <select
        id="assistant-model"
        value={listed ? picked : 'auto'}
        disabled={view.models.length === 0}
        onChange={(event) => {
          onChange('assistant.model', event.currentTarget.value);
        }}
      >
        <option value="auto">{auto}</option>
        {view.models.map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <p class="hint">
        {view.models.length === 0
          ? text.model.notReady
          : en.settings.fields.assistant.model.description}
      </p>
    </div>
  );
}

/** The chats the assistant may read, by account, each with Remove. */
function Chats(props: {
  readonly api: ChromeApi;
  readonly view: AssistantView;
  readonly reload: () => void;
}) {
  const { api, view, reload } = props;
  if (view.chats.length === 0) {
    return <p class="hint">{text.privacy.noChats}</p>;
  }
  return (
    <ul class="servers">
      {view.chats.flatMap(({ account, accountName, chats }) =>
        chats.map(({ id, name }) => (
          <li key={`${account}/${id}`}>
            <span>
              {text.privacy.chat({ account: accountName, chat: name ?? text.privacy.unnamed })}
            </span>
            <button
              type="button"
              aria-label={text.privacy.removeLabel({ chat: name ?? text.privacy.unnamed })}
              onClick={() => {
                void api.assistant.forgetChat(account, id).then(reload);
              }}
            >
              {text.privacy.remove}
            </button>
          </li>
        )),
      )}
    </ul>
  );
}

function Privacy(props: {
  readonly api: ChromeApi;
  readonly view: AssistantView;
  readonly reload: () => void;
}) {
  const { view } = props;
  return (
    <>
      <h3>{text.privacy.title}</h3>
      <p class="hint">{text.privacy.what}</p>
      <p>{text.privacy.where[view.inUse ?? 'none']}</p>
      <h4>{text.privacy.chats}</h4>
      <p class="hint">{text.privacy.chatsHint}</p>
      <Chats {...props} />
    </>
  );
}

/**
 * Settings › Assistant (ADR 0017), the first section and the one place to
 * set the assistant up: where it thinks, its model, how it behaves, and
 * what it may read.
 */
export function AssistantSection(props: {
  readonly api: ChromeApi;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
}): JSX.Element {
  const { api, snapshot, onChange } = props;
  const [view, reload] = useAssistantView(api);
  const change = useCallback<Change>(
    (id, value) => {
      onChange(id, value);
      setTimeout(reload, 0);
    },
    [onChange, reload],
  );
  return (
    <section aria-labelledby="assistant-title" class="assistant" aria-busy={view === null}>
      <h2 id="assistant-title">{en.settings.sections.assistant}</h2>
      <p class="hint">{text.intro}</p>
      {fieldsOf(['assistant.enabled'], snapshot, onChange)}
      {view === null ? (
        <p>{en.common.loading}</p>
      ) : (
        <AssistantDetails
          api={api}
          snapshot={snapshot}
          view={view}
          onChange={change}
          reload={reload}
        />
      )}
    </section>
  );
}

function AssistantDetails(props: PlaceProps) {
  const { view, snapshot, onChange } = props;
  return (
    <>
      {view.status === '' ? null : (
        <p class="notice">
          <output>{view.status}</output>
        </p>
      )}
      <Places {...props} />
      <ModelChoice {...props} />
      <h3>{text.behavior}</h3>
      {fieldsOf(['assistant.autoSuggest', 'assistant.messages'], snapshot, onChange)}
      <Privacy {...props} />
      <p class="hint">{text.shortcuts}</p>
    </>
  );
}
