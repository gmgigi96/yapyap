import type { JSX } from 'preact';
import type { ChromeApi, SettingsSnapshot } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { SETTING_FIELDS } from '../../shared/settings-fields.ts';
import { Field, type Change } from '../settings/Field.tsx';
import { useSnapshot } from '../settings/Settings.tsx';
import { AssistantStep } from './AssistantStep.tsx';

/** The six-step guide on the website, which opens in the browser (#385). */
const GET_STARTED = 'https://yapyap.guita.org/guide/get-started';

const text = en.welcome;

/** The first choices, grouped as the welcome asks them; fields this platform lacks are left out. */
const GROUPS = [
  { title: text.look, ids: ['appearance.theme'] },
  { title: text.closing, ids: ['general.closeToTray', 'general.autostart'] },
  {
    title: text.notifications,
    note: text.notificationsNote,
    ids: ['privacy.notificationSender', 'privacy.notificationText'],
  },
] as const;

function Group(props: {
  readonly group: (typeof GROUPS)[number];
  readonly snapshot: SettingsSnapshot;
  readonly onChange: Change;
}): JSX.Element {
  const { group, snapshot } = props;
  const ids: readonly string[] = group.ids;
  const fields = SETTING_FIELDS.filter(
    (field) => ids.includes(field.id) && field.id in snapshot.values,
  );
  return (
    <section>
      <h2>{group.title}</h2>
      {'note' in group ? <p class="hint">{group.note}</p> : null}
      {fields.map((field) => (
        <Field key={field.id} field={field} snapshot={snapshot} onChange={props.onChange} />
      ))}
    </section>
  );
}

/**
 * The first launch's short welcome (#84): the few choices most people make
 * at once, through the same checked settings operations as the Settings
 * window, so each choice applies and saves as it is made.
 */
export function Welcome({ api }: { readonly api: ChromeApi }): JSX.Element | null {
  const [snapshot, error, change] = useSnapshot(api);
  if (snapshot == null) {
    return null;
  }
  return (
    <main class="welcome">
      <h1>{text.title}</h1>
      <p class="hint">{text.intro}</p>
      <p class="hint">
        <a href={GET_STARTED} target="_blank" rel="noreferrer">
          {text.guide}
        </a>
      </p>
      <AssistantStep api={api} onChange={change} />
      <section>
        <h2>{text.language}</h2>
        <p>{text.languageNote}</p>
      </section>
      {GROUPS.map((group) => (
        <Group key={group.title} group={group} snapshot={snapshot} onChange={change} />
      ))}
      <p role="alert">{error}</p>
      <div class="actions">
        <button
          type="button"
          class="primary"
          onClick={() => {
            window.close();
          }}
        >
          {text.start}
        </button>
      </div>
    </main>
  );
}
