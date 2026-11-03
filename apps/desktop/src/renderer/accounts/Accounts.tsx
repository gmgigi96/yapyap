import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  AccountChange,
  AccountList,
  AccountSummary,
  ChromeApi,
} from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { isProxyAddress } from '../../shared/proxy-address.ts';
import { DiscardPrompt } from '../shared/discard.tsx';

const text = en.accounts;

/** Where the user asked to go while an edit was unsaved: another account, or away. */
type Pending = { readonly kind: 'select'; readonly id: string } | { readonly kind: 'close' };

const changeOf = ({ name, color, enabled, muted, proxy }: AccountSummary): AccountChange => ({
  name,
  color,
  enabled,
  muted,
  proxy,
});

function isDirty(draft: AccountChange, account: AccountSummary): boolean {
  const saved = changeOf(account);
  return (Object.keys(saved) as (keyof AccountChange)[]).some((key) => draft[key] !== saved[key]);
}

/** As the menu and YapYap itself refuse: WhatsApp keeps running in one account at least. */
function isLastRunning(list: AccountList, account: AccountSummary): boolean {
  return (
    account.enabled && list.accounts.every((other) => other.id === account.id || !other.enabled)
  );
}

function colorName(color: string): string {
  return (text.colors as Readonly<Record<string, string>>)[color] ?? color;
}

function AccountRow(props: {
  readonly account: AccountSummary;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  const { account, selected, onSelect } = props;
  const notes = [
    account.enabled ? '' : text.off,
    account.muted ? text.muted : '',
    account.active ? text.shown : '',
  ];
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => {
          onSelect(account.id);
        }}
      >
        <span class={`swatch swatch-${account.color}`} aria-hidden="true" />
        {account.name}
        <span class="hint">{notes.filter((note) => note !== '').join(' · ')}</span>
      </button>
    </li>
  );
}

function ColorChoice(props: {
  readonly colors: readonly string[];
  readonly value: string;
  readonly onChange: (color: string) => void;
}): JSX.Element {
  return (
    <fieldset class="choice">
      <legend>{text.color}</legend>
      {props.colors.map((color) => (
        <label key={color}>
          <input
            type="radio"
            name="color"
            value={color}
            checked={props.value === color}
            onChange={() => {
              props.onChange(color);
            }}
          />
          <span class={`swatch swatch-${color}`} aria-hidden="true" />
          {colorName(color)}
        </label>
      ))}
    </fieldset>
  );
}

interface DraftProps {
  readonly draft: AccountChange;
  readonly onChange: (draft: AccountChange) => void;
}

function NameField({ draft, onChange }: DraftProps): JSX.Element {
  return (
    <div class="field">
      <label htmlFor="name">{text.name}</label>
      <input
        id="name"
        maxLength={40}
        value={draft.name}
        onInput={(event) => {
          onChange({ ...draft, name: event.currentTarget.value });
        }}
      />
    </div>
  );
}

/** The account's own proxy; empty uses the one in Settings (#76). */
function ProxyField({ draft, onChange }: DraftProps): JSX.Element {
  const valid = isProxyAddress(draft.proxy);
  return (
    <div class="field text">
      <label htmlFor="proxy">{text.proxy}</label>
      <input
        id="proxy"
        type="text"
        spellcheck={false}
        placeholder={text.proxyPlaceholder}
        value={draft.proxy}
        aria-invalid={!valid}
        aria-describedby="proxy-hint"
        onInput={(event) => {
          onChange({ ...draft, proxy: event.currentTarget.value.trim() });
        }}
      />
      <p id="proxy-hint" class="hint">
        {valid ? text.proxyHint : text.proxyInvalid}
      </p>
    </div>
  );
}

/** An on/off switch of the draft, with its explanation. */
function SwitchField(
  props: DraftProps & {
    readonly field: 'enabled' | 'muted';
    readonly label: string;
    readonly hint: string;
  },
): JSX.Element {
  const { draft, onChange, field } = props;
  return (
    <div class="field">
      <input
        id={field}
        type="checkbox"
        checked={draft[field]}
        aria-describedby={`${field}-hint`}
        onChange={(event) => {
          onChange({ ...draft, [field]: event.currentTarget.checked });
        }}
      />
      <label htmlFor={field}>{props.label}</label>
      <p id={`${field}-hint`} class="hint">
        {props.hint}
      </p>
    </div>
  );
}

function Switches({ draft, onChange }: DraftProps): JSX.Element {
  return (
    <>
      <SwitchField
        draft={draft}
        onChange={onChange}
        field="enabled"
        label={text.run}
        hint={text.runHint}
      />
      <SwitchField
        draft={draft}
        onChange={onChange}
        field="muted"
        label={text.mute}
        hint={text.muteHint}
      />
    </>
  );
}

