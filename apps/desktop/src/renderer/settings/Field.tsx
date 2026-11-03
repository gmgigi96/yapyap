import type { JSX } from 'preact';
import type { SettingsSnapshot } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import {
  SETTING_FIELDS,
  type SettingField,
  type SettingValue,
} from '../../shared/settings-fields.ts';

const text = en.settings;

export type Change = (id: string, value: SettingValue) => void;

interface FieldProps {
  readonly field: SettingField;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
  /** Opens the system's folder dialog for a folder field. */
  readonly onChooseFolder?: (id: string) => void;
}

/** The field's description, then why its last change did not take effect. */
function Hint({ field, snapshot }: Omit<FieldProps, 'onChange'>): JSX.Element {
  return (
    <p id={`${field.id}-hint`} class="hint">
      {field.description}
      {field.restart ? ` ${text.restartNote}` : ''}
      <span class="problem" aria-live="polite">
        {snapshot.problems[field.id]}
      </span>
    </p>
  );
}

function Choice(props: FieldProps & { readonly options: NonNullable<SettingField['options']> }) {
  const { field, snapshot, onChange, options } = props;
  return (
    <fieldset class="choice" aria-describedby={`${field.id}-hint`}>
      <legend>{field.label}</legend>
      {options.map(({ value, label }) => (
        <label key={String(value)}>
          <input
            type="radio"
            name={field.id}
            value={value}
            checked={snapshot.values[field.id] === value}
            onChange={() => {
              onChange(field.id, value);
            }}
          />
          {label}
        </label>
      ))}
      <Hint field={field} snapshot={snapshot} />
    </fieldset>
  );
}

/**
 * A line of text, saved on Enter or when focus leaves, so a half-typed
 * address is never checked; YapYap refuses one that does not fit.
 */
function TextField(props: FieldProps & { readonly placeholder: string }) {
  const { field, snapshot, onChange } = props;
  const save = (value: string): void => {
    if (value !== snapshot.values[field.id]) {
      onChange(field.id, value.trim());
    }
  };
  return (
    <div class="field text">
      <label for={field.id}>{field.label}</label>
      <input
        id={field.id}
        type="text"
        spellcheck={false}
        placeholder={props.placeholder}
        defaultValue={String(snapshot.values[field.id] ?? '')}
        aria-describedby={`${field.id}-hint`}
        onBlur={(event) => {
          save(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            save(event.currentTarget.value);
          }
        }}
      />
      <Hint field={field} snapshot={snapshot} />
    </div>
  );
}

/** A folder chosen in the system's dialog; the page never types a path itself. */
function FolderField(props: FieldProps) {
  const { field, snapshot, onChange, onChooseFolder } = props;
  const folder = String(snapshot.values[field.id] ?? '');
  return (
    <div class="field text">
      <span id={`${field.id}-label`}>{field.label}</span>
      <output aria-labelledby={`${field.id}-label`}>
        {folder === '' ? field.folder?.defaultName : folder}
      </output>
      <div class="actions folder-actions">
        {/* Named with the field too, so each folder's Choose… is told apart. */}
        <button
          type="button"
          id={`${field.id}-choose`}
          aria-labelledby={`${field.id}-choose ${field.id}-label`}
          onClick={() => {
            onChooseFolder?.(field.id);
          }}
        >
          {text.chooseFolder}
        </button>
        {folder === '' ? null : (
          <button
            type="button"
            onClick={() => {
              onChange(field.id, '');
            }}
          >
            {field.folder?.useDefault}
          </button>
        )}
      </div>
      <Hint field={field} snapshot={snapshot} />
    </div>
  );
}

export function Field(props: FieldProps): JSX.Element {
  const { field, snapshot, onChange } = props;
  if (field.folder !== undefined) {
    return <FolderField {...props} />;
  }
  if (field.options !== undefined) {
    return <Choice {...props} options={field.options} />;
  }
  if (field.text !== undefined) {
    return <TextField {...props} placeholder={field.text.placeholder} />;
  }
  const hint = `${field.id}-hint`;
  return (
    <div class="field">
      <input
        id={field.id}
        type="checkbox"
        checked={snapshot.values[field.id] === true}
        aria-describedby={hint}
        onChange={(event) => {
          onChange(field.id, event.currentTarget.checked);
        }}
      />
      <label for={field.id}>{field.label}</label>
      <Hint field={field} snapshot={snapshot} />
    </div>
  );
}

/** The listed fields with `id`, which every platform has. */
export function fieldsOf(
  ids: readonly string[],
  snapshot: SettingsSnapshot,
  onChange: Change,
): JSX.Element[] {
  return SETTING_FIELDS.filter((field) => ids.includes(field.id)).map((field) => (
    <Field key={field.id} field={field} snapshot={snapshot} onChange={onChange} />
  ));
}
