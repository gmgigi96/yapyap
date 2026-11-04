import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ChromeApi, PickerOffer, PickerSource } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { useLoaded } from '../shared/hooks.ts';

const text = en.picker;

const GROUPS = [
  { kind: 'screen', title: text.screens },
  { kind: 'window', title: text.windows },
] as const;

/** Escape cancels, like closing the window. */
export function cancelOnEscape(event: KeyboardEvent, api: ChromeApi): void {
  if (event.key === 'Escape') {
    void api.picker.cancel();
  }
}

function Source(props: {
  readonly source: PickerSource;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  const { source, selected, onSelect } = props;
  return (
    <label class="source">
      <input
        type="radio"
        name="source"
        value={source.id}
        checked={selected}
        onChange={() => {
          onSelect(source.id);
        }}
      />
      <img src={source.thumbnail} alt="" width={160} height={90} />
      <span>{source.name}</span>
    </label>
  );
}

function Sources(props: {
  readonly offer: PickerOffer;
  readonly selected: string | undefined;
  readonly onSelect: (id: string) => void;
}): JSX.Element[] {
  if (props.offer.sources.length === 0) {
    return [<p key="none">{text.noSources}</p>];
  }
  return GROUPS.flatMap(({ kind, title }) => {
    const sources = props.offer.sources.filter((source) => source.kind === kind);
    if (sources.length === 0) {
      return [];
    }
    return [
      <fieldset key={kind} class="sources">
        <legend>{title}</legend>
        {sources.map((source) => (
          <Source
            key={source.id}
            source={source}
            selected={source.id === props.selected}
            onSelect={props.onSelect}
          />
        ))}
      </fieldset>,
    ];
  });
}

function AudioOption(props: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label class="audio">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => {
          props.onChange(event.currentTarget.checked);
        }}
      />
      <span>{text.audio}</span>
    </label>
  );
}

function Choices(props: { readonly api: ChromeApi; readonly offer: PickerOffer }): JSX.Element {
  const { api, offer } = props;
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [audio, setAudio] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (selected !== undefined) {
          void api.picker.choose(selected, audio);
        }
      }}
    >
      <Sources offer={offer} selected={selected} onSelect={setSelected} />
      {offer.offerAudio ? <AudioOption checked={audio} onChange={setAudio} /> : null}
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            void api.picker.cancel();
          }}
        >
          {en.common.cancel}
        </button>
        <button type="submit" disabled={selected === undefined}>
          {text.share}
        </button>
      </div>
    </form>
  );
}

export function Picker({ api }: { readonly api: ChromeApi }): JSX.Element {
  const offer = useLoaded(api.picker.offer);
  return (
    <main class="picker">
      <h1>{text.title}</h1>
      {offer == null ? (
        <p>{offer === undefined ? en.common.loading : text.nothing}</p>
      ) : (
        <Choices api={api} offer={offer} />
      )}
    </main>
  );
}
