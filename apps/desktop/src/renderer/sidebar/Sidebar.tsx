import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ChromeApi, SidebarAccount, SidebarState } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.sidebar;

/** The first letter of the name, which the avatar shows like a contact's initial. */
function initial(name: string): string {
  // Names are never blank (the Accounts window trims and checks them).
  return Array.from(name.trim()).slice(0, 1).join('').toUpperCase();
}

/** A speaker with a slash, drawn rather than written, so it reads in every language. */
function MutedIcon(): JSX.Element {
  return (
    <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
      <path d="M11 5l4 6M15 5l-4 6" stroke="currentColor" stroke-width="1.5" />
    </svg>
  );
}

/** The largest count a badge shows in full; two digits fit it. */
const MAX_BADGE = 99;

const badge = (unread: number): string =>
  unread > MAX_BADGE ? text.badgeOverflow({ max: MAX_BADGE }) : String(unread);

/** An account's button: its name, then what the badge and marks show. */
function accountLabel(account: SidebarAccount): string {
  const unread = !account.muted && account.unread > 0 ? text.unread({ count: account.unread }) : '';
  return [account.name, account.muted ? text.muted : '', unread]
    .filter((part) => part !== '')
    .join(', ');
}

function Mark({ account }: { readonly account: SidebarAccount }): JSX.Element | null {
  if (account.muted) {
    return <MutedIcon />;
  }
  return account.unread > 0 ? (
    <span class="badge" aria-hidden="true">
      {badge(account.unread)}
    </span>
  ) : null;
}

/** A running share, always in sight, with the one action it needs: stop. */
function StopSharing(props: {
  readonly account: SidebarAccount;
  readonly compact: boolean;
  readonly onStop: (id: string) => void;
}): JSX.Element {
  const label = text.stopSharing({ name: props.account.name });
  return (
    <button
      type="button"
      class="sharing"
      aria-label={label}
      title={label}
      onClick={() => {
        props.onStop(props.account.id);
      }}
    >
      <span class="dot" aria-hidden="true" />
      {props.compact ? null : text.sharing}
    </button>
  );
}

function AccountButton(props: {
  readonly account: SidebarAccount;
  readonly compact: boolean;
  readonly onSwitch: (id: string) => void;
  readonly onStop: (id: string) => void;
}): JSX.Element {
  const { account, compact } = props;
  const label = accountLabel(account);
  return (
    <li>
      <button
        type="button"
        aria-current={account.active ? 'page' : undefined}
        aria-label={label}
        title={compact ? label : undefined}
        onClick={() => {
          props.onSwitch(account.id);
        }}
      >
        <span class={`avatar swatch-${account.color}`} aria-hidden="true">
          {account.avatar === undefined ? (
            initial(account.name)
          ) : (
            <img class="photo" src={account.avatar} alt="" />
          )}
        </span>
        {compact ? null : <span class="name">{account.name}</span>}
        <Mark account={account} />
      </button>
      {account.sharing ? (
        <StopSharing account={account} compact={compact} onStop={props.onStop} />
      ) : null}
    </li>
  );
}

/** The latest state: pushed by YapYap, or asked for once in case a push came before the page. */
function useSidebarState(api: ChromeApi): SidebarState | null {
  const [state, setState] = useState<SidebarState | null>(null);
  useEffect(() => {
    api.sidebar.onState(setState);
    api.sidebar
      .state()
      .then((first) => {
        setState((current) => current ?? first);
      })
      .catch(() => undefined);
  }, [api]);
  return state;
}

function Footer({ api, state }: { readonly api: ChromeApi; readonly state: SidebarState }) {
  const { compact } = state;
  const layout = compact ? text.full : text.compact;
  return (
    <footer>
      {state.doNotDisturb ? (
        <p class="dnd" title={text.doNotDisturb}>
          <MutedIcon />
          {/* The compact sidebar shows the icon alone, so the words stay for screen readers. */}
          <span class={compact ? 'visually-hidden' : undefined}>{text.doNotDisturb}</span>
        </p>
      ) : null}
      <button
        type="button"
        class="layout"
        aria-label={layout}
        title={layout}
        onClick={() => {
          void api.sidebar.setCompact(!compact);
        }}
      >
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d={compact ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} stroke="currentColor" fill="none" />
        </svg>
      </button>
    </footer>
  );
}

/**
 * The accounts beside WhatsApp: a click switches, without reloading, to the
 * account's own view. Ctrl or Cmd with a digit does the same from anywhere.
 */
export function Sidebar({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const state = useSidebarState(api);
  const switchTo = useCallback(
    (id: string): void => {
      void api.sidebar.switchTo(id);
    },
    [api],
  );
  const stopSharing = useCallback(
    (id: string): void => {
      void api.sidebar.stopSharing(id);
    },
    [api],
  );
  if (state === null) {
    return null;
  }
  return (
    <nav class={state.compact ? 'compact' : undefined} aria-label={text.label}>
      <ul>
        {state.accounts.map((account) => (
          <AccountButton
            key={account.id}
            account={account}
            compact={state.compact}
            onSwitch={switchTo}
            onStop={stopSharing}
          />
        ))}
      </ul>
      <Footer api={api} state={state} />
    </nav>
  );
}