interface EditorProps extends DraftProps {
  readonly id: string;
  readonly colors: readonly string[];
  readonly dirty: boolean;
  /** False for the last running account, which YapYap keeps. */
  readonly removable: boolean;
  readonly onSave: (id: string, change: AccountChange) => void;
  readonly onRevert: () => void;
  readonly onRemove: (id: string) => void;
}

function Editor(props: EditorProps): JSX.Element {
  const { id, draft, onChange, onSave, onRemove } = props;
  const submit = useCallback(
    (event: SubmitEvent): void => {
      event.preventDefault();
      onSave(id, draft);
    },
    [id, draft, onSave],
  );
  const pickColor = useCallback(
    (color: string): void => {
      onChange({ ...draft, color });
    },
    [draft, onChange],
  );
  return (
    <form class="editor" onSubmit={submit}>
      <NameField draft={draft} onChange={onChange} />
      <ColorChoice colors={props.colors} value={draft.color} onChange={pickColor} />
      <Switches draft={draft} onChange={onChange} />
      <ProxyField draft={draft} onChange={onChange} />
      <EditorActions
        id={id}
        draft={draft}
        dirty={props.dirty}
        removable={props.removable}
        onRevert={props.onRevert}
        onRemove={onRemove}
      />
    </form>
  );
}

function EditorActions(props: {
  readonly id: string;
  readonly draft: AccountChange;
  readonly dirty: boolean;
  readonly removable: boolean;
  readonly onRevert: () => void;
  readonly onRemove: (id: string) => void;
}): JSX.Element {
  const { id, onRemove } = props;
  const remove = useCallback((): void => {
    onRemove(id);
  }, [id, onRemove]);
  return (
    <>
      {props.removable ? null : (
        <p id="remove-hint" class="hint">
          {text.removeRefused}
        </p>
      )}
      <EditorButtons
        draft={props.draft}
        dirty={props.dirty}
        removable={props.removable}
        onRevert={props.onRevert}
        onRemove={remove}
      />
    </>
  );
}

function EditorButtons(props: {
  readonly draft: AccountChange;
  readonly dirty: boolean;
  readonly removable: boolean;
  readonly onRevert: () => void;
  readonly onRemove: () => void;
}): JSX.Element {
  return (
    <div class="actions">
      <button
        type="button"
        disabled={!props.removable}
        aria-describedby={props.removable ? undefined : 'remove-hint'}
        onClick={props.onRemove}
      >
        {text.remove}
      </button>
      <button type="button" disabled={!props.dirty} onClick={props.onRevert}>
        {en.common.cancel}
      </button>
      <button
        type="submit"
        disabled={
          !props.dirty || props.draft.name.trim() === '' || !isProxyAddress(props.draft.proxy)
        }
      >
        {text.save}
      </button>
    </div>
  );
}

/** What the account may use, and the one answer the user can take back (#77). */
function Permissions({ api, id }: { readonly api: ChromeApi; readonly id: string }) {
  const [allowed, setAllowed] = useState<readonly string[] | null>(null);
  useEffect(() => {
    api.accounts.permissions(id).then(setAllowed, () => {
      setAllowed(null);
    });
  }, [api, id]);
  if (allowed === null) {
    return null;
  }
  const device = (type: string): string =>
    allowed.includes(type) ? text.permissions.allowed : text.permissions.asks;
  return (
    <section class="permissions" aria-labelledby="permissions-title">
      <h2 id="permissions-title">{text.permissions.title}</h2>
      <dl>
        <dt>{text.permissions.camera}</dt>
        <dd>{device('video')}</dd>
        <dt>{text.permissions.microphone}</dt>
        <dd>{device('audio')}</dd>
        <dt>{text.permissions.notifications}</dt>
        <dd>{text.permissions.notificationsState}</dd>
        <dt>{text.permissions.screen}</dt>
        <dd>{text.permissions.screenState}</dd>
      </dl>
      <button
        type="button"
        class="forget"
        disabled={allowed.length === 0}
        onClick={() => {
          api.accounts.forgetPermissions(id).then(setAllowed, () => undefined);
        }}
      >
        {text.permissions.forget}
      </button>
    </section>
  );
}

interface WindowState {
  readonly list: AccountList | null | undefined;
  readonly account: AccountSummary | undefined;
  /** The unsaved edit of the selected account, if the user changed anything. */
  readonly edit: AccountChange | undefined;
  readonly setEdit: (edit: AccountChange) => void;
  readonly select: (id: string) => void;
  /** Shows a fresh list with `id` selected, or the account on screen. */
  readonly show: (list: AccountList, id?: string) => void;
  readonly revert: () => void;
}

