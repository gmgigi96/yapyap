import type { JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import type { ChromeApi } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { parseInternationalNumber } from '../../shared/phone-number.ts';

const text = en.newChat;

function NumberField(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div class="field">
      <label htmlFor="number">{text.numberLabel}</label>
      <input
        id="number"
        type="tel"
        autocomplete="off"
        placeholder={text.numberPlaceholder}
        value={props.value}
        aria-describedby="number-hint"
        onInput={(event) => {
          props.onChange(event.currentTarget.value);
        }}
      />
      <p id="number-hint" class="hint">
        {text.numberHint}
      </p>
    </div>
  );
}

function Actions({ canOpen }: { readonly canOpen: boolean }): JSX.Element {
  return (
    <div class="actions">
      <button
        type="button"
        onClick={() => {
          window.close();
        }}
      >
        {en.common.cancel}
      </button>
      <button type="submit" disabled={!canOpen}>
        {text.open}
      </button>
    </div>
  );
}

/**
 * Opens a chat with a number that is not in the user's contacts. The number
 * goes to WhatsApp's own chat link and is never saved.
 */
export function NewChat({ api }: { readonly api: ChromeApi }): JSX.Element {
  const [number, setNumber] = useState('');
  const [failed, setFailed] = useState(false);
  const valid = parseInternationalNumber(number) !== undefined;
  const change = useCallback((value: string): void => {
    setNumber(value);
    setFailed(false);
  }, []);
  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    void api.chat.openNumber(number).then((opened) => {
      if (opened) {
        window.close();
      } else {
        setFailed(true);
      }
    });
  };
  return (
    <main class="new-chat">
      <h1>{text.title}</h1>
      <form onSubmit={submit}>
        <NumberField value={number} onChange={change} />
        <output>{failed ? text.notReady : ''}</output>
        <Actions canOpen={valid} />
      </form>
    </main>
  );
}
