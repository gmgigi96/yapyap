import type { JSX } from 'preact';
import type { ChromeApi } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { useActionStatus, useLoaded } from '../shared/hooks.ts';

const text = en.recovery;

export function Recovery({ api }: { readonly api: ChromeApi }): JSX.Element {
  const problem = useLoaded(api.recovery.problem);
  const [status, run] = useActionStatus(text.failed);
  const kind = problem?.kind ?? 'blank';
  return (
    <main>
      <h1>{text.problems[kind].title}</h1>
      <p>{text.problems[kind].advice}</p>
      <div class="actions">
        <button
          type="button"
          class="primary"
          onClick={() => {
            run(api.recovery.retry, text.retrying);
          }}
        >
          {text.retry}
        </button>
        <button
          type="button"
          onClick={() => {
            run(api.recovery.clearCache, text.cacheCleared);
          }}
        >
          {text.clearCache}
        </button>
        <button
          type="button"
          onClick={() => {
            run(api.recovery.copyDiagnostics, text.diagnosticsCopied);
          }}
        >
          {text.copyDiagnostics}
        </button>
      </div>
      <output>{status}</output>
      <p class="disclaimer">{text.keepsLogin}</p>
    </main>
  );
}
