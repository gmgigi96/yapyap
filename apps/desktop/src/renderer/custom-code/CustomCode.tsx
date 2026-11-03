import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ChromeApi, CustomCodeView } from '../../shared/chrome-api.ts';
import {
  ALL_ACCOUNTS,
  MAX_SNIPPET,
  NO_CUSTOM_CODE,
  type CustomCode,
  type Snippet,
} from '../../shared/custom-code.ts';
import { en } from '../../shared/messages/en.ts';
import { DiscardPrompt, useEscapeToClose } from '../shared/discard.tsx';

const text = en.customCode;
const EMPTY: Snippet = { css: '', js: '' };

/**
 * Whether `draft` differs from `saved`. Edits only add scopes to a draft, and
 * a scope's emptied snippet counts as none, so typing and erasing changes nothing.
 */
function isChanged(draft: CustomCode, saved: CustomCode): boolean {
  return (
    draft.enabled !== saved.enabled ||
    Object.entries(draft.snippets).some(([scope, mine]) => {
      const theirs = saved.snippets[scope] ?? EMPTY;
      return mine.css !== theirs.css || mine.js !== theirs.js;
    })
  );
}

function CodeField(props: {
  readonly id: 'css' | 'js';
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <>
      <label htmlFor={props.id}>{props.label}</label>
      <textarea
        id={props.id}
        class="code"
        rows={10}
        maxLength={MAX_SNIPPET}
        spellcheck={false}
        autocomplete="off"
        aria-describedby={`${props.id}-hint`}
        value={props.value}
        onInput={(event) => {
          props.onChange(event.currentTarget.value);
        }}
      />
      <p class="hint" id={`${props.id}-hint`}>
        {props.hint}
      </p>
    </>
  );
}

function ScopeField(props: {
  readonly scopes: CustomCodeView['scopes'];
  readonly value: string;
  readonly onChange: (scope: string) => void;
}): JSX.Element {
  return (
    <div class="field">
      <label htmlFor="scope">{text.scope}</label>
      <select
        id="scope"
        value={props.value}
        onChange={(event) => {
          props.onChange(event.currentTarget.value);
        }}
      >
        {props.scopes.map((scope) => (
          <option key={scope.id} value={scope.id}>
            {scope.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EnabledField(props: {
  readonly checked: boolean;
  readonly onChange: (enabled: boolean) => void;
}): JSX.Element {
  return (
    <div class="field">
      <input
        id="enabled"
        type="checkbox"
        checked={props.checked}
        onChange={(event) => {
          props.onChange(event.currentTarget.checked);
        }}
      />
      <label htmlFor="enabled">{text.enabled}</label>
    </div>
  );
}

/**
 * The draft and what it shows: CSS appears in WhatsApp as the user types,
 * and the window takes its previews back when it closes unsaved.
 */
function useDraft(api: ChromeApi) {
  const [view, setView] = useState<CustomCodeView>();
  const [draft, setDraft] = useState<CustomCode>(NO_CUSTOM_CODE);
  const previewed = useRef(new Set<string>());
  const show = useCallback(
    (next: CustomCode, scope: string): void => {
      previewed.current.add(scope);
      const css = next.enabled ? (next.snippets[scope]?.css ?? '') : '';
      void api.customCode.preview(scope, css);
    },
    [api],
  );
  const loaded = useCallback((next: CustomCodeView): void => {
    previewed.current.clear();
    setView(next);
    setDraft(next.code);
  }, []);
  useEffect(() => {
    api.customCode.get().then(loaded, () => undefined);
    const drop = (): void => {
      for (const scope of previewed.current) {
        void api.customCode.preview(scope, null);
      }
    };
    globalThis.addEventListener('pagehide', drop);
    return () => {
      globalThis.removeEventListener('pagehide', drop);
    };
  }, [api, loaded]);
  return { view, draft, setDraft, show, loaded };
}

function Fields(props: {
  readonly draft: CustomCode;
  readonly scopes: CustomCodeView['scopes'];
  readonly scope: string;
  readonly onScope: (scope: string) => void;
  readonly onEnabled: (enabled: boolean) => void;
  readonly onEdit: (part: Partial<Snippet>) => void;
}): JSX.Element {
  const { onEdit } = props;
  const snippet = props.draft.snippets[props.scope] ?? EMPTY;
  const editCss = useCallback(
    (css: string): void => {
      onEdit({ css });
    },
    [onEdit],
  );
  const editJs = useCallback(
    (js: string): void => {
      onEdit({ js });
    },
    [onEdit],
  );
  return (
    <>
      <EnabledField checked={props.draft.enabled} onChange={props.onEnabled} />
      <ScopeField scopes={props.scopes} value={props.scope} onChange={props.onScope} />
      <CodeField
        id="css"
        label={text.css}
        hint={text.cssHint}
        value={snippet.css}
        onChange={editCss}
      />
      <CodeField id="js" label={text.js} hint={text.jsHint} value={snippet.js} onChange={editJs} />
    </>
  );
}

/** Edits to the draft, which clear the last save's status, and saving it. */
function useEditor(api: ChromeApi) {
  const { view, draft, setDraft, show, loaded } = useDraft(api);
  const [scope, setScope] = useState(ALL_ACCOUNTS);
  const [status, setStatus] = useState('');
  const change = (next: CustomCode, restyle: boolean): void => {
    setDraft(next);
    setStatus('');
    if (restyle) {
      show(next, scope);
    }
  };
  const edit = (part: Partial<Snippet>): void => {
    const snippet = { ...(draft.snippets[scope] ?? EMPTY), ...part };
    change({ ...draft, snippets: { ...draft.snippets, [scope]: snippet } }, part.css !== undefined);
  };
  const save = (event: SubmitEvent): void => {
    event.preventDefault();
    api.customCode.save(draft).then(
      (saved) => {
        loaded(saved);
        setStatus(text.saved);
      },
      () => {
        setStatus(text.failed);
      },
    );
  };
  const enable = (enabled: boolean): void => {
    change({ ...draft, enabled }, true);
  };
  const dirty = view !== undefined && isChanged(draft, view.code);
  return { view, draft, dirty, scope, setScope, status, enable, edit, save };
}

/**
 * The window behind the menu's Custom CSS and JavaScript… (#72). It is off
 * until the user turns it on, and says plainly that the code can read chats.
 */
export function CustomCodeEditor({ api }: { readonly api: ChromeApi }): JSX.Element {
  const { view, draft, dirty, scope, setScope, status, enable, edit, save } = useEditor(api);
  const leaving = useEscapeToClose(dirty);
  return (
    <main class="custom-code">
      <h1>{text.title}</h1>
      <p class="warning">{text.warning}</p>
      {leaving.asking ? <DiscardPrompt message={text.discard} onSettle={leaving.settle} /> : null}
      <form onSubmit={save}>
        <Fields
          draft={draft}
          scopes={view?.scopes ?? []}
          scope={scope}
          onScope={setScope}
          onEnabled={enable}
          onEdit={edit}
        />
        <div class="actions">
          <output>{status}</output>
          <button type="submit" disabled={view === undefined}>
            {text.save}
          </button>
        </div>
      </form>
    </main>
  );
}
