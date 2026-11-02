import type { JSX } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useState } from 'preact/hooks';
import type { ChromeApi, GlobalShortcutState, ShortcutList } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { acceleratorFromKeys } from '../../shared/shortcut-keys.ts';
import { keysOf, type ActiveShortcut } from '../../shared/shortcuts.ts';

const text = en.shortcuts;

/** Each key in its own box; macOS writes them together, other systems with plus signs. */
function Keys(props: { readonly accelerator: string; readonly platform: string }): JSX.Element {
  const keys = keysOf(props.accelerator, props.platform);
  const joiner = props.platform === 'darwin' ? '' : '+';
  return (
    <span class="keys">
      {keys.map((key, index) => (
        <span key={key}>
          {index > 0 ? joiner : null}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}

/**
 * Waits for the next key press while `id` is being changed. It listens
 * before anything else, so Escape cancels rather than closing the window.
 */
function useKeyCapture(
  id: string | undefined,
  platform: string,
  onKeys: (accelerator: string | undefined) => void,
): void {
  // Listening starts as the page shows it is listening, so no key slips past.
  useLayoutEffect(() => {
    if (id === undefined) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') {
        onKeys(undefined);
        return;
      }
      const accelerator = acceleratorFromKeys(event, platform);
      if (accelerator !== undefined) {
        onKeys(accelerator);
      }
    };
    globalThis.addEventListener('keydown', listen, true);
    return () => {
      globalThis.removeEventListener('keydown', listen, true);
    };
  }, [id, platform, onKeys]);
}

interface RowProps {
  readonly shortcut: ActiveShortcut;
  readonly platform: string;
  readonly listening: boolean;
  readonly onChange: (id: string) => void;
  readonly onReset: (id: string) => void;
}

/** Change, and a second action (Reset or Remove) when it applies. */
function Buttons(props: {
  readonly id: string;
  readonly label: string;
  readonly second: string | undefined;
  readonly onChange: (id: string) => void;
  readonly onSecond: (id: string) => void;
}): JSX.Element {
  return (
    <td class="row-actions">
      <button
        type="button"
        aria-label={`${text.change}: ${props.label}`}
        onClick={() => {
          props.onChange(props.id);
        }}
      >
        {text.change}
      </button>
      {props.second === undefined ? null : (
        <button
          type="button"
          aria-label={`${props.second}: ${props.label}`}
          onClick={() => {
            props.onSecond(props.id);
          }}
        >
          {props.second}
        </button>
      )}
    </td>
  );
}

function RowActions({ shortcut, onChange, onReset }: RowProps): JSX.Element {
  return (
    <Buttons
      id={shortcut.id}
      label={shortcut.label}
      second={shortcut.custom ? text.reset : undefined}
      onChange={onChange}
      onSecond={onReset}
    />
  );
}

function Row(props: RowProps): JSX.Element {
  return (
    <tr>
      <td>{props.shortcut.label}</td>
      <td>
        {props.listening ? (
          <output>{text.press}</output>
        ) : (
          <Keys accelerator={props.shortcut.accelerator} platform={props.platform} />
        )}
      </td>
      <RowActions {...props} />
    </tr>
  );
}

function Table(props: {
  readonly list: ShortcutList;
  readonly listening: string | undefined;
  readonly onChange: (id: string) => void;
  readonly onReset: (id: string) => void;
}): JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">{text.action}</th>
          <th scope="col">{text.shortcut}</th>
          <td />
        </tr>
      </thead>
      <tbody>
        {props.list.shortcuts.map((shortcut) => (
          <Row
            key={shortcut.id}
            shortcut={shortcut}
            platform={props.list.platform}
            listening={props.listening === shortcut.id}
            onChange={props.onChange}
            onReset={props.onReset}
          />
        ))}
      </tbody>
    </table>
  );
}

function GlobalRow(props: {
  readonly shortcut: GlobalShortcutState;
  readonly platform: string;
  readonly listening: boolean;
  readonly onChange: (id: string) => void;
  readonly onRemove: (id: string) => void;
}): JSX.Element {
  const { shortcut } = props;
  const keys =
    shortcut.accelerator === '' ? (
      text.none
    ) : (
      <Keys accelerator={shortcut.accelerator} platform={props.platform} />
    );
  return (
    <tr>
      <td>
        {shortcut.label}
        {shortcut.registered ? null : <p class="hint">{text.notRegistered}</p>}
      </td>
      <td>{props.listening ? <output>{text.press}</output> : keys}</td>
      <Buttons
        id={shortcut.id}
        label={shortcut.label}
        second={shortcut.accelerator === '' ? undefined : text.remove}
        onChange={props.onChange}
        onSecond={props.onRemove}
      />
    </tr>
  );
}

/** Shortcuts that work while the user is in another app; none has keys at first. */
function GlobalTable(props: {
  readonly list: ShortcutList;
  readonly listening: string | undefined;
  readonly onChange: (id: string) => void;
  readonly onRemove: (id: string) => void;
}): JSX.Element {
  return (
    <section>
      <h2>{text.global}</h2>
      <p class="hint">{text.globalHint}</p>
      <table>
        <tbody>
          {props.list.global.map((shortcut) => (
            <GlobalRow
              key={shortcut.id}
              shortcut={shortcut}
              platform={props.list.platform}
              listening={props.listening === shortcut.id}
              onChange={props.onChange}
              onRemove={props.onRemove}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The shortcuts as main has them, and the last change's problem, if any. */
function useShortcuts(api: ChromeApi) {
  const [list, setList] = useState<ShortcutList>();
  const [problem, setProblem] = useState('');
  useEffect(() => {
    void api.shortcuts.list().then(setList);
  }, [api]);
  const apply = useCallback(
    (id: string, accelerator: string | null) => {
      void api.shortcuts.set(id, accelerator).then((change) => {
        setList(change);
        setProblem(change.problem);
      });
    },
    [api],
  );
  return { list, problem, apply };
}

/** Every keyboard shortcut YapYap answers to on this computer, each one changeable (#75). */
export function Shortcuts({ api }: { readonly api: ChromeApi }): JSX.Element {
  const { list, problem, apply } = useShortcuts(api);
  const [listening, setListening] = useState<string>();
  const onKeys = useCallback(
    (accelerator: string | undefined) => {
      if (listening !== undefined && accelerator !== undefined) {
        apply(listening, accelerator);
      }
      setListening(undefined);
    },
    [apply, listening],
  );
  const reset = useCallback(
    (id: string) => {
      apply(id, null);
    },
    [apply],
  );
  useKeyCapture(listening, list?.platform ?? '', onKeys);
  return (
    <main class="shortcuts">
      <h1>{text.title}</h1>
      <p role="alert">{problem}</p>
      {list === undefined ? null : (
        <>
          <Table list={list} listening={listening} onChange={setListening} onReset={reset} />
          <GlobalTable list={list} listening={listening} onChange={setListening} onRemove={reset} />
        </>
      )}
    </main>
  );
}
