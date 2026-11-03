import type { JSX, TargetedInputEvent } from 'preact';
import { useState } from 'preact/hooks';
import type { ChromeApi, ProxyLoginRequest } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { useLoaded } from '../shared/hooks.ts';

const text = en.proxyLogin;

function Field(props: {
  readonly id: string;
  readonly label: string;
  readonly type: 'text' | 'password';
  readonly autocomplete: 'username' | 'current-password';
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const common = {
    id: props.id,
    autocomplete: props.autocomplete,
    spellcheck: false,
    value: props.value,
    onInput: (event: TargetedInputEvent<HTMLInputElement>) => {
      props.onChange(event.currentTarget.value);
    },
  };
  return (
    <div class="field">
      <label htmlFor={props.id}>{props.label}</label>
      {props.type === 'password' ? (
        <input type="password" {...common} />
      ) : (
        <input type="text" {...common} />
      )}
    </div>
  );
}

function Remember(props: {
  readonly allowed: boolean;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <div class="field">
      <label>
        <input
          type="checkbox"
          checked={props.checked}
          disabled={!props.allowed}
          aria-describedby="remember-hint"
          onChange={(event) => {
            props.onChange(event.currentTarget.checked);
          }}
        />
        {text.remember}
      </label>
      <p id="remember-hint" class="hint">
        {props.allowed ? text.rememberHint : text.cannotRemember}
      </p>
    </div>
  );
}

function Actions(props: { readonly api: ChromeApi; readonly canSignIn: boolean }): JSX.Element {
  return (
    <div class="actions">
      <button
        type="button"
        onClick={() => {
          void props.api.proxyLogin.answer(null);
        }}
      >
        {en.common.cancel}
      </button>
      <button type="submit" disabled={!props.canSignIn}>
        {text.signIn}
      </button>
    </div>
  );
}

function Form({
  api,
  request,
}: {
  readonly api: ChromeApi;
  readonly request: ProxyLoginRequest;
}): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    void api.proxyLogin.answer({ username, password, remember: remember && request.canRemember });
  };
  return (
    <form onSubmit={submit}>
      <p>{text.asks({ host: `${request.host}:${String(request.port)}` })}</p>
      {request.failed ? <p role="alert">{text.failed}</p> : null}
      <Field
        id="username"
        label={text.username}
        type="text"
        autocomplete="username"
        value={username}
        onChange={setUsername}
      />
      <Field
        id="password"
        label={text.password}
        type="password"
        autocomplete="current-password"
        value={password}
        onChange={setPassword}
      />
      <Remember allowed={request.canRemember} checked={remember} onChange={setRemember} />
      <Actions api={api} canSignIn={username !== ''} />
    </form>
  );
}

/** Asks for a proxy's username and password; YapYap closes the window once answered. */
export function ProxyLogin({ api }: { readonly api: ChromeApi }): JSX.Element {
  const request = useLoaded(api.proxyLogin.request);
  return (
    <main class="proxy-login">
      <h1>{text.title}</h1>
      {request == null ? null : <Form api={api} request={request} />}
    </main>
  );
}
