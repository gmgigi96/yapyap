import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ChromeApi, DownloadAction, DownloadEntry } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';

const text = en.downloads;

/** How often the list catches up with downloads in progress. */
export const REFRESH_MS = 500;

const sizeFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
/** Every unit but the largest, which takes whatever is left. */
const SMALLER_UNITS = ['B', 'KB', 'MB'];
const STEP = 1024;

/** A byte count as people read it: 512 B, 3.2 MB. */
export function sizeOf(bytes: number): string {
  let value = bytes;
  for (const unit of SMALLER_UNITS) {
    if (value < STEP) {
      return `${sizeFormat.format(value)} ${unit}`;
    }
    value /= STEP;
  }
  return `${sizeFormat.format(value)} GB`;
}

function status(entry: DownloadEntry): string {
  switch (entry.state) {
    case 'progressing':
      return entry.total > 0
        ? text.progress({ received: sizeOf(entry.received), total: sizeOf(entry.total) })
        : sizeOf(entry.received);
    case 'paused':
      return text.paused({ received: sizeOf(entry.received) });
    default:
      return text[entry.state];
  }
}

/** The actions a download offers in its state. */
function actionsOf(entry: DownloadEntry): DownloadAction[] {
  const resumable = entry.canResume ? (['resume'] as const) : [];
  switch (entry.state) {
    case 'progressing':
      return ['pause', 'cancel'];
    case 'paused':
      return [...resumable, 'cancel'];
    case 'interrupted':
      return [...resumable];
    case 'completed':
      return ['show'];
    default:
      return [];
  }
}

function Row(props: {
  readonly entry: DownloadEntry;
  readonly onAct: (id: number, action: DownloadAction) => void;
}): JSX.Element {
  const { entry } = props;
  const running = entry.state === 'progressing' || entry.state === 'paused';
  return (
    <li class="download">
      <span class="name">{entry.name}</span>
      {running && entry.total > 0 ? (
        <progress value={entry.received} max={entry.total} aria-label={entry.name} />
      ) : null}
      <span class="hint">{status(entry)}</span>
      <span class="actions">
        {actionsOf(entry).map((action) => (
          <button
            key={action}
            type="button"
            aria-label={text.actionLabel({ action: text[action], file: entry.name })}
            onClick={() => {
              props.onAct(entry.id, action);
            }}
          >
            {text[action]}
          </button>
        ))}
      </span>
    </li>
  );
}

function List(props: {
  readonly entries: readonly DownloadEntry[];
  readonly onAct: (id: number, action: DownloadAction) => void;
}): JSX.Element {
  if (props.entries.length === 0) {
    return <p class="hint">{text.empty}</p>;
  }
  return (
    <ul>
      {props.entries.map((entry) => (
        <Row key={entry.id} entry={entry} onAct={props.onAct} />
      ))}
    </ul>
  );
}

/** This session's downloads, with what can be done to each (#74). */
export function Downloads({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [entries, setEntries] = useState<readonly DownloadEntry[]>([]);
  const refresh = useCallback(() => {
    void api.downloads.list().then(setEntries);
  }, [api]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [refresh]);
  const act = useCallback(
    (id: number, action: DownloadAction) => {
      void api.downloads.act(id, action).then(refresh);
    },
    [api, refresh],
  );
  const clear = useCallback(() => {
    void api.downloads.clear().then(refresh);
  }, [api, refresh]);
  return (
    <main class="downloads">
      <h1>{text.title}</h1>
      <List entries={entries} onAct={act} />
      <p class="hint">{text.kept}</p>
      <div class="actions">
        <button type="button" onClick={clear}>
          {text.clear}
        </button>
      </div>
    </main>
  );
}