function useAccountList(api: ChromeApi): WindowState {
  const [list, setList] = useState<AccountList | null | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [edit, setEdit] = useState<AccountChange | undefined>(undefined);
  const select = useCallback((id: string): void => {
    setSelectedId(id);
    setEdit(undefined);
  }, []);
  const show = useCallback((next: AccountList, id?: string): void => {
    const chosen = next.accounts.find((candidate) => candidate.id === id);
    setList(next);
    setSelectedId((chosen ?? next.accounts.find((candidate) => candidate.active))?.id);
    setEdit(undefined);
  }, []);
  const revert = useCallback((): void => {
    setEdit(undefined);
  }, []);
  useEffect(() => {
    api.accounts.list().then(show, () => {
      setList(null);
    });
  }, [api, show]);
  const account = list?.accounts.find((candidate) => candidate.id === selectedId);
  return { list, account, edit, setEdit, select, show, revert };
}

/** Leaving an unsaved edit, by Escape or by picking another account, asks first. */
function useLeaving(state: WindowState): {
  readonly pending: Pending | undefined;
  readonly request: (pending: Pending) => void;
  readonly settle: (discard: boolean) => void;
} {
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const { select } = state;
  const leave = useCallback(
    (target: Pending): void => {
      if (target.kind === 'close') {
        window.close();
      } else {
        select(target.id);
      }
    },
    [select],
  );
  const changed =
    state.account !== undefined && state.edit !== undefined && isDirty(state.edit, state.account);
  const request = useCallback(
    (target: Pending): void => {
      if (changed) {
        setPending(target);
      } else {
        leave(target);
      }
    },
    [changed, leave],
  );
  const settle = useCallback(
    (discard: boolean): void => {
      setPending(undefined);
      if (discard && pending !== undefined) {
        leave(pending);
      }
    },
    [pending, leave],
  );
  return { pending, request, settle };
}

/** Picking another account, which asks first while an edit is unsaved. */
function useSelect(request: (pending: Pending) => void): (id: string) => void {
  return useCallback(
    (id: string): void => {
      request({ kind: 'select', id });
    },
    [request],
  );
}

function useEscapeToClose(request: (pending: Pending) => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        request({ kind: 'close' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [request]);
}

/** Saving and removing; YapYap answers with the accounts as they now are. */
function useActions(
  api: ChromeApi,
  show: WindowState['show'],
): {
  readonly error: string;
  readonly save: (id: string, change: AccountChange) => void;
  readonly remove: (id: string) => void;
} {
  const [error, setError] = useState('');
  const failed = useCallback((): void => {
    setError(text.failed);
  }, []);
  const save = useCallback(
    (id: string, change: AccountChange): void => {
      api.accounts.save(id, change).then((next) => {
        setError(next === null ? text.refused : '');
        if (next !== null) {
          show(next, id);
        }
      }, failed);
    },
    [api, show, failed],
  );
  const remove = useCallback(
    (id: string): void => {
      api.accounts.remove(id).then((next) => {
        setError(next === null ? text.removeRefused : '');
        if (next !== null) {
          show(next, id);
        }
      }, failed);
    },
    [api, show, failed],
  );
  return { error, save, remove };
}

function AccountRows(props: {
  readonly list: AccountList;
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <ul class="account-list" aria-label={text.listLabel}>
      {props.list.accounts.map((entry) => (
        <AccountRow
          key={entry.id}
          account={entry}
          selected={entry.id === props.selected}
          onSelect={props.onSelect}
        />
      ))}
    </ul>
  );
}

function NoAccounts({ loading }: { readonly loading: boolean }): JSX.Element {
  return (
    <main class="accounts">
      <h1>{text.title}</h1>
      <p>{loading ? en.common.loading : text.unavailable}</p>
    </main>
  );
}

/**
 * Renames, recolors, turns off and removes accounts. Edits stay a draft
 * until saved, and YapYap checks each change again before applying it.
 */
export function Accounts({ api }: { readonly api: ChromeApi }): JSX.Element {
  const state = useAccountList(api);
  const leaving = useLeaving(state);
  const actions = useActions(api, state.show);
  useEscapeToClose(leaving.request);
  const select = useSelect(leaving.request);
  const { list, account } = state;
  if (list == null || account === undefined) {
    return <NoAccounts loading={list === undefined} />;
  }
  const draft = state.edit ?? changeOf(account);
  return (
    <main class="accounts">
      <h1>{text.title}</h1>
      <p class="hint">{text.hint}</p>
      <AccountRows list={list} selected={account.id} onSelect={select} />
      {leaving.pending === undefined ? null : (
        <DiscardPrompt message={text.discard} onSettle={leaving.settle} />
      )}
      <Editor
        id={account.id}
        draft={draft}
        colors={list.colors}
        dirty={isDirty(draft, account)}
        removable={!isLastRunning(list, account)}
        onChange={state.setEdit}
        onSave={actions.save}
        onRevert={state.revert}
        onRemove={actions.remove}
      />
      <Permissions key={account.id} api={api} id={account.id} />
      <p role="alert">{actions.error}</p>
    </main>
  );
}
