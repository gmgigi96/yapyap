import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChromeApi } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { DiscardPrompt, useEscapeToClose } from '../shared/discard.tsx';

const text = en.report;

/** The most the main process accepts; the GitHub form takes the rest. */
const MAX_DESCRIPTION = 4000;

function Description(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <>
      <label htmlFor="description">{text.description}</label>
      <textarea
        id="description"
        rows={6}
        maxLength={MAX_DESCRIPTION}
        placeholder={text.placeholder}
        value={props.value}
        onInput={(event) => {
          props.onChange(event.currentTarget.value);
        }}
      />
    </>
  );
}

function Open(props: {
  readonly api: ChromeApi;
  readonly description: string;
  /** Once opened, the description is on the clipboard and in GitHub's form, so closing loses nothing. */
  readonly onOpened: (description: string) => void;
}): JSX.Element {
  const [status, setStatus] = useState('');
  return (
    <>
      <output>{status}</output>
      <div class="actions">
        <button
          type="button"
          class="primary"
          onClick={() => {
            const { description, onOpened } = props;
            props.api.report.open(description).then(
              () => {
                setStatus(text.opened);
                onOpened(description);
              },
              () => {
                setStatus(text.failed);
              },
            );
          }}
        >
          {text.open}
        </button>
      </div>
    </>
  );
}

/**
 * Help → Report a Problem (#82): the user describes the problem and reviews
 * every line the report carries before anything leaves the computer, which
 * happens only when they submit it on GitHub.
 */
export function ProblemReport({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [description, setDescription] = useState('');
  const [opened, setOpened] = useState('');
  const [diagnostics, setDiagnostics] = useState('');
  useEffect(() => {
    api.report.diagnostics().then(setDiagnostics, () => undefined);
  }, [api]);
  const leaving = useEscapeToClose(description.trim() !== '' && description !== opened);
  return (
    <main class="report">
      <h1>{text.title}</h1>
      <p class="hint">{text.intro}</p>
      {leaving.asking ? <DiscardPrompt message={text.discard} onSettle={leaving.settle} /> : null}
      <Description value={description} onChange={setDescription} />
      <label htmlFor="diagnostics">{text.diagnostics}</label>
      <p class="hint" id="diagnostics-hint">
        {text.diagnosticsHint}
      </p>
      <textarea
        id="diagnostics"
        class="diagnostics"
        rows={10}
        readOnly
        aria-describedby="diagnostics-hint"
        value={diagnostics}
      />
      <Open api={api} description={description} onOpened={setOpened} />
    </main>
  );
}
